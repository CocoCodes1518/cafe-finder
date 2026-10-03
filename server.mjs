import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};
function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(payload));
}

async function googleMapsJson(path, params = {}) {
  const directKey = process.env.GOOGLE_MAPS_API_KEY;
  const apiBase = process.env.MANUS_API_URL;
  const key = directKey || process.env.MANUS_API_KEY;
  if (!key || (!directKey && !apiBase)) throw new Error('Google Maps credentials are unavailable.');
  const url = directKey ? new URL(`https://maps.googleapis.com/maps/api/${path}`) : new URL(`${apiBase.replace(/\/$/, '')}/v1/maps/proxy/maps/api/${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  url.searchParams.set('key', key);
  const response = await fetch(url, { headers: directKey ? { Accept: 'application/json' } : { Accept: 'application/json', Authorization: `Bearer ${key}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status))) throw new Error(data.error_message || `Google Places returned ${response.status}.`);
  return data;
}

async function proxyGeocode(req, res) {
  const query = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('q')?.trim();
  if (!query) { sendJson(res, 400, { error: 'Enter an Indian city, neighborhood, address, or landmark.' }); return; }
  try {
    const data = await googleMapsJson('geocode/json', { address: query, components: 'country:IN', region: 'in' });
    const result = (data.results || []).find((item) => item.address_components?.some((component) => component.types?.includes('country') && component.short_name === 'IN'));
    const resultTypes = result?.types || [];
    const isCountryOnly = resultTypes.length > 0 && resultTypes.every((type) => type === 'country' || type === 'political');
    if (!result || isCountryOnly) { sendJson(res, 404, { error: `We couldn't find “${query}” within India. Try a city, neighborhood, address, or landmark.` }); return; }
    const location = result.geometry?.location;
    if (!location || location.lat < 6.4 || location.lat > 37.7 || location.lng < 68.0 || location.lng > 97.6) { sendJson(res, 404, { error: `We couldn't find “${query}” within India.` }); return; }
    sendJson(res, 200, { lat: location.lat, lon: location.lng, name: result.formatted_address || query });
  } catch (error) {
    sendJson(res, 502, { error: error.message || 'Google location search is temporarily unavailable.' });
  }
}

function priceLabel(level) { return Number.isFinite(Number(level)) ? '₹'.repeat(Math.max(1, Number(level))) : null; }
function googleTags(place) {
  const types = place.types || [];
  const tags = ['Cafe'];
  if (types.includes('bakery')) tags.push('Bakery');
  if (types.includes('restaurant')) tags.push('Food');
  if (types.includes('meal_takeaway')) tags.push('Takeaway');
  return tags;
}

async function mapWithConcurrency(items, limit, worker) {
  const output = []; let cursor = 0;
  async function runner() { while (cursor < items.length) { const index = cursor++; output[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return output;
}

async function fetchGoogleCafeDetail(placeId) {
  const data = await googleMapsJson('place/details/json', { place_id: placeId, fields: 'place_id,name,formatted_address,formatted_phone_number,opening_hours,current_opening_hours,website,rating,user_ratings_total,price_level,geometry,photos,types,reviews' });
  const detail = data.result || {};
  const hours = detail.current_opening_hours?.weekday_text || detail.opening_hours?.weekday_text || [];
  const reviewItems = (detail.reviews || []).slice(0, 5).map((review) => ({ author: review.author_name || 'Google user', rating: Number(review.rating) || null, text: review.text || '', relativeTime: review.relative_time_description || '', profilePhoto: review.profile_photo_url || '' })).filter((review) => review.text || review.rating);
  const photoReference = detail.photos?.[0]?.photo_reference;
  const location = detail.geometry?.location || {};
  return { placeId, name: detail.name || '', lat: Number(location.lat), lon: Number(location.lng), address: detail.formatted_address || 'Address not listed', rating: detail.rating ?? null, reviews: detail.user_ratings_total ?? null, reviewItems, price: priceLabel(detail.price_level), open: detail.current_opening_hours?.open_now ?? detail.opening_hours?.open_now ?? null, hours: hours.length ? hours.join(' · ') : 'Hours not listed', openingHours: hours, phone: detail.formatted_phone_number || '', website: detail.website || '', image: photoReference ? `/api/cafe-photo?ref=${encodeURIComponent(photoReference)}` : null };
}

async function fetchGoogleCafes(lat, lon, radius) {
  const results = [];
  let pageToken = '';
  for (let page = 0; page < 3; page += 1) {
    const params = pageToken ? { pagetoken: pageToken } : { location: `${lat},${lon}`, radius, type: 'cafe' };
    if (pageToken) await new Promise((resolve) => setTimeout(resolve, 1700));
    const data = await googleMapsJson('place/nearbysearch/json', params);
    results.push(...(data.results || []));
    pageToken = data.next_page_token || '';
    if (!pageToken) break;
  }
  if (!results.length) throw new Error('Google Places found no cafes in this area.');
  const unique = [...new Map(results.map((place) => [place.place_id, place])).values()].slice(0, 60);
  const details = await mapWithConcurrency(unique.slice(0, 30), 5, async (place) => {
    try {
      const data = await googleMapsJson('place/details/json', { place_id: place.place_id, fields: 'place_id,name,formatted_address,formatted_phone_number,opening_hours,current_opening_hours,website,rating,user_ratings_total,price_level,geometry,photos,types,reviews' });
      return data.result || {};
    } catch { return {}; }
  });
  const detailById = new Map(details.filter(Boolean).map((detail) => [detail.place_id, detail]));
  return unique.map((place, index) => {
    const detail = detailById.get(place.place_id) || {};
    const photoReference = detail.photos?.[0]?.photo_reference || place.photos?.[0]?.photo_reference;
    const hours = detail.current_opening_hours?.weekday_text || detail.opening_hours?.weekday_text || [];
    const location = detail.geometry?.location || place.geometry?.location || {};
    const reviewItems = (detail.reviews || []).slice(0, 5).map((review) => ({ author: review.author_name || 'Google user', rating: Number(review.rating) || null, text: review.text || '', relativeTime: review.relative_time_description || '', profilePhoto: review.profile_photo_url || '' })).filter((review) => review.text || review.rating);
    return { id: `google-${place.place_id}`, placeId: place.place_id, name: detail.name || place.name, lat: Number(location.lat), lon: Number(location.lng), address: detail.formatted_address || place.vicinity || 'Address not listed', rating: detail.rating ?? place.rating ?? null, reviews: detail.user_ratings_total ?? place.user_ratings_total ?? null, reviewItems, price: priceLabel(detail.price_level ?? place.price_level), tags: googleTags(detail.name ? detail : place), open: detail.current_opening_hours?.open_now ?? detail.opening_hours?.open_now ?? place.opening_hours?.open_now ?? null, hours: hours.length ? hours.join(' · ') : 'Hours not listed', openingHours: hours, phone: detail.formatted_phone_number || '', website: detail.website || '', image: photoReference ? `/api/cafe-photo?ref=${encodeURIComponent(photoReference)}` : null, preview: false, source: 'Google Places', order: index };
  });
}

async function proxyCafePhoto(req, res) {
  const ref = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('ref');
  if (!ref) { res.writeHead(400); res.end('Missing photo reference'); return; }
  try {
    const directKey = process.env.GOOGLE_MAPS_API_KEY;
    const apiBase = process.env.MANUS_API_URL;
    const key = directKey || process.env.MANUS_API_KEY;
    if (!key || (!directKey && !apiBase)) throw new Error('Google Maps credentials are unavailable.');
    const url = directKey ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=900&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}` : `${apiBase.replace(/\/$/, '')}/v1/maps/proxy/maps/api/place/photo?maxwidth=900&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { headers: directKey ? {} : { Authorization: `Bearer ${key}` } });
    if (!response.ok) { res.writeHead(response.status); res.end(); return; }
    res.writeHead(200, { 'Content-Type': response.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(502); res.end(); }
}

async function proxyCafeDetails(req, res) {
  const placeId = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).searchParams.get('placeId');
  if (!placeId) { sendJson(res, 400, { error: 'A Google place ID is required.' }); return; }
  try { sendJson(res, 200, { detail: await fetchGoogleCafeDetail(placeId) }); }
  catch (error) { sendJson(res, 502, { error: error.message || 'Google review details are temporarily unavailable.' }); }
}

async function proxyCafes(req, res) {
  const requestUrl = new URL(req.url || '/api/cafes', `http://${req.headers.host || 'localhost'}`);
  const lat = Number(requestUrl.searchParams.get('lat'));
  const lon = Number(requestUrl.searchParams.get('lon'));
  const radius = Math.min(8000, Math.max(1000, Number(requestUrl.searchParams.get('radius')) || 8000));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    sendJson(res, 400, { error: 'A valid latitude and longitude are required.' });
    return;
  }
  if (lat < 6.4 || lat > 37.7 || lon < 68.0 || lon > 97.6) {
    sendJson(res, 400, { error: 'roam currently supports cafe searches within India.' });
    return;
  }
  try {
    const googleCafes = await fetchGoogleCafes(lat, lon, radius);
    sendJson(res, 200, { source: 'google', cafes: googleCafes });
    return;
  } catch (error) {
    sendJson(res, 502, { error: error.message || 'Google Places is temporarily unavailable.' });
  }
}

export async function requestHandler(req, res) {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/api/geocode') {
    await proxyGeocode(req, res);
    return;
  }
  if (pathname === '/api/cafe-photo') {
    await proxyCafePhoto(req, res);
    return;
  }
  if (pathname === '/api/cafe-details') {
    await proxyCafeDetails(req, res);
    return;
  }
  if (pathname === '/api/cafes') {
    await proxyCafes(req, res);
    return;
  }
  const safe = normalize(pathname).replace(/^\.\.(\/|\\|$)/, '');
  const requested = safe === '/' ? 'index.html' : safe.slice(1);
  let filePath = join(root, requested);
  if (safe === '/manus-routes.json' || safe.startsWith('/assets/')) filePath = join(root, 'public', requested);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    if (!extname(pathname)) {
      try {
        const body = await readFile(join(root, 'index.html'));
        res.writeHead(200, { 'Content-Type': mime['.html'] });
        res.end(body);
        return;
      } catch {}
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

if (!process.env.VERCEL) {
  const server = createServer(requestHandler);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Cafe Finder listening on http://0.0.0.0:${port}`);
  });
}

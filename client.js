const state = {
  center: { lat: 12.9716, lon: 77.5946 },
  locationName: 'Bengaluru, India',
  cafes: [],
  filtered: [],
  selectedId: null,
  favorites: JSON.parse(localStorage.getItem('roam-favorites') || '[]'),
  filters: { open: true, work: false, quiet: false, outdoor: false, distance: 5, rating: 0, price: 'any' },
  sort: 'recommended',
  view: 'all',
  usingFallback: false,
  userLocation: null
};

const $ = (selector) => document.querySelector(selector);
const els = {
  map: $('#map'), list: $('#results-list'), status: $('#status-banner'), count: $('#result-count'), title: $('#results-title'), location: $('#header-location'), source: $('#source-label'), empty: $('#empty-state'), loader: $('#map-loader'), drawer: $('#detail-drawer'), backdrop: $('#drawer-backdrop'), detail: $('#detail-content'), savedCount: $('#saved-count'), refreshTime: $('#refresh-time')
};
let map;
let markers = new Map();
let loadToken = 0;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function kmBetween(aLat, aLon, bLat, bLon) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function distanceLabel(value) { return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`; }
function setStatus(message, type = 'loading') {
  els.status.className = `status-banner ${type}`;
  els.status.innerHTML = type === 'loading' ? `<span class="status-spinner"></span><span>${message}</span>` : `<span>${message}</span>`;
}
function setLocationLabel(name) {
  state.locationName = name;
  els.location.textContent = name.toUpperCase();
  els.title.textContent = name === 'London, UK' ? 'A good place to begin' : `Cafes around ${name}`;
}
function updateSavedCount() { els.savedCount.textContent = state.favorites.length; }

function iconMarker(featured = false) {
  return L.divIcon({ className: '', html: `<div class="cafe-marker ${featured ? 'featured' : ''}"><span>•</span></div>`, iconSize: [25, 25], iconAnchor: [12, 24], popupAnchor: [0, -24] });
}
function initMap() {
  map = L.map(els.map, { zoomControl: false, attributionControl: false }).setView([state.center.lat, state.center.lon], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc', attribution: '© OpenStreetMap contributors · style OSM France' }).addTo(map);
  map.on('click', () => closeDrawer());
}
function clearMarkers() { markers.forEach((marker) => marker.remove()); markers.clear(); }
function renderMarkers() {
  clearMarkers();
  state.filtered.forEach((cafe, index) => {
    const marker = L.marker([cafe.lat, cafe.lon], { icon: iconMarker(index === 0) }).addTo(map);
    marker.bindPopup(`<div class="popup-name">${escapeHtml(cafe.name)}</div><div class="popup-meta">${cafe.rating ? `★ ${cafe.rating.toFixed(1)}` : 'No rating yet'} · ${distanceLabel(cafe.distance)}</div>`);
    marker.on('click', () => openDetail(cafe.id));
    markers.set(cafe.id, marker);
  });
}
function fitToCafes() {
  if (!state.filtered.length) { map.setView([state.center.lat, state.center.lon], 13); return; }
  const bounds = L.latLngBounds(state.filtered.map((cafe) => [cafe.lat, cafe.lon]));
  bounds.extend([state.center.lat, state.center.lon]);
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: true });
}
function selectCafe(id, pan = true) {
  state.selectedId = id;
  document.querySelectorAll('.cafe-card').forEach((card) => card.classList.toggle('selected', card.dataset.id === id));
  const marker = markers.get(id);
  const cafe = state.cafes.find((item) => item.id === id);
  if (marker && cafe) { if (pan) map.flyTo([cafe.lat, cafe.lon], Math.max(map.getZoom(), 15), { duration: .6 }); marker.openPopup(); }
}

function hasTag(cafe, wanted) { return cafe.tags.some((tag) => tag.toLowerCase().includes(wanted)); }
function applyFilters() {
  const { open, work, quiet, outdoor, distance, rating, price } = state.filters;
  let next = state.cafes.filter((cafe) => cafe.distance <= distance && (!rating || (cafe.rating && cafe.rating >= rating)) && (price === 'any' || cafe.price === price));
  if (open) next = next.filter((cafe) => cafe.open !== false);
  if (work) next = next.filter((cafe) => hasTag(cafe, 'work') || hasTag(cafe, 'wifi') || hasTag(cafe, 'wi-fi'));
  if (quiet) next = next.filter((cafe) => hasTag(cafe, 'quiet'));
  if (outdoor) next = next.filter((cafe) => hasTag(cafe, 'outdoor') || hasTag(cafe, 'garden'));
  if (state.view === 'saved') next = next.filter((cafe) => state.favorites.includes(cafe.id));
  if (state.sort === 'distance') next.sort((a, b) => a.distance - b.distance);
  else if (state.sort === 'rating') next.sort((a, b) => (b.rating || -1) - (a.rating || -1));
  else next.sort((a, b) => ((b.rating || 0) * .65 - b.distance * .08) - ((a.rating || 0) * .65 - a.distance * .08));
  state.filtered = next;
  renderList();
  renderMarkers();
  els.count.textContent = next.length;
  els.empty.hidden = Boolean(next.length);
  if (next.length && !state.selectedId) state.selectedId = next[0].id;
}
function renderList() {
  els.list.innerHTML = state.filtered.map((cafe, index) => `
    <article class="cafe-card ${state.selectedId === cafe.id ? 'selected' : ''}" data-id="${cafe.id}" style="animation-delay:${index * 45}ms">
      <div class="card-image">${cafe.image ? `<img src="${cafe.image}" alt="${escapeHtml(cafe.name)} photo" loading="lazy" />` : `<div class="image-placeholder"><span>PHOTO<br />UNAVAILABLE</span></div>`}</div>
      <div class="card-copy">
        <div class="card-topline"><span class="rank-badge">${index === 0 ? 'TOP PICK' : `0${index + 1}`}</span><span class="open-badge ${cafe.open === false ? 'closed' : cafe.open == null ? 'unknown' : ''}">${cafe.open === true ? 'OPEN NOW' : cafe.open === false ? 'CLOSED' : 'HOURS UNKNOWN'}</span></div>
        <h3 class="cafe-name">${escapeHtml(cafe.name)}</h3>
        <div class="cafe-address">${escapeHtml(cafe.address)}</div>
        <div class="card-meta"><span class="rating">${cafe.rating ? `<span class="star">★</span> ${cafe.rating.toFixed(1)}` : '<span class="muted-rating">— New listing</span>'}</span><span class="meta-divider">·</span><span class="distance">${distanceLabel(cafe.distance)}</span><span class="meta-divider">·</span><span class="distance">${escapeHtml(cafe.price || '—')}</span></div>
        <div class="tag-row">${cafe.tags.slice(0, 2).map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('')}</div>
      </div>
      <button class="favorite-button ${state.favorites.includes(cafe.id) ? 'saved' : ''}" data-favorite="${cafe.id}" type="button" aria-label="${state.favorites.includes(cafe.id) ? 'Remove from saved' : 'Save'} ${escapeHtml(cafe.name)}">${state.favorites.includes(cafe.id) ? '♥' : '♡'}</button>
    </article>
  `).join('');
  els.list.querySelectorAll('.cafe-card').forEach((card) => card.addEventListener('click', (event) => {
    if (event.target.closest('[data-favorite]')) return;
    selectCafe(card.dataset.id);
    openDetail(card.dataset.id);
  }));
  els.list.querySelectorAll('[data-favorite]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); toggleFavorite(button.dataset.favorite); }));
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id) ? state.favorites.filter((item) => item !== id) : [...state.favorites, id];
  localStorage.setItem('roam-favorites', JSON.stringify(state.favorites));
  updateSavedCount();
  applyFilters();
}
function renderHours(cafe) {
  if (cafe.detailsLoading) return '<p class="empty-review">Loading operational hours from Google…</p>';
  if (cafe.detailsError) return '<p class="empty-review">Operational hours could not be loaded right now.</p>';
  const hours = cafe.openingHours || [];
  if (!hours.length) return '<p class="empty-review">Operational hours were not published for this place.</p>';
  return `<div class="hours-grid">${hours.map((line) => { const divider = line.indexOf(':'); const day = divider > -1 ? line.slice(0, divider) : line; const value = divider > -1 ? line.slice(divider + 1).trim() : 'See Google Maps'; return `<div class="hours-row"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(value)}</span></div>`; }).join('')}</div>`;
}
function renderReviews(cafe) {
  if (cafe.detailsLoading) return '<p class="empty-review">Loading recent Google user reviews…</p>';
  if (cafe.detailsError) return '<p class="empty-review">Reviews could not be loaded right now.</p>';
  const reviews = cafe.reviewItems || [];
  if (!reviews.length) return '<p class="empty-review">No written review excerpts are available yet. Open the place in Google Maps for the full review history.</p>';
  return `<div class="review-list">${reviews.map((review) => `<article class="review-card"><div class="review-meta"><div><div class="review-author">${escapeHtml(review.author)}</div><div class="review-rating">${review.rating ? '★'.repeat(review.rating) : '—'}</div></div><span class="review-time">${escapeHtml(review.relativeTime || 'Google review')}</span></div><p class="review-text">${escapeHtml(review.text || 'No written comment.')}</p></article>`).join('')}</div>`;
}
function openDetail(id) {
  const cafe = state.cafes.find((item) => item.id === id);
  if (!cafe) return;
  selectCafe(id, false);
  const saved = state.favorites.includes(id);
  els.detail.innerHTML = `
    <div class="detail-hero">${cafe.image ? `<img src="${cafe.image}" alt="${escapeHtml(cafe.name)} photo" />` : '<div class="detail-photo-placeholder">No place photo listed</div>'}<div class="detail-hero-label">${cafe.open === true ? 'OPEN NOW' : cafe.open === false ? 'CLOSED' : 'HOURS UNKNOWN'} · ${escapeHtml(cafe.hours || 'Hours unavailable')}</div></div>
    <div class="detail-body"><h3 id="detail-title">${escapeHtml(cafe.name)}</h3><div class="detail-address">${escapeHtml(cafe.address)}</div>
    <div class="detail-stats"><div class="detail-stat"><strong>${cafe.rating ? `<span class="star">★</span> ${cafe.rating.toFixed(1)}` : '—'}</strong><span>${cafe.reviews ? `${cafe.reviews.toLocaleString()} reviews` : 'No review count'}</span></div><div class="detail-stat"><strong>${distanceLabel(cafe.distance)}</strong><span>from your search</span></div><div class="detail-stat"><strong>${escapeHtml(cafe.price || '—')}</strong><span>price level</span></div></div>
    <p class="detail-summary">${escapeHtml(cafe.tags.length ? `${cafe.tags.join(' · ')}. ` : '')}A promising stop for a considered cup, a little headspace, and whatever the rest of your day has planned.${cafe.phone ? ` Contact: ${cafe.phone}.` : ''}</p>
    <div class="tag-row">${cafe.tags.map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('')}</div>
    <section class="detail-section" aria-labelledby="hours-heading"><div class="detail-section-heading"><h4 id="hours-heading">Operational hours</h4><span>${cafe.open === true ? 'Open now' : cafe.open === false ? 'Closed now' : 'Status unavailable'}</span></div>${renderHours(cafe)}</section>
    <section class="detail-section" aria-labelledby="reviews-heading"><div class="detail-section-heading"><h4 id="reviews-heading">Google user reviews</h4><span>${cafe.reviews ? `${cafe.reviews.toLocaleString()} total` : 'No total listed'}</span></div>${renderReviews(cafe)}</section>
    <div class="detail-actions"><a class="primary-action" href="https://www.google.com/maps/dir/?api=1&destination=${cafe.lat},${cafe.lon}" target="_blank" rel="noreferrer">Get directions ↗</a><button class="secondary-action" id="detail-save" type="button">${saved ? '♥ Saved' : '♡ Save place'}</button></div></div>`;
  els.drawer.classList.add('open'); els.drawer.setAttribute('aria-hidden', 'false'); els.backdrop.classList.add('open'); document.body.classList.add('modal-open');
  $('#detail-save').addEventListener('click', () => { toggleFavorite(id); openDetail(id); });
  if (cafe.placeId && !cafe.detailsLoaded && !cafe.detailsLoading) {
    cafe.detailsLoading = true;
    fetch(`/api/cafe-details?placeId=${encodeURIComponent(cafe.placeId)}`, { headers: { Accept: 'application/json' } }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Google details unavailable');
      Object.assign(cafe, data.detail, { detailsLoaded: true, detailsLoading: false });
      if (state.selectedId === id && els.drawer.classList.contains('open')) openDetail(id);
    }).catch(() => { cafe.detailsLoading = false; cafe.detailsError = true; if (state.selectedId === id && els.drawer.classList.contains('open')) openDetail(id); });
  }
}
function closeDrawer() { els.drawer.classList.remove('open'); els.drawer.setAttribute('aria-hidden', 'true'); els.backdrop.classList.remove('open'); document.body.classList.remove('modal-open'); }

async function geocode(query) {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Search service unavailable');
  return data;
}
async function fetchCafes(center) {
  const params = new URLSearchParams({ lat: String(center.lat), lon: String(center.lon), radius: '8000' });
  const response = await fetch(`/api/cafes?${params.toString()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Live places are taking a coffee break');
  }
  const data = await response.json();
  if (data.source !== 'google') throw new Error('Google Places did not return real listings.');
  return { cafes: data.cafes || [], source: 'GOOGLE PLACES' };
}
async function loadCafes(center, label = state.locationName) {
  const requestToken = ++loadToken;
  state.center = center; state.selectedId = null; state.view = 'all'; setLocationLabel(label);
  state.cafes = []; state.usingFallback = false; els.source.textContent = 'LOADING GOOGLE PLACES';
  setStatus('Loading real Google Places listings…', 'success'); applyFilters(); fitToCafes();
  els.loader.classList.add('visible');
  try {
    const result = await fetchCafes(center);
    if (requestToken !== loadToken) return;
    state.cafes = result.cafes.map((cafe) => ({ ...cafe, distance: kmBetween(center.lat, center.lon, cafe.lat, cafe.lon) }));
    state.usingFallback = false; els.source.textContent = result.source; setStatus(`${state.cafes.length} real cafes found · updated just now`, 'success');
  } catch (error) {
    if (requestToken !== loadToken) return;
    state.cafes = []; state.usingFallback = false; els.source.textContent = 'GOOGLE PLACES UNAVAILABLE'; setStatus(`${error.message}. No placeholder cafes are being shown.`, 'error');
  } finally {
    if (requestToken !== loadToken) return;
    els.loader.classList.remove('visible'); els.refreshTime.textContent = 'JUST NOW';
    map.setView([center.lat, center.lon], 13); applyFilters(); fitToCafes();
  }
}

$('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const query = $('#search-input').value.trim(); if (!query) return;
  const queryToken = ++loadToken;
  state.cafes = []; state.filtered = []; state.selectedId = null; els.source.textContent = 'SEARCHING GOOGLE PLACES'; setStatus(`Looking for ${query}…`); applyFilters(); $('#search-input').blur();
  try { const place = await geocode(query); if (queryToken !== loadToken) return; await loadCafes({ lat: place.lat, lon: place.lon }, place.name); }
  catch (error) { setStatus(error.message, 'error'); }
});
$('#location-button').addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('Location is not supported here. Try searching instead.', 'error'); return; }
  setStatus('Asking for your location…');
  navigator.geolocation.getCurrentPosition(async (position) => {
    if (!isWithinIndia(position.coords.latitude, position.coords.longitude)) { setStatus('roam is currently available in India only. Search an Indian city instead.', 'error'); return; }
    state.userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
    await loadCafes(state.userLocation, 'Your location');
  }, (error) => setStatus(error.code === 1 ? 'Location permission was denied. Search a neighborhood to explore instead.' : 'We could not read your location. Search a neighborhood to explore instead.', 'error'), { enableHighAccuracy: true, timeout: 9000 });
});
$('#recenter-button').addEventListener('click', () => { map.flyTo([state.center.lat, state.center.lon], 13); fitToCafes(); });
$('#drawer-close').addEventListener('click', closeDrawer); $('#drawer-backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && els.drawer.classList.contains('open')) closeDrawer(); });
$('#distance-range').addEventListener('input', (event) => { state.filters.distance = Number(event.target.value); $('#distance-value').textContent = `${event.target.value} km`; applyFilters(); });
$('.rating-options').addEventListener('click', (event) => { const button = event.target.closest('[data-rating]'); if (!button) return; state.filters.rating = Number(button.dataset.rating); $('#rating-value').textContent = state.filters.rating ? `${state.filters.rating.toFixed(1)}+` : 'Any'; document.querySelectorAll('[data-rating]').forEach((item) => item.classList.toggle('active', item === button)); applyFilters(); });
$('.price-control').addEventListener('click', (event) => { const button = event.target.closest('[data-price]'); if (!button) return; state.filters.price = button.dataset.price; $('#price-value').textContent = state.filters.price === 'any' ? 'Any' : state.filters.price; document.querySelectorAll('[data-price]').forEach((item) => item.classList.toggle('active', item === button)); applyFilters(); });
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { const key = button.dataset.filter; state.filters[key] = !state.filters[key]; button.classList.toggle('active', state.filters[key]); applyFilters(); }));
$('#clear-filters').addEventListener('click', () => { state.filters = { open: false, work: false, quiet: false, outdoor: false, distance: 5, rating: 0, price: 'any' }; state.view = 'all'; $('#distance-range').value = 5; $('#distance-value').textContent = '5 km'; $('#rating-value').textContent = 'Any'; $('#price-value').textContent = 'Any'; document.querySelectorAll('[data-filter]').forEach((button) => button.classList.remove('active')); document.querySelectorAll('[data-rating]').forEach((button) => button.classList.toggle('active', button.dataset.rating === '0')); document.querySelectorAll('[data-price]').forEach((button) => button.classList.toggle('active', button.dataset.price === 'any')); applyFilters(); });
$('#empty-reset').addEventListener('click', () => $('#clear-filters').click());
$('#sort-select').addEventListener('change', (event) => { state.sort = event.target.value; applyFilters(); });
$('#saved-button').addEventListener('click', () => { if (!state.favorites.length) { setStatus('Save a cafe to see it here later.', 'success'); return; } state.view = state.view === 'saved' ? 'all' : 'saved'; setStatus(state.view === 'saved' ? 'Showing saved places in this area.' : 'Showing all nearby cafes.', 'success'); applyFilters(); fitToCafes(); });

function requestLocationOnLoad() {
  if (!navigator.geolocation || state.userLocation) return;
  navigator.geolocation.getCurrentPosition(async (position) => {
    if (!isWithinIndia(position.coords.latitude, position.coords.longitude)) return;
    state.userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
    await loadCafes(state.userLocation, 'Your location');
  }, () => {}, { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 });
}

updateSavedCount(); initMap(); loadCafes(state.center, state.locationName); setTimeout(requestLocationOnLoad, 800);

# Roam Cafe Finder

An India-only cafe discovery app that finds real nearby cafes using Google Places data. Search a city, neighborhood, address, or landmark—such as **Secunderabad, Telangana**—and browse real place names, exact addresses, ratings, review totals, operational hours, phone numbers, photos, and directions.

## Features

- **India-only location search** using managed Google Geocoding.
- **Real Google Places cafe listings** tied to Google place IDs.
- Up to **60 nearby cafes** per search within an 8 km search radius.
- Google ratings, review totals, price levels, opening status, addresses, phones, websites, and place photos.
- Interactive OpenStreetMap basemap with cafe markers and synchronized results.
- Filters for open status, work-friendly, quiet, outdoor, distance, rating, and price level.
- Accessible cafe detail modal with:
  - Real Google Place Photo when available
  - Exact formatted address
  - Current open/closed status
  - Day-by-day operational hours
  - Up to five recent Google user review excerpts
  - Reviewer names, star ratings, and relative dates
  - Directions and save-place actions
- No fabricated listings or generic substitute photos. If Google Places is unavailable, the app shows an explicit error instead of fake results.

## Project structure

```text
.
├── client.js                 # Client state, search, filters, map, cards, and detail modal
├── index.html                # App shell and accessible modal markup
├── styles.css                # Responsive visual system and modal styling
├── lib/server.mjs                # Node server and Google Places/Photo proxy
├── public/manus-routes.json  # Website route manifest
├── public/assets/            # Supporting brand assets
├── plan.md                   # Implementation and design plan
└── TODO.md                   # Acceptance outcomes
```

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

The app listens on `http://localhost:3000` by default. The server honors the `PORT` environment variable when supplied.

## Google Places configuration

The browser never receives the private Google Maps server key. The Node server calls the managed Maps proxy using runtime environment variables:

```text
MANUS_API_URL=...
MANUS_API_KEY=...
PORT=3000
```

The current Manus Preview supplies the `MANUS_*` variables automatically. The Vercel deployment supports a direct Google Maps Platform key through `GOOGLE_MAPS_API_KEY`; this key is read only inside the serverless API function and is never sent to the browser. Do not commit API keys to GitHub or place them in frontend JavaScript.

The Google APIs used by the server are:

- Geocoding API
- Places Nearby Search
- Place Details
- Place Photos

## GitHub upload

The manual upload guide is in [`GITHUB-MANUAL-SETUP.md`](./GITHUB-MANUAL-SETUP.md). The basic commands are:

```bash
git init
git branch -M main
git add .
git commit -m "Initial cafe finder app"
git remote add origin https://github.com/YOUR_USERNAME/cafe-finder.git
git push -u origin main
```

Replace `YOUR_USERNAME` and the repository name with your own values.

## Hosting on Vercel

GitHub is the source-code repository; Vercel hosts the live website. The repository includes `vercel.json` and `api/[...path].mjs`, so Vercel can run the Google Geocoding, Places, Details, and Photo routes as serverless functions.

1. Import the GitHub repository into Vercel.
2. Framework preset: **Other**.
3. Build command: `npm run build`.
4. Output directory: leave empty.
5. Add this Vercel environment variable for **Production, Preview, and Development**:

```text
GOOGLE_MAPS_API_KEY=your_server_side_google_maps_key
```

6. In Google Cloud, enable Geocoding API, Places API, and Places Photo access for the key.
7. Redeploy after saving the variable.

Do not use GitHub Pages for this version: GitHub Pages cannot execute the serverless API that protects the Google key and retrieves live Places data.

For Render, Railway, or Fly.io, use `npm run dev` as the start command and configure `GOOGLE_MAPS_API_KEY` and `PORT` in the host environment.

## Data and attribution

- Cafe listings, place details, review excerpts, operating hours, and photos are supplied by Google Places.
- The interactive basemap uses OpenStreetMap contributors through Leaflet.
- Google Places results can change as businesses update their Google profiles.
- Google Places API quotas, coverage, field availability, and photo availability are controlled by Google.

## Validation

The project build validates both JavaScript entrypoints:

```bash
npm run build
```

The verified Secunderabad flow returns real Google cafes, exact addresses, place photos, review excerpts, and seven-day operational hours for places that publish them.

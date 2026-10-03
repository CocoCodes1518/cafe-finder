# Cafe Finder — Implementation Plan

## Product scope
A responsive India-only cafe finder that surfaces real nearby cafes using Google Places data. It detects location with permission, supports Indian city/neighborhood/address search, provides map/list synchronization, filters, recommendations, exact place details, real place photos, and route handoff.

## Implementation decisions
- **Data:** India-scoped Google Geocoding through the same-origin server proxy, then the managed Google Maps Places Nearby Search and Place Details APIs. Each result uses Google place IDs, exact formatted addresses, ratings, review totals, opening hours, phones, and Google Place Photo references.
- **Map:** Leaflet with OpenStreetMap tiles, custom cafe markers, popups, and pan/zoom synchronization.
- **Runtime:** Node server on port 3000 with the Webdev server capability enabled. `/api/cafes` keeps the managed Google server credential server-side; `/api/cafe-photo` streams Google Place Photos without exposing the private key. The UI caps the nearby search radius at 8 km.
- **Reliability:** Google Places is authoritative. If it is unavailable, the app shows an explicit error and no fabricated or incomplete fallback listings.
- **Interaction:** The app requests location permission on first load and keeps a visible “Use my current location” retry action. Search and filters update the list and map together. Cafe cards open an accessible centered modal with the exact Google place address, real photo when supplied, phone, ratings, day-by-day operational hours, recent user reviews, and directions; reviews/hours are lazy-loaded by place ID with loading and unavailable states.
- **Trust boundary:** No fake cafe cards or generic cafe photos are shown in the live state. Missing Google fields render as “No rating yet”, “—”, or “Hours unknown”; every displayed live place is tied to a Google place ID.

## Design direction
- **Design Movement:** Editorial wayfinding / contemporary café journal — warm, tactile, confident, and rooted in place.
- **Core Principles:** (1) scan-first hierarchy, (2) map and list always stay in conversation, (3) expressive typography with restrained color, (4) useful microcopy over generic filler.
- **Color Philosophy:** Deep pine grounds the experience like a quiet café interior; warm paper keeps the canvas human and readable; burnt orange signals action and discovery; acid chartreuse is reserved for “open/live” states and the brand mark.
- **Layout Paradigm:** A split workspace: a narrow discovery rail, a scrollable editorial result column, and a persistent map stage. On small screens it collapses into stacked search → map → results.
- **Signature Elements:** A compass-like brand mark, orange “live pulse” indicators, and cream cards with oversized numerals for result count/rank.
- **Interaction Philosophy:** Every control has a visible spatial consequence: filters refine markers, cards pan the map, and location mode changes the header context.
- **Animation:** Subtle 180–240ms ease-out transitions, marker pop-in, pulsing live state, and soft card lift on hover; no decorative motion that competes with map reading.
- **Typography System:** Manrope for utility UI and labels; Fraunces for the large editorial headline and place names. Uppercase micro-labels use wide tracking.
- **Brand Essence:** “Find the coffee worth crossing town for.” For curious locals and weekend wanderers. Personality: observant, warm, decisive.
- **Brand Voice:** Headlines are concise and specific; CTAs are verbs. Example lines: “Find your next regular.” / “Let the map do the wandering.”
- **Wordmark & Logo:** `roam` in a compact lowercase wordmark paired with a four-point compass/coffee-bean mark.
- **Signature Brand Color:** Burnt orange `#D96D4D` — distinctive enough to own the discovery action without feeling like a warning.

## Project structure
- `index.html` — semantic shell, Leaflet and font CDN imports.
- `styles.css` — responsive editorial layout, states, cards, map chrome, and motion.
- `client.js` — state, India-only geocoding, Google Places response handling, ranking/filtering, map rendering, and interactions.
- `server.mjs` — Node server, Google Places proxy, and Google Place Photo proxy.
- `public/manus-routes.json` — route manifest for the single-page experience.
- `public/assets/` — legacy brand assets retained for layout polish; live cafe cards never use them as substitute photos.

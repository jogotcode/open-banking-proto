# open-banking-proto

Prototype of a financial hub map.

- World map with translucent "hub" bubbles; each hub has a (random, for now) monetary value. Bubble size and color scale with value.
- Search bar: type a city to jump to its hub (with suggestions). Cities without a hub are geocoded via OpenStreetMap.
- Min/max value sliders hide bubbles outside the chosen range.
- Each bubble covers a real area (dashed circle, visible when zoomed in). Users must be inside that area to join:
  - **Use my location** uses browser geolocation; **Pick on map** sets a location by clicking (for testing anywhere).
  - In-range bubbles pulse. Tapping one opens a dialog with why the bubble was formed, the monthly fee, how transactions are approved (committee, first come first served, restricted spending, member vote) and its rules.
  - **Subscribe** (or **Request to join** for application-only bubbles) saves the subscription in the browser as pending until payment info is added on the account page (not built yet). Joined bubbles get a white ring and ✓.
  - Tapping an out-of-range bubble shows how far outside it you are.
- Hub details are randomly generated but seeded by city name, so they stay the same across reloads.

## Run

No build step — it's static HTML/JS using Leaflet from a CDN.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Files: `index.html` (layout), `styles.css`, `cities.js` (seed city list), `hubs.js` (generated hub details and rules), `join.js` (join dialog + saved subscriptions), `app.js` (map, bubbles, location, search, filter).

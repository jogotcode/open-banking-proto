# open-banking-proto

Prototype of a financial hub map.

- World map with translucent "hub" bubbles; each hub has a (random, for now) monetary value. Bubble size and color scale with value.
- Search bar: type a city to jump to its hub (with suggestions). Cities without a hub are geocoded via OpenStreetMap.
- Min/max value sliders hide bubbles outside the chosen range.

## Run

No build step — it's static HTML/JS using Leaflet from a CDN.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Files: `index.html` (layout), `styles.css`, `cities.js` (seed city list), `app.js` (map, bubbles, search, filter).

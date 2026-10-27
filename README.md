# open-banking-proto

Prototype of a financial hub map with a Google-Maps-style interface, built on real OpenStreetMap data.

## Features

- **Real map data, four views** (switcher bottom-left): Map (detailed streets, CARTO Voyager), Satellite (Esri imagery with place labels), Terrain (OpenTopoMap) and Dark. All free and keyless. The choice is remembered.
- **Live location**: the locate button (bottom-right) tracks you continuously with a blue dot and accuracy ring, like Google Maps. It starts automatically if location access was already granted. You get a notice when you walk into a bubble.
- **Search anything**: addresses, landmarks, businesses and cities via the Photon geocoder (OpenStreetMap), biased toward the area on screen, plus hub matches. A chosen place gets a pin showing whether a bubble covers it and how far it is from you.
- **Hub bubbles**: translucent circles with a (random, for now) monetary value; size and color scale with value. Each bubble covers a real area (dashed circle, visible when zoomed in).
- **Value filter**: the "Value" chip opens min/max sliders that hide bubbles outside the range.
- **Joining a bubble**: you must be inside its area. Tapping an in-range bubble opens a dialog with why it was formed, the monthly fee, how transactions are approved (committee, first come first served, restricted spending, member vote) and its rules. **Subscribe** walks through sign-in, choosing a payment method and a confirm step ("Pay $20/month with Visa •••• 4242"); the subscription is active from then. **Request to join** (application-only bubbles) needs an account but isn't billed until approved. Tapping an out-of-range bubble shows how far outside it you are.
- **One-month commitment**: every subscription commits the member to at least one month before they can make requests from the pool. The join dialog says so up front.
- **My hubs** (chip next to search): every hub the user has joined or asked to join, with their monthly contribution, total committed so far, an encouraging note about what their money does, a progress bar for the commitment month, and a **Cancel subscription** button (with confirmation). Cancelling during the first month keeps the membership until the month ends (with an option to keep it); after that it ends right away. Pending requests can be withdrawn.
- **Accounts**: **Sign in** (top right) to create an account or log in; the avatar opens the account page with payment methods, subscriptions and log out. Subscriptions belong to the account.
- **Payment methods**: add a card (test mode: validated like a real checkout, only brand/last 4/expiry kept) or Apple Pay (demo approval step; Safari shows the official Apple Pay button). Pick a default, remove methods (the last one can't be removed while subscriptions are active).
- **Simulate location** (prototype helper): click the map to pretend you're somewhere else.
- Hub details are randomly generated but seeded by city name, so they stay the same across reloads.

## Run

No build step. It's static HTML/JS using Leaflet from a CDN.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Browsers only allow location on `localhost` or HTTPS, so host it on HTTPS when testing on a phone.

Files: `index.html` (layout), `styles.css`, `cities.js` (seed city list), `hubs.js` (generated hub details and rules), `join.js` (join dialog + saved subscriptions), `app.js` (map, basemaps, location, search, filter), `my-hubs.js` (My hubs panel), `auth.js` (accounts, sessions, saved payment methods), `account.js` (sign up / log in / account / payment dialog).

## Notes for production

**Accounts and payments are a front-end prototype.** Accounts are stored in the browser (passwords hashed with PBKDF2), cards are test-mode only and Apple Pay is simulated. Going live needs a backend for accounts and sessions, and a payment processor such as Stripe for cards and Apple Pay (merchant ID + domain verification). The processor plugs in at `finishPayment()` in `account.js`.

The free tile and search services used here have fair-use limits (OpenTopoMap and Photon in particular). For real traffic, switch to a paid provider such as Google Maps Platform, Mapbox or MapTiler. The tile URLs live in `BASEMAPS` and search in `searchPlaces()` in `app.js`.

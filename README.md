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
- **Requesting funds**: once their first month is done, members standing inside a hub's bubble can request an amount (up to the hub's cap) and say what it's for. First-come-first-served hubs approve instantly; committee and member-vote hubs review it (simulated in a few seconds for the demo). One request per hub can be in review at a time.
- **Virtual cards**: an approved request is loaded onto a virtual card for that hub, valid for the number of days the hub's creator set (7, 14 or 30). **Restricted hubs** (food, shoes and clothing, medical, …) instead give members a category card they can just use, with a per-purchase limit and monthly allowance set by the hub.
- **Wallet** (chip next to My hubs): every card with what's left, its rules and recent transactions, **Show details** for the number/CVC, and **Simulate a purchase** at demo stores to see approvals and declines (wrong category, over the per-purchase limit, over the balance, expired).
- **Start a hub** (chip, or "Start a hub here" on a searched place): a 5-step form covering name and purpose, area (your location, the map center or the searched place, plus a radius), money rules (fee, approval style, request cap and card length, or a spending card's limits), startup rules (minimum members and a deadline), then review.
- **Startup period**: a new hub is *forming* (gray dashed bubble, "Forming · 3/10"). Joining is free for founding members and no one can request funds. It **launches** the moment it reaches its minimum members, and billing starts for everyone then. Requests open only after its **first valid month**. If the deadline passes first, the hub closes and nobody is ever charged. A **timeline with live countdowns** (deadline, then requests opening) shows in the hub's pop-up and in My hubs. Creators get demo controls to simulate neighbors joining and to skip ahead 7 days.
- **Friends** (chip): every account gets a new random friend code each day (like `K7Q-4ZP`, with a countdown to the next one); yesterday's code stops working. Enter a friend's code to become friends both ways. Sample friends (Maya, Leo, Priya; password `demo1234`) make it easy to try in one browser.
- **Friend groups**: one person sets up a group (name, what it's for, monthly amount, how requests are approved: member vote, organizer approves, first come first served, or a spending card) and invites friends. Invitees see the invite in Friends and join by subscribing. Everyone pays monthly, the one-month commitment applies, and approved requests land on a virtual card for the group. Groups show in My hubs and the Wallet but not on the map, and need no location.
- **Simulate location** (prototype helper): click the map to pretend you're somewhere else.
- Hub details are randomly generated but seeded by city name, so they stay the same across reloads.

## Run

No build step. It's static HTML/JS using Leaflet from a CDN.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Browsers only allow location on `localhost` or HTTPS, so host it on HTTPS when testing on a phone.

Files: `index.html` (layout), `styles.css`, `cities.js` (seed city list), `hubs.js` (generated hub details and rules), `join.js` (join dialog + saved subscriptions), `app.js` (map, basemaps, location, search, filter), `my-hubs.js` (My hubs panel), `auth.js` (accounts, sessions, saved payment methods), `account.js` (sign up / log in / account / payment dialog), `funds.js` (requests, virtual cards, spending rules), `wallet.js` (request dialog + Wallet panel), `startup.js` (user-created hubs, startup lifecycle, timeline), `create-hub.js` (Start a hub form), `groups.js` (friend codes, friendships, groups), `friends.js` (Friends panel + group dialog).

## Notes for production

**Accounts and payments are a front-end prototype.** Accounts are stored in the browser (passwords hashed with PBKDF2), cards are test-mode only and Apple Pay is simulated. Going live needs a backend for accounts and sessions, and a payment processor such as Stripe for cards and Apple Pay (merchant ID + domain verification). The processor plugs in at `finishPayment()` in `account.js`.

**User-created hubs, friends and groups are stored in this browser**, so other people can't see or join them yet; that needs a backend. A real friend-code system would also generate and check codes on the server, with rate limits on guesses. The demo controls stand in for real neighbors and the passage of time.

**Virtual cards are simulated.** Card numbers are generated demo numbers, purchases are simulated and votes are simulated. A live version would issue cards through a card-issuing platform (e.g. Stripe Issuing or Marqeta), whose spending controls (merchant categories, per-purchase limits, expiry) enforce the same rules; that replaces `newCard()` and `simulatePurchase()` in `funds.js`.

The free tile and search services used here have fair-use limits (OpenTopoMap and Photon in particular). For real traffic, switch to a paid provider such as Google Maps Platform, Mapbox or MapTiler. The tile URLs live in `BASEMAPS` and search in `searchPlaces()` in `app.js`.

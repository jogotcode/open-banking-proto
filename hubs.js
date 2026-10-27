// Generates hub data (value, coverage radius, rules) for each city.
// Randomness is seeded by city name so a hub keeps the same details across
// reloads — subscriptions saved in the browser keep pointing at the same thing.

const MIN_VALUE = 10_000;
const MAX_VALUE = 50_000_000;

function seededRandom(seed) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  // mulberry32
  return function () {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// Why a bubble was formed. `category` is what restricted bubbles accept.
const PURPOSES = [
  {
    title: "Community Grocery Co-op",
    why: "Neighbors in {city} pooled money to buy groceries in bulk and cover members through tight weeks.",
    category: "food and groceries",
  },
  {
    title: "Street Vendor Relief Fund",
    why: "Formed by {city} street vendors to cover equipment repairs and slow seasons without high-interest loans.",
    category: "business equipment",
  },
  {
    title: "Tenant Rent Circle",
    why: "Renters in {city} started this bubble to help members avoid late fees and eviction when rent comes up short.",
    category: "rent and utilities",
  },
  {
    title: "Medical Bills Mutual Aid",
    why: "Created after several {city} members faced surprise medical bills; the pool helps with copays and prescriptions.",
    category: "medical expenses",
  },
  {
    title: "Student Books & Tuition Pool",
    why: "Students and parents in {city} share the cost of textbooks, fees and school supplies.",
    category: "education",
  },
  {
    title: "Childcare Cost Share",
    why: "Working parents in {city} formed this bubble to split daycare and babysitting costs.",
    category: "childcare",
  },
  {
    title: "Local Artists Micro-Grants",
    why: "{city} creatives fund each other's materials, studio time and show fees.",
    category: "art supplies and studio time",
  },
  {
    title: "Neighborhood Repair Fund",
    why: "Homeowners and tenants in {city} pool money for urgent home and car repairs.",
    category: "repairs",
  },
];

// How transactions get approved.
const APPROVAL_STYLES = [
  {
    type: "committee",
    label: "Committee vote",
    describe: (h) =>
      `Each request is reviewed by an elected committee of ${h.committeeSize}. A majority must approve before funds are released.`,
  },
  {
    type: "fcfs",
    label: "First come, first served",
    describe: (h) =>
      `Requests are paid in the order they arrive until the month's pool runs out. Max ${formatMoney(h.maxRequest)} per request.`,
  },
  {
    type: "restricted",
    label: "Restricted spending",
    describe: (h) =>
      `Only ${h.purpose.category} purchases are accepted. Matching requests are approved automatically; anything else is declined.`,
  },
  {
    type: "member-vote",
    label: "Member vote",
    describe: () =>
      "All members get 48 hours to vote on each request. It passes with a simple majority of votes cast.",
  },
];

function formatMoney(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

const hubs = CITIES.map(([name, country, lat, lng]) => {
  const rand = seededRandom(name);

  // Skewed so most hubs are small and a few are large.
  const value = Math.round(MIN_VALUE * Math.pow(MAX_VALUE / MIN_VALUE, Math.pow(rand(), 2)));
  const size = Math.log(value / MIN_VALUE) / Math.log(MAX_VALUE / MIN_VALUE); // 0..1

  const hub = {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    country,
    lat,
    lng,
    value,
    radiusKm: Math.round(5 + size * 35), // bigger pools cover more ground
    purpose: pick(rand, PURPOSES),
    approval: pick(rand, APPROVAL_STYLES),
    monthlyFee: 5 * Math.round(1 + rand() * 9), // $5–$50
    members: Math.round(12 + rand() * 900),
    founded: 2018 + Math.floor(rand() * 8),
    committeeSize: pick(rand, [3, 5, 7]),
    maxRequest: 50 * Math.round(2 + rand() * 38),
    joinPolicy: rand() < 0.65 ? "open" : "application",
    minMonthsBeforeRequest: pick(rand, [0, 1, 2, 3]),
  };
  hub.why = hub.purpose.why.replace("{city}", name);
  hub.approvalText = hub.approval.describe(hub);
  return hub;
});

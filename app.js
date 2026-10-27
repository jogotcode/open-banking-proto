// --- Data -------------------------------------------------------------------

const MIN_VALUE = 10_000;
const MAX_VALUE = 50_000_000;

// Random value, skewed so most hubs are small and a few are large.
function randomValue() {
  const t = Math.pow(Math.random(), 2);
  return Math.round(MIN_VALUE * Math.pow(MAX_VALUE / MIN_VALUE, t));
}

const hubs = CITIES.map(([name, country, lat, lng]) => ({
  name,
  country,
  lat,
  lng,
  value: randomValue(),
}));

// --- Formatting & scales ----------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatShort(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v}`;
}

// Sliders run 0–100 on a log scale so small and large values are both usable.
function sliderToValue(pos) {
  return Math.round(MIN_VALUE * Math.pow(MAX_VALUE / MIN_VALUE, pos / 100));
}

function radiusFor(value) {
  const t = Math.sqrt((value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE));
  return 10 + t * 40;
}

function colorFor(value) {
  if (value >= 10_000_000) return "#22d39a";
  if (value >= 1_000_000) return "#3fa7ff";
  if (value >= 100_000) return "#a78bfa";
  return "#f5a524";
}

// --- Map --------------------------------------------------------------------

const map = L.map("map", { worldCopyJump: true, minZoom: 2 }).setView([25, 10], 2);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

const bubbleLayer = L.layerGroup().addTo(map);

for (const hub of hubs) {
  const color = colorFor(hub.value);
  hub.marker = L.circleMarker([hub.lat, hub.lng], {
    radius: radiusFor(hub.value),
    color,
    weight: 1.5,
    opacity: 0.8,
    fillColor: color,
    fillOpacity: 0.3,
  })
    .bindPopup(
      `<strong>${hub.name}</strong>, ${hub.country}` +
        `<div class="popup-value">${currency.format(hub.value)}</div>`
    )
    .bindTooltip(formatShort(hub.value), {
      permanent: true,
      direction: "center",
      className: "hub-label",
    });

  hub.marker.on("mouseover", () => hub.marker.setStyle({ fillOpacity: 0.55 }));
  hub.marker.on("mouseout", () => hub.marker.setStyle({ fillOpacity: 0.3 }));
}

// --- Value filter -----------------------------------------------------------

const minInput = document.getElementById("min-value");
const maxInput = document.getElementById("max-value");
const minLabel = document.getElementById("min-label");
const maxLabel = document.getElementById("max-label");
const countEl = document.getElementById("count");

function applyFilter() {
  // Keep the two thumbs from crossing.
  if (+minInput.value > +maxInput.value) {
    if (document.activeElement === minInput) maxInput.value = minInput.value;
    else minInput.value = maxInput.value;
  }

  const lo = sliderToValue(+minInput.value);
  const hi = sliderToValue(+maxInput.value);
  minLabel.textContent = formatShort(lo);
  maxLabel.textContent = formatShort(hi);

  let shown = 0;
  for (const hub of hubs) {
    const visible = hub.value >= lo && hub.value <= hi;
    if (visible) {
      bubbleLayer.addLayer(hub.marker);
      shown++;
    } else {
      bubbleLayer.removeLayer(hub.marker);
    }
  }
  countEl.textContent = `${shown} of ${hubs.length} hubs shown`;
}

minInput.addEventListener("input", applyFilter);
maxInput.addEventListener("input", applyFilter);
document.getElementById("reset").addEventListener("click", () => {
  minInput.value = 0;
  maxInput.value = 100;
  applyFilter();
  map.flyTo([25, 10], 2);
});

applyFilter();

// --- City search ------------------------------------------------------------

const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const list = document.getElementById("suggestions");
const statusEl = document.getElementById("status");
let activeIndex = -1;
let matches = [];

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => (statusEl.hidden = true), 3500);
}

function matchHubs(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return hubs
    .filter((h) => h.name.toLowerCase().includes(q) || h.country.toLowerCase().includes(q))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
    .slice(0, 8);
}

function renderSuggestions() {
  list.innerHTML = "";
  matches.forEach((hub, i) => {
    const li = document.createElement("li");
    li.className = i === activeIndex ? "active" : "";
    li.innerHTML = `<span>${hub.name}, ${hub.country}</span><span class="val">${formatShort(hub.value)}</span>`;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      goToHub(hub);
    });
    list.appendChild(li);
  });
  list.hidden = matches.length === 0;
}

function hideSuggestions() {
  list.hidden = true;
  activeIndex = -1;
}

function goToHub(hub) {
  input.value = hub.name;
  hideSuggestions();
  if (!bubbleLayer.hasLayer(hub.marker)) {
    showStatus(`${hub.name}'s hub is hidden by the value filter`);
  }
  map.flyTo([hub.lat, hub.lng], 9);
  map.once("moveend", () => {
    if (bubbleLayer.hasLayer(hub.marker)) hub.marker.openPopup();
  });
}

// Cities without a hub fall back to OpenStreetMap geocoding.
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(res.statusText);
  const [result] = await res.json();
  return result;
}

input.addEventListener("input", () => {
  matches = matchHubs(input.value);
  activeIndex = -1;
  renderSuggestions();
});

input.addEventListener("keydown", (e) => {
  if (list.hidden) return;
  if (e.key === "ArrowDown") {
    activeIndex = (activeIndex + 1) % matches.length;
  } else if (e.key === "ArrowUp") {
    activeIndex = (activeIndex - 1 + matches.length) % matches.length;
  } else if (e.key === "Escape") {
    hideSuggestions();
    return;
  } else {
    return;
  }
  e.preventDefault();
  renderSuggestions();
});

input.addEventListener("blur", hideSuggestions);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  const hub = activeIndex >= 0 ? matches[activeIndex] : matchHubs(query)[0];
  if (hub) {
    goToHub(hub);
    return;
  }

  hideSuggestions();
  showStatus(`Searching for "${query}"…`);
  try {
    const place = await geocode(query);
    if (!place) {
      showStatus(`No results for "${query}"`);
      return;
    }
    map.flyTo([+place.lat, +place.lon], 10);
    showStatus(`No hub in ${place.display_name.split(",")[0]} yet`);
  } catch {
    showStatus("Search failed — check your connection");
  }
});

// --- Formatting & scales ----------------------------------------------------

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
  const t = Math.sqrt(Math.max(0, value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE));
  return 10 + t * 40;
}

function colorFor(value) {
  if (value >= 10_000_000) return "#0f9d58";
  if (value >= 1_000_000) return "#1a73e8";
  if (value >= 100_000) return "#8e44ef";
  return "#f29900";
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km`;
}

// --- Map + basemaps ---------------------------------------------------------

const map = L.map("map", {
  worldCopyJump: true,
  minZoom: 2,
  zoomControl: false,
}).setView([25, 10], 3);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Place names drawn over satellite imagery; above the bubbles but click-through.
map.createPane("labels");
map.getPane("labels").style.zIndex = 450;
map.getPane("labels").style.pointerEvents = "none";
L.control.scale({ position: "bottomright", imperial: true }).addTo(map);

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// All free, keyless tile sources built on real OpenStreetMap / satellite data.
const BASEMAPS = {
  map: {
    label: "Map",
    dark: false,
    thumb: "https://a.basemaps.cartocdn.com/rastertiles/voyager/4/8/5.png",
    layers: () => [
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/">CARTO</a>`,
        subdomains: "abcd",
        maxZoom: 20,
      }),
    ],
  },
  satellite: {
    label: "Satellite",
    dark: true,
    thumb: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/8",
    layers: () => [
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      }),
      // Street and place names on top of the imagery, like Google's hybrid view.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        pane: "labels",
      }),
    ],
  },
  terrain: {
    label: "Terrain",
    dark: false,
    thumb: "https://a.tile.opentopomap.org/4/8/5.png",
    layers: () => [
      L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        attribution: `${OSM_ATTR}, SRTM &copy; <a href="https://opentopomap.org">OpenTopoMap</a>`,
        subdomains: "abc",
        maxZoom: 17,
      }),
    ],
  },
  dark: {
    label: "Dark",
    dark: true,
    thumb: "https://a.basemaps.cartocdn.com/dark_all/4/8/5.png",
    layers: () => [
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/">CARTO</a>`,
        subdomains: "abcd",
        maxZoom: 20,
      }),
    ],
  },
};

let activeBasemap = null;
let hubsReady = false;
const basemapGroup = L.layerGroup().addTo(map);

function setBasemap(key) {
  const def = BASEMAPS[key];
  basemapGroup.clearLayers();
  def.layers().forEach((layer) => basemapGroup.addLayer(layer));
  map.getContainer().classList.toggle("map-dark", def.dark);
  activeBasemap = key;
  layerButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.key === key));
  if (hubsReady) hubs.forEach(styleHub); // joined ring color depends on the basemap
  try {
    localStorage.setItem("basemap", key);
  } catch {}
}

const LayerControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd() {
    const el = L.DomUtil.create("div", "leaflet-bar layer-control");
    el.innerHTML = Object.entries(BASEMAPS)
      .map(
        ([key, def]) =>
          `<button type="button" data-key="${key}" title="${def.label}">
             <span class="thumb" style="background-image:url('${def.thumb}')"></span>${def.label}
           </button>`
      )
      .join("");
    L.DomEvent.disableClickPropagation(el);
    el.addEventListener("click", (e) => {
      const key = e.target.closest("button")?.dataset.key;
      if (key && key !== activeBasemap) setBasemap(key);
    });
    return el;
  },
});

new LayerControl().addTo(map);
const layerButtons = document.querySelectorAll(".layer-control button");

let savedBasemap = null;
try {
  savedBasemap = localStorage.getItem("basemap");
} catch {}
setBasemap(BASEMAPS[savedBasemap] ? savedBasemap : "map");

// --- Hubs -------------------------------------------------------------------

// Coverage areas sit under the hub bubbles. They're real-world size, so they
// only become visible once you zoom in toward a city.
const coverageLayer = L.layerGroup().addTo(map);
const bubbleLayer = L.layerGroup().addTo(map);

function addHubToMap(hub) {
  const color = colorFor(hub.value);

  hub.coverage = L.circle([hub.lat, hub.lng], {
    radius: hub.radiusKm * 1000,
    color,
    weight: 1.5,
    opacity: 0.7,
    dashArray: "6 6",
    fillColor: color,
    fillOpacity: 0.08,
  });

  hub.marker = L.circleMarker([hub.lat, hub.lng], {
    radius: radiusFor(hub.value),
    color,
    weight: 1.5,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: 0.3,
  }).bindTooltip(formatShort(hub.value), {
    permanent: true,
    direction: "center",
    className: "hub-label",
  });

  hub.marker.on("click", () => onHubTap(hub));
  hub.coverage.on("click", () => onHubTap(hub));
  hub.marker.on("mouseover", () => hub.marker.setStyle({ fillOpacity: 0.55 }));
  hub.marker.on("mouseout", () => hub.marker.setStyle({ fillOpacity: 0.3 }));
}

// Friend groups live in `hubs` too (for memberships and cards) but aren't places.
const onMap = (hub) => !hub.isGroup;

hubs.filter(onMap).forEach(addHubToMap);

function setHubVisible(hub, visible) {
  if (!onMap(hub)) return;
  for (const [layer, group] of [[hub.marker, bubbleLayer], [hub.coverage, coverageLayer]]) {
    if (visible) group.addLayer(layer);
    else group.removeLayer(layer);
  }
}

// Reflects range + subscription state on a hub's bubble.
const FORMING_COLOR = "#80868b";

function styleHub(hub) {
  if (!onMap(hub)) return;
  const joined = Subscriptions.get(hub.id);
  const inRange = isInRange(hub);
  const forming = hubPhase(hub) === "forming";
  const color = forming ? FORMING_COLOR : colorFor(hub.value);
  hub.marker.setStyle({
    color: joined ? (BASEMAPS[activeBasemap].dark ? "#ffffff" : "#202124") : color,
    fillColor: color,
    weight: joined ? 3 : inRange ? 2.5 : 1.5,
    dashArray: forming ? "5 4" : null, // not live yet
    radius: radiusFor(hub.value),
  });
  hub.coverage.setStyle({ color, fillColor: color });
  hub.marker.getElement()?.classList.toggle("hub-in-range", inRange);
  const label = forming ? `Forming · ${hub.members}/${hub.minMembers}` : formatShort(hub.value);
  hub.marker.setTooltipContent(`${joined ? "✓ " : ""}${label}`);
}

hubsReady = true;
document.addEventListener("subscriptions-changed", () => hubs.forEach(styleHub));
document.addEventListener("hubs-changed", () => applyFilter()); // launches, closures, new members

function hubsCovering(latlng) {
  return hubs.filter((h) => onMap(h) && map.distance(latlng, [h.lat, h.lng]) <= h.radiusKm * 1000);
}

// --- User location ----------------------------------------------------------

let userLatLng = null;
let watchId = null;
let hasCentered = false;
let inRangeIds = new Set();

// Google-style blue dot with a translucent accuracy ring, drawn above
// bubbles and their labels.
map.createPane("user");
map.getPane("user").style.zIndex = 660;
map.getPane("user").style.pointerEvents = "none";
const userRenderer = L.svg({ pane: "user" });

const accuracyCircle = L.circle([0, 0], {
  radius: 1,
  color: "#1a73e8",
  weight: 1,
  opacity: 0.4,
  fillColor: "#1a73e8",
  fillOpacity: 0.12,
  interactive: false,
  pane: "user",
  renderer: userRenderer,
});
const userMarker = L.circleMarker([0, 0], {
  radius: 8,
  color: "#fff",
  weight: 3,
  fillColor: "#1a73e8",
  fillOpacity: 1,
  interactive: false, // taps pass through to the bubble underneath
  pane: "user",
  renderer: userRenderer,
});

const locationStatus = document.getElementById("location-status");
const pickBtn = document.getElementById("pick-location");
let picking = false;

function distanceKm(hub) {
  return userLatLng ? map.distance(userLatLng, [hub.lat, hub.lng]) / 1000 : Infinity;
}

function isInRange(hub) {
  if (!onMap(hub)) return true; // groups aren't tied to a place
  return distanceKm(hub) <= hub.radiusKm;
}

// Bubbles you're inside that aren't hidden by the value filter.
function visibleInRange() {
  return hubs.filter((h) => onMap(h) && bubbleLayer.hasLayer(h.marker) && isInRange(h));
}

function updateLocationStatus() {
  if (!userLatLng) return;
  const n = visibleInRange().length;
  const prefix = watchId === null ? "Simulated · " : "";
  locationStatus.textContent = n ? `${prefix}In ${n} bubble${n > 1 ? "s" : ""}` : `${prefix}No bubbles here`;
}

function setUserLocation(latlng, { accuracy = 0 } = {}) {
  userLatLng = L.latLng(latlng);
  userMarker.setLatLng(userLatLng).addTo(map);
  accuracyCircle.setLatLng(userLatLng).setRadius(accuracy);
  if (accuracy) accuracyCircle.addTo(map);
  else accuracyCircle.remove();
  hubs.forEach(styleHub);

  updateLocationStatus();
  const nearby = visibleInRange();

  // Let the user know when they walk into a bubble.
  const entered = nearby.filter((h) => !inRangeIds.has(h.id));
  if (entered.length && hasCentered) {
    showStatus(insideMessage(entered[0]));
  }
  inRangeIds = new Set(nearby.map((h) => h.id));
}

function insideMessage(hub) {
  return Subscriptions.get(hub.id)
    ? `Welcome back to your ${hub.name} hub`
    : `You're inside the ${hub.name} bubble — tap it to see how to join`;
}

function centerOnUser() {
  if (!userLatLng) return;
  map.flyTo(userLatLng, Math.max(map.getZoom(), 14));
}

function startTracking() {
  if (!navigator.geolocation) {
    showStatus("Location isn't available in this browser — use “Simulate location”");
    return;
  }
  if (watchId !== null) {
    centerOnUser();
    return;
  }
  setPicking(false);
  locationStatus.textContent = "Locating…";
  hasCentered = false;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      locateControl.getContainer().classList.add("tracking");
      setUserLocation([pos.coords.latitude, pos.coords.longitude], { accuracy: pos.coords.accuracy });
      if (!hasCentered) {
        hasCentered = true;
        centerOnUser();
        const here = visibleInRange();
        if (here.length) showStatus(insideMessage(here[0]));
      }
    },
    (err) => {
      // Once we have a fix, ride out transient GPS dropouts (tunnels, indoors)
      // and keep the last known position; watchPosition keeps trying.
      if (hasCentered && err.code !== err.PERMISSION_DENIED) return;
      stopTracking();
      locationStatus.textContent = "Location off";
      showStatus(
        err.code === err.PERMISSION_DENIED
          ? "Location permission denied — use “Simulate location” to test"
          : "Couldn't get your location — use “Simulate location” to test"
      );
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  locateControl.getContainer().classList.remove("tracking");
}

const LocateControl = L.Control.extend({
  options: { position: "bottomright" },
  onAdd() {
    const el = L.DomUtil.create("div", "leaflet-bar locate-control");
    el.innerHTML =
      '<button type="button" title="Show your location" aria-label="Show your location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg></button>';
    L.DomEvent.disableClickPropagation(el);
    el.querySelector("button").addEventListener("click", startTracking);
    return el;
  },
});

const locateControl = new LocateControl().addTo(map);

// Prototype helper: click the map to pretend you're somewhere else.
function setPicking(on) {
  picking = on;
  pickBtn.classList.toggle("active", on);
  map.getContainer().classList.toggle("picking", on);
  if (on) showStatus("Click anywhere on the map to set your location");
}

pickBtn.addEventListener("click", () => setPicking(!picking));

map.on("click", (e) => {
  if (!picking) return;
  setPicking(false);
  stopTracking();
  hasCentered = true;
  setUserLocation(e.latlng);
});

// Start tracking right away if the user already granted location access;
// otherwise wait for them to tap the locate button (avoids a prompt on load).
navigator.permissions
  ?.query({ name: "geolocation" })
  .then((p) => p.state === "granted" && startTracking())
  .catch(() => {});

// --- Tapping a hub ----------------------------------------------------------

function onHubTap(hub) {
  // While picking, the click bubbles up to the map handler, which sets the location.
  if (picking) return;

  if (isInRange(hub)) {
    openJoinDialog(hub, distanceKm(hub));
    return;
  }

  const content = document.createElement("div");
  content.className = "range-popup";
  const where = `<strong>${hub.name}</strong> · ${hub.purpose.title}<div class="popup-value">${formatMoney(hub.value)}</div>`;
  if (userLatLng) {
    const away = distanceKm(hub) - hub.radiusKm;
    content.innerHTML = `${where}<p>You're ${formatDistance(away)} outside this bubble. Get within ${hub.radiusKm} km of ${hub.name} to view details and join.</p>`;
  } else {
    content.innerHTML = `${where}<p>Share your location to see if you can join this bubble.</p><button type="button">Use my location</button>`;
    content.querySelector("button").addEventListener("click", () => {
      map.closePopup();
      startTracking();
    });
  }
  L.popup({ maxWidth: 260 }).setLatLng([hub.lat, hub.lng]).setContent(content).openOn(map);
}

// --- Value filter -----------------------------------------------------------

const minInput = document.getElementById("min-value");
const maxInput = document.getElementById("max-value");
const minLabel = document.getElementById("min-label");
const maxLabel = document.getElementById("max-label");
const countEl = document.getElementById("count");
const filterToggle = document.getElementById("filter-toggle");
const filterPanel = document.getElementById("filter-panel");

filterToggle.addEventListener("click", () => {
  filterPanel.hidden = !filterPanel.hidden;
  filterToggle.setAttribute("aria-expanded", String(!filterPanel.hidden));
  filterToggle.classList.toggle("active", !filterPanel.hidden);
});

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
  const filtered = +minInput.value > 0 || +maxInput.value < 100;
  filterToggle.textContent = filtered ? `Value: ${formatShort(lo)} – ${formatShort(hi)} ▾` : "Value: All ▾";

  let shown = 0;
  const mapHubs = hubs.filter(onMap);
  for (const hub of mapHubs) {
    // Closed hubs leave the map; new hubs' small pools count as the minimum.
    const value = Math.max(hub.value, MIN_VALUE);
    const visible = hubPhase(hub) !== "failed" && value >= lo && value <= hi;
    setHubVisible(hub, visible);
    if (visible) {
      styleHub(hub); // path element is recreated when re-added
      shown++;
    }
  }
  countEl.textContent = `${shown} of ${mapHubs.length} hubs shown`;
  updateLocationStatus();
}

minInput.addEventListener("input", applyFilter);
maxInput.addEventListener("input", applyFilter);
document.getElementById("reset").addEventListener("click", () => {
  minInput.value = 0;
  maxInput.value = 100;
  applyFilter();
});

applyFilter();

// --- Search: hubs + real places ---------------------------------------------

const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const clearBtn = document.getElementById("search-clear");
const list = document.getElementById("suggestions");
const statusEl = document.getElementById("status");
let activeIndex = -1;
let results = []; // [{ kind: "hub", hub } | { kind: "place", place }]
let searchSeq = 0;
let searchTimer = null;
let placePin = null;

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => (statusEl.hidden = true), 4000);
}

function matchHubs(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return hubs
    .filter((h) => onMap(h) && (h.name.toLowerCase().includes(q) || h.country.toLowerCase().includes(q)))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
    .slice(0, 4);
}

// Photon: free OpenStreetMap geocoder built for search-as-you-type.
// Results are biased toward what's currently on screen.
async function searchPlaces(query) {
  const c = map.getCenter();
  const params = new URLSearchParams({ q: query, limit: "6", lang: "en" });
  if (map.getZoom() >= 5) {
    params.set("lat", c.lat.toFixed(4));
    params.set("lon", c.lng.toFixed(4));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`);
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  return data.features.map((f) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name || street || p.city || p.country;
    const sub = [p.name ? street : "", p.city !== name ? p.city : "", p.state, p.country]
      .filter((s) => s && s !== name)
      .join(", ");
    return {
      name,
      sub,
      type: p.osm_value,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      extent: p.extent, // [west, north, east, south] for areas like cities
    };
  });
}

function iconFor(type) {
  if (["city", "town", "village", "suburb", "neighbourhood", "state", "country"].includes(type)) return "🏙️";
  if (["restaurant", "cafe", "fast_food", "bar", "supermarket"].includes(type)) return "🍴";
  if (["bank", "atm"].includes(type)) return "🏦";
  if (["station", "bus_stop", "aerodrome"].includes(type)) return "🚉";
  return "📍";
}

function renderSuggestions() {
  list.innerHTML = "";
  results.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = i === activeIndex ? "active" : "";
    if (r.kind === "hub") {
      li.innerHTML = `
        <span class="sug-icon hub" style="--hub-color:${colorFor(r.hub.value)}"></span>
        <span class="sug-text"><div class="sug-main">${escapeHtml(r.hub.name)} hub</div>
          <div class="sug-sub">${escapeHtml(r.hub.purpose.title)} · ${escapeHtml(r.hub.country)}</div></span>
        <span class="val">${formatShort(r.hub.value)}</span>`;
    } else {
      li.innerHTML = `
        <span class="sug-icon">${iconFor(r.place.type)}</span>
        <span class="sug-text"><div class="sug-main">${escapeHtml(r.place.name)}</div>
          <div class="sug-sub">${escapeHtml(r.place.sub)}</div></span>`;
    }
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      choose(r);
    });
    list.appendChild(li);
  });
  list.hidden = results.length === 0;
}

function hideSuggestions() {
  list.hidden = true;
  activeIndex = -1;
}

function choose(r) {
  hideSuggestions();
  input.blur();
  if (r.kind === "hub") goToHub(r.hub);
  else goToPlace(r.place);
}

function goToHub(hub) {
  input.value = `${hub.name} hub`;
  clearBtn.hidden = false;
  placePin?.remove();
  if (!bubbleLayer.hasLayer(hub.marker)) {
    showStatus(`${hub.name}'s hub is hidden by the value filter`);
  }
  map.flyToBounds(hub.coverage.getBounds(), { maxZoom: 12 });
}

const pinIcon = L.divIcon({
  className: "place-pin",
  html: '<svg width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="#ea4335"/><circle cx="14" cy="14" r="5" fill="#a50e0e"/></svg>',
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -36],
});

function goToPlace(place) {
  input.value = place.name;
  clearBtn.hidden = false;

  const latlng = L.latLng(place.lat, place.lng);
  const covering = hubsCovering(latlng);
  const bubbleNote = covering.length
    ? `Inside the <strong>${covering.map((h) => escapeHtml(h.name)).join(", ")}</strong> bubble${covering.length > 1 ? "s" : ""}`
    : `No bubble covers this place yet. <button type="button" class="link-btn" data-start-hub="${place.lat},${place.lng}">Start a hub here</button>`;
  const fromYou = userLatLng ? ` · ${formatDistance(map.distance(userLatLng, latlng) / 1000)} from you` : "";

  placePin?.remove();
  placePin = L.marker(latlng, { icon: pinIcon })
    .bindPopup(
      `<div class="place-popup"><strong>${escapeHtml(place.name)}</strong>
         <div class="popup-sub">${escapeHtml(place.sub)}${fromYou}</div>
         <p>${bubbleNote}</p></div>`
    )
    .addTo(map);

  if (place.extent) {
    const [w, n, e, s] = place.extent;
    map.flyToBounds([[s, w], [n, e]], { maxZoom: 16 });
  } else {
    map.flyTo(latlng, 16);
  }
  map.once("moveend", () => placePin?.openPopup());
}

input.addEventListener("input", () => {
  const query = input.value.trim();
  clearBtn.hidden = !input.value;
  results = matchHubs(query).map((hub) => ({ kind: "hub", hub }));
  activeIndex = -1;
  renderSuggestions();

  clearTimeout(searchTimer);
  if (query.length < 3) return;
  const seq = ++searchSeq;
  searchTimer = setTimeout(async () => {
    try {
      const places = await searchPlaces(query);
      if (seq !== searchSeq) return; // a newer search is in flight
      results = [
        ...matchHubs(query).map((hub) => ({ kind: "hub", hub })),
        ...places.map((place) => ({ kind: "place", place })),
      ];
      if (document.activeElement === input) renderSuggestions();
    } catch {
      // Network hiccup: keep showing hub matches.
    }
  }, 250);
});

input.addEventListener("keydown", (e) => {
  if (list.hidden) return;
  if (e.key === "ArrowDown") {
    activeIndex = (activeIndex + 1) % results.length;
  } else if (e.key === "ArrowUp") {
    activeIndex = (activeIndex - 1 + results.length) % results.length;
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
input.addEventListener("focus", () => results.length && renderSuggestions());

clearBtn.addEventListener("click", () => {
  input.value = "";
  clearBtn.hidden = true;
  results = [];
  hideSuggestions();
  placePin?.remove();
  placePin = null;
  input.focus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  if (activeIndex >= 0) return choose(results[activeIndex]);
  if (results.length) return choose(results[0]);

  hideSuggestions();
  showStatus(`Searching for "${query}"…`);
  try {
    const [place] = await searchPlaces(query);
    if (place) goToPlace(place);
    else showStatus(`No results for "${query}"`);
  } catch {
    showStatus("Search failed — check your connection");
  }
});

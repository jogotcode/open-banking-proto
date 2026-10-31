// Offers panel: promos for brand-backed hubs and their member perks.

const offersPanel = document.getElementById("offers");
const offersBody = document.getElementById("offers-body");
const offersToggle = document.getElementById("offers-toggle");

function nearestBrandHub(brand) {
  const list = brandHubs(brand).filter((h) => hubPhase(h) !== "failed");
  if (!userLatLng) return null;
  return list.reduce((best, h) => (!best || distanceKm(h) < distanceKm(best) ? h : best), null);
}

function promoCard(brand) {
  const list = brandHubs(brand);
  const nearest = nearestBrandHub(brand);
  const mine = list.filter((h) => Subscriptions.get(h.id)).length;
  const meta = nearest
    ? isInRange(nearest)
      ? `You're inside the ${escapeHtml(nearest.name)} hub right now.`
      : `Nearest: ${escapeHtml(nearest.name)} · ${formatDistance(distanceKm(nearest))} away`
    : `In ${list.slice(0, 3).map((h) => escapeHtml(h.name)).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}`;
  return `<article class="promo-card" style="--brand:${brand.color}">
    <div class="promo-band">
      <span class="brand-logo lg">${escapeHtml(brand.name[0])}</span>
      <div><strong>${escapeHtml(brand.tagline)}</strong><span>${list.length} hubs · ${escapeHtml(brand.category)}</span></div>
    </div>
    <p class="promo-pitch">${escapeHtml(brand.pitch)}</p>
    <ul class="perks">
      ${brand.benefits
        .map((p) => `<li><span class="perk-icon" aria-hidden="true">${escapeHtml(p.icon)}</span><span><strong>${escapeHtml(p.title)}</strong><small>${escapeHtml(p.text)}</small></span></li>`)
        .join("")}
    </ul>
    <p class="promo-meta">${meta}${mine ? ` · You're in ${mine} of them` : ""}</p>
    <div class="card-actions">
      <button type="button" class="secondary" data-action="show-all" data-brand="${brand.id}">Show on map</button>
      <button type="button" data-action="nearest" data-brand="${brand.id}">Find a ${escapeHtml(brand.name)} hub</button>
    </div>
  </article>`;
}

function renderOffers() {
  offersBody.innerHTML = `
    <div class="offers-hero">
      <span>✦ Brand-backed hubs</span>
      <strong>Get more from your hub</strong>
      <p>Local businesses sponsor hubs that match what they sell. Join one and these perks come on top of your membership.</p>
    </div>
    ${BRANDS.map(promoCard).join("")}
    <p class="proto-note">These brands are fictional examples for the prototype.</p>`;
}

function openOffers() {
  if (!filterPanel.hidden) filterToggle.click();
  closeMyHubs();
  closeWallet();
  closeFriends();
  renderOffers();
  offersPanel.hidden = false;
  offersToggle.classList.add("active");
  offersToggle.setAttribute("aria-expanded", "true");
}

function closeOffers() {
  offersPanel.hidden = true;
  offersToggle.classList.remove("active");
  offersToggle.setAttribute("aria-expanded", "false");
}

offersToggle.addEventListener("click", () => (offersPanel.hidden ? openOffers() : closeOffers()));
document.getElementById("offers-close").addEventListener("click", closeOffers);
for (const toggle of [myHubsToggle, walletToggle, friendsToggle, filterToggle]) toggle.addEventListener("click", closeOffers);

offersBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const brand = BRANDS.find((b) => b.id === btn.dataset.brand);
  const onPhone = window.matchMedia("(max-width: 640px)").matches;
  if (btn.dataset.action === "show-all") {
    if (onPhone) closeOffers();
    map.fitBounds(L.latLngBounds(brandHubs(brand).map((h) => [h.lat, h.lng])), { padding: [80, 80], maxZoom: 6 });
  }
  if (btn.dataset.action === "nearest") {
    const hub = nearestBrandHub(brand) || brandHubs(brand)[0];
    closeOffers();
    map.flyToBounds(hub.coverage.getBounds(), { maxZoom: 11 });
    map.once("moveend", () => onHubTap(hub)); // details if you're inside it, distance if not
  }
});

for (const event of ["subscriptions-changed", "auth-changed"]) {
  document.addEventListener(event, () => !offersPanel.hidden && renderOffers());
}

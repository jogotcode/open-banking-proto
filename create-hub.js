// "Start a hub" flow: basics → area → money rules → startup rules → review.

const createDialog = document.getElementById("create-dialog");
const createBody = document.getElementById("create-body");

const STEPS = [
  { key: "basics", title: "Basics" },
  { key: "area", title: "Area" },
  { key: "money", title: "Money rules" },
  { key: "startup", title: "Startup" },
  { key: "review", title: "Review" },
];
const CATEGORIES = PURPOSES.map((p) => p.category);

let stepIndex = 0;
let draft = null;
let placeOption = null; // { lat, lng, label } when started from a searched place

function freshDraft() {
  return {
    title: "",
    category: CATEGORIES[0],
    why: "",
    center: placeOption ? "place" : userLatLng ? "me" : "map",
    radiusKm: 5,
    monthlyFee: 15,
    approvalType: "committee",
    committeeSize: 5,
    maxRequest: 300,
    cardDays: 14,
    perPurchaseLimit: 50,
    monthlyAllowance: 200,
    minMembers: 10,
    deadlineDays: 30,
  };
}

function draftCenter() {
  if (draft.center === "place" && placeOption) return L.latLng(placeOption.lat, placeOption.lng);
  if (draft.center === "me" && userLatLng) return userLatLng;
  return map.getCenter();
}

function nearestCity(latlng) {
  let best = null;
  for (const [name, country, lat, lng] of CITIES) {
    const d = map.distance(latlng, [lat, lng]);
    if (!best || d < best.d) best = { name, country, d };
  }
  return best;
}

const option = (value, label, current) => `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${label}</option>`;
const radio = (name, value, label, desc, current, disabled = false) => `
  <label class="choice ${disabled ? "disabled" : ""}">
    <input type="radio" name="${name}" value="${value}" ${value === current ? "checked" : ""} ${disabled ? "disabled" : ""} />
    <span><strong>${label}</strong>${desc ? `<small>${desc}</small>` : ""}</span>
  </label>`;

function stepBasics() {
  return `
    <label class="field"><span>Hub name</span>
      <input name="title" maxlength="40" placeholder="e.g. Eastside Grocery Circle" value="${escapeHtml(draft.title)}" /></label>
    <label class="field"><span>What will the money be for?</span>
      <select name="category">${CATEGORIES.map((c) => option(c, capitalize(c), draft.category)).join("")}</select></label>
    <label class="field"><span>Why are you starting it?</span>
      <textarea name="why" rows="3" maxlength="300" placeholder="Tell neighbors what this hub is for and who it helps">${escapeHtml(draft.why)}</textarea></label>`;
}

function stepArea() {
  const center = draftCenter();
  const near = nearestCity(center);
  return `
    <div class="field"><span>Center of the hub</span>
      ${placeOption ? radio("center", "place", escapeHtml(placeOption.label), "The place you searched for", draft.center) : ""}
      ${radio("center", "me", "My location", userLatLng ? "Where you are right now" : "Share your location first to use this", draft.center, !userLatLng)}
      ${radio("center", "map", "Center of the map", "Whatever the map is showing now", draft.center)}
    </div>
    <p class="muted small">Near ${escapeHtml(near.name)}, ${escapeHtml(near.country)} · ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}</p>
    <label class="field"><span>Area radius: <output data-out="radiusKm">${draft.radiusKm} km</output></span>
      <input name="radiusKm" type="range" min="1" max="25" step="1" value="${draft.radiusKm}" /></label>
    <p class="hint-box">People must be inside this area to join, and to request funds.</p>`;
}

function stepMoney() {
  const styles = [
    ["committee", "Committee vote", "An elected committee approves each request"],
    ["fcfs", "First come, first served", "Requests are paid in order until the month's pool runs out"],
    ["member-vote", "Member vote", "Every member votes on each request"],
    ["restricted", "Spending card", `Members get a card that only works for ${draft.category}`],
  ];
  const restricted = draft.approvalType === "restricted";
  return `
    <label class="field"><span>Monthly fee per member ($)</span>
      <input name="monthlyFee" type="number" min="1" max="500" step="1" value="${draft.monthlyFee}" /></label>
    <div class="field"><span>How are transactions approved?</span>
      ${styles.map(([v, l, d]) => radio("approvalType", v, l, d, draft.approvalType)).join("")}
    </div>
    ${draft.approvalType === "committee" ? `<label class="field"><span>Committee size</span><select name="committeeSize">${[3, 5, 7].map((n) => option(n, `${n} members`, draft.committeeSize)).join("")}</select></label>` : ""}
    ${
      restricted
        ? `<div class="field-row two">
            <label class="field"><span>Limit per purchase ($)</span><input name="perPurchaseLimit" type="number" min="5" max="1000" value="${draft.perPurchaseLimit}" /></label>
            <label class="field"><span>Monthly allowance ($)</span><input name="monthlyAllowance" type="number" min="5" max="5000" value="${draft.monthlyAllowance}" /></label>
          </div>`
        : `<div class="field-row two">
            <label class="field"><span>Max per request ($)</span><input name="maxRequest" type="number" min="10" max="5000" value="${draft.maxRequest}" /></label>
            <label class="field"><span>Granted card lasts</span><select name="cardDays">${[7, 14, 30].map((n) => option(n, `${n} days`, draft.cardDays)).join("")}</select></label>
          </div>`
    }`;
}

function stepStartup() {
  const deadline = new Date(Date.now() + draft.deadlineDays * DAY_MS);
  return `
    <p class="muted">A new hub has to prove there's enough interest before anyone pays.</p>
    <div class="field-row two">
      <label class="field"><span>Minimum members</span><input name="minMembers" type="number" min="3" max="500" value="${draft.minMembers}" /></label>
      <label class="field"><span>Time to reach it</span><select name="deadlineDays">${[7, 14, 30, 60].map((n) => option(n, `${n} days`, draft.deadlineDays)).join("")}</select></label>
    </div>
    <ol class="timeline preview">
      <li class="current"><strong>Forming · until ${formatDate(deadline)}</strong><div>Joining is free. You count as the first of ${draft.minMembers} founding members.</div></li>
      <li class="todo"><strong>Launch when ${draft.minMembers} members join</strong><div>Billing of ${formatMoney(draft.monthlyFee)}/month starts for everyone.</div></li>
      <li class="todo"><strong>First valid month</strong><div>No requests until one month after launch.</div></li>
      <li class="todo"><strong>Requests open</strong></li>
    </ol>
    <p class="hint-box">If fewer than ${draft.minMembers} people join by ${formatDate(deadline)}, the hub closes and no one is charged.</p>`;
}

function stepReview() {
  const near = nearestCity(draftCenter());
  const restricted = draft.approvalType === "restricted";
  const style = APPROVAL_STYLES.find((a) => a.type === draft.approvalType).label;
  const rows = [
    ["Name", escapeHtml(draft.title)],
    ["For", capitalize(draft.category)],
    ["Area", `${draft.radiusKm} km around a spot near ${escapeHtml(near.name)}`],
    ["Monthly fee", `${formatMoney(draft.monthlyFee)} per member, from launch`],
    ["Approval", `${style}${draft.approvalType === "committee" ? ` (${draft.committeeSize} members)` : ""}`],
    restricted
      ? ["Spending card", `${formatMoney(draft.perPurchaseLimit)} per purchase, ${formatMoney(draft.monthlyAllowance)} a month`]
      : ["Requests", `Up to ${formatMoney(draft.maxRequest)}, on a card lasting ${draft.cardDays} days`],
    ["Startup", `${draft.minMembers} members within ${draft.deadlineDays} days`],
  ];
  return `
    <dl class="review">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <p class="muted small">“${escapeHtml(draft.why)}”</p>`;
}

function renderCreate(error = "") {
  const step = STEPS[stepIndex];
  const body = { basics: stepBasics, area: stepArea, money: stepMoney, startup: stepStartup, review: stepReview }[step.key]();
  createBody.innerHTML = `
    <header class="acct-head">
      <div>
        <div class="dlg-eyebrow">Step ${stepIndex + 1} of ${STEPS.length} · ${step.title}</div>
        <h2 tabindex="-1" autofocus>Start a hub</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </header>
    <div class="steps">${STEPS.map((s, i) => `<span class="${i < stepIndex ? "done" : i === stepIndex ? "current" : ""}"></span>`).join("")}</div>
    <form data-form="create" novalidate>
      ${body}
      <p class="form-error" role="alert">${escapeHtml(error)}</p>
      <footer class="dlg-foot">
        ${stepIndex ? `<button type="button" class="secondary" data-action="back">Back</button>` : `<button type="button" class="secondary" data-action="close">Cancel</button>`}
        <button type="submit">${step.key === "review" ? "Create hub" : "Next"}</button>
      </footer>
    </form>`;
}

// Copy the current step's inputs into the draft.
function readStep() {
  const form = createBody.querySelector("form");
  for (const el of form.elements) {
    if (!el.name || (el.type === "radio" && !el.checked)) continue;
    draft[el.name] = el.type === "number" || el.type === "range" || el.tagName === "SELECT" && /^\d+$/.test(el.value) ? Number(el.value) : el.value;
  }
}

function validateStep() {
  const key = STEPS[stepIndex].key;
  if (key === "basics") {
    if (draft.title.trim().length < 3) return "Give your hub a name (at least 3 characters).";
    if (draft.why.trim().length < 20) return "Tell neighbors a bit more about why you're starting it (at least 20 characters).";
  }
  if (key === "money") {
    if (!(draft.monthlyFee >= 1 && draft.monthlyFee <= 500)) return "Set a monthly fee between $1 and $500.";
    if (draft.approvalType === "restricted") {
      if (!(draft.perPurchaseLimit >= 5)) return "Set a per-purchase limit of at least $5.";
      if (!(draft.monthlyAllowance >= draft.perPurchaseLimit)) return "The monthly allowance should be at least the per-purchase limit.";
    } else if (!(draft.maxRequest >= 10 && draft.maxRequest <= 5000)) {
      return "Set a request cap between $10 and $5,000.";
    }
  }
  if (key === "startup" && !(draft.minMembers >= 3 && draft.minMembers <= 500)) {
    return "The minimum should be between 3 and 500 members.";
  }
  return "";
}

function finishCreate() {
  const center = draftCenter();
  const near = nearestCity(center);
  const hub = createHub({
    title: draft.title.trim(),
    why: draft.why.trim(),
    category: draft.category,
    lat: center.lat,
    lng: center.lng,
    radiusKm: draft.radiusKm,
    nearCity: near.name,
    nearCountry: near.country,
    monthlyFee: draft.monthlyFee,
    approvalType: draft.approvalType,
    committeeSize: draft.committeeSize,
    maxRequest: draft.maxRequest,
    cardDays: draft.cardDays,
    perPurchaseLimit: draft.perPurchaseLimit,
    monthlyAllowance: draft.monthlyAllowance,
    minMembers: draft.minMembers,
    deadlineDays: draft.deadlineDays,
  });
  createDialog.close();
  placePin?.closePopup();
  map.flyToBounds(hub.coverage.getBounds(), { maxZoom: 13 });
  showStatus(`${hub.name} is on the map. Now gather ${hub.minMembers} founding members!`);
  openJoinDialog(hub, distanceKm(hub));
}

function openCreateHub(place = null) {
  if (!Auth.user()) {
    openAuth({ reason: "Log in to start a hub.", onDone: () => openCreateHub(place) });
    return;
  }
  placeOption = place;
  draft = freshDraft();
  stepIndex = 0;
  renderCreate();
  if (!createDialog.open) createDialog.showModal();
}

createBody.addEventListener("submit", (e) => {
  e.preventDefault();
  readStep();
  const error = validateStep();
  if (error) return renderCreate(error);
  if (STEPS[stepIndex].key === "review") return finishCreate();
  stepIndex++;
  renderCreate();
});

// Re-render on choices that change what the step shows (radios, selects, sliders).
createBody.addEventListener("change", (e) => {
  if (e.target.type === "radio" || ["category", "minMembers", "deadlineDays"].includes(e.target.name)) {
    readStep();
    renderCreate();
  }
});

createBody.addEventListener("input", (e) => {
  const out = createBody.querySelector(`[data-out="${e.target.name}"]`);
  if (out) out.textContent = `${e.target.value} km`;
});

createBody.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "close") createDialog.close();
  if (action === "back") {
    readStep();
    stepIndex--;
    renderCreate();
  }
});

createDialog.addEventListener("click", (e) => {
  if (e.target === createDialog) createDialog.close();
});

document.getElementById("create-toggle").addEventListener("click", () => openCreateHub());

// "Start a hub here" link in a searched place's popup.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-start-hub]");
  if (!btn) return;
  const [lat, lng] = btn.dataset.startHub.split(",").map(Number);
  openCreateHub({ lat, lng, label: input.value || "Searched place" });
});

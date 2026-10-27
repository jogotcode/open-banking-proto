// Hubs created by users, and their startup lifecycle:
//
//   forming ──(reaches minimum members before the deadline)──▶ launched
//      │                                                         │
//      └──(deadline passes)──▶ failed                 first valid month
//                              (closes, nobody                   │
//                               is ever charged)                 ▼
//                                                          requests open
//
// While forming, joining is free ("founding members"). Billing starts for
// everyone at launch, and nobody can request funds until the hub's first
// valid month has passed.
//
// PROTOTYPE: hubs are stored in this browser. Other people can't really join
// yet, so the creator gets demo controls to simulate neighbors joining and to
// skip ahead in time.

const CREATED_KEY = "hub-created";
const createdRecords = readJson(CREATED_KEY, []);

function saveCreatedHubs() {
  writeJson(CREATED_KEY, createdRecords);
  document.dispatchEvent(new Event("hubs-changed"));
}

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

// Turn a stored record into a hub object the rest of the app understands.
function buildCreatedHub(record) {
  const template = PURPOSES.find((p) => p.category === record.category) || PURPOSES[0];
  const hub = {
    id: record.id,
    userCreated: true,
    record,
    name: record.title,
    country: `near ${record.nearCity}`,
    lat: record.lat,
    lng: record.lng,
    radiusKm: record.radiusKm,
    purpose: {
      title: `${capitalize(record.category)} fund`,
      category: record.category,
      why: record.why,
      impact: template.impact,
    },
    approval: APPROVAL_STYLES.find((a) => a.type === record.approvalType),
    monthlyFee: record.monthlyFee,
    committeeSize: record.committeeSize,
    maxRequest: record.maxRequest,
    cardDays: record.cardDays,
    perPurchaseLimit: record.perPurchaseLimit,
    monthlyAllowance: record.monthlyAllowance,
    joinPolicy: "open",
    minMembers: record.minMembers,
    founded: new Date(record.createdAt).getFullYear(),
    why: record.why,
    impact: template.impact.replace("{city}", record.nearCity),
  };
  refreshCreatedHub(hub);
  hub.approvalText = hub.approval.describe(hub);
  return hub;
}

// Derived numbers that change over time (member count, pool size).
function refreshCreatedHub(hub) {
  const r = hub.record;
  hub.members = r.members;
  hub.value = 0;
  if (r.status === "launched") {
    let months = 0;
    while (addMonths(r.launchedAt, months) <= Date.now()) months++;
    hub.value = r.members * r.monthlyFee * Math.max(1, months);
  }
}

for (const record of createdRecords) hubs.push(buildCreatedHub(record));

// --- Phases -------------------------------------------------------------------

function firstMonthEnds(hub) {
  return hub.record?.launchedAt ? addMonths(hub.record.launchedAt, 1) : null;
}

// "forming" | "failed" | "first-month" | "open". Built-in hubs are always open.
function hubPhase(hub) {
  if (!hub.userCreated) return "open";
  const r = hub.record;
  if (r.status === "failed") return "failed";
  if (r.status === "forming") return Date.now() >= Date.parse(r.deadlineAt) ? "failed" : "forming";
  return Date.now() < firstMonthEnds(hub) ? "first-month" : "open";
}

const isCreator = (hub) => Boolean(hub.userCreated && Auth.user() && hub.record.creatorId === Auth.user().id);

// --- Lifecycle ----------------------------------------------------------------

function createHub(fields) {
  const now = new Date();
  const record = {
    id: `u-${now.getTime().toString(36)}`,
    creatorId: Auth.user().id,
    creatorName: Auth.user().name,
    createdAt: now.toISOString(),
    deadlineAt: new Date(now.getTime() + fields.deadlineDays * DAY_MS).toISOString(),
    status: "forming",
    members: 0,
    ...fields,
  };
  createdRecords.push(record);
  const hub = buildCreatedHub(record);
  hubs.push(hub);
  addHubToMap(hub);
  joinAsFounder(hub); // the creator is the first founding member
  return hub;
}

function changeMembers(hub, delta) {
  hub.record.members = Math.max(0, hub.record.members + delta);
  checkLaunch(hub);
  refreshCreatedHub(hub);
  saveCreatedHubs();
}

function joinAsFounder(hub) {
  const all = Subscriptions.all();
  all[hub.id] = { monthlyFee: hub.monthlyFee, joinedAt: new Date().toISOString(), status: "founding" };
  Subscriptions._save(all);
  changeMembers(hub, +1);
}

function checkLaunch(hub) {
  const r = hub.record;
  if (r.status === "forming" && hubPhase(hub) === "forming" && r.members >= r.minMembers) {
    r.status = "launched";
    r.launchedAt = new Date().toISOString();
    showStatus(`${hub.name} reached ${r.minMembers} members and launched! 🎉`);
  }
}

// Turn the signed-in user's founding memberships into paid ones at launch,
// or close them if the hub didn't launch.
function reconcileFounding() {
  const all = Subscriptions.all();
  let changed = false;
  for (const [id, sub] of Object.entries(all)) {
    if (sub.status !== "founding") continue;
    const hub = hubs.find((h) => h.id === id);
    if (!hub) continue;
    const phase = hubPhase(hub);
    if (phase === "failed") {
      sub.status = "not-launched";
      changed = true;
    } else if (phase !== "forming") {
      const method = Auth.defaultPaymentMethod();
      if (method) {
        Subscriptions._activate(sub, method, new Date(hub.record.launchedAt));
      } else {
        sub.status = "pending-payment";
      }
      changed = true;
    }
  }
  if (changed) Subscriptions._save(all);
}

// Demo control: move this hub (and the signed-in user's membership) back in time.
function skipAhead(hub, days) {
  const shift = (iso) => iso && new Date(Date.parse(iso) - days * DAY_MS).toISOString();
  const r = hub.record;
  for (const key of ["createdAt", "deadlineAt", "launchedAt"]) if (r[key]) r[key] = shift(r[key]);
  const sub = Subscriptions.get(hub.id);
  if (sub) {
    for (const key of ["joinedAt", "activatedAt", "commitmentEndsAt", "endsAt"]) if (sub[key]) sub[key] = shift(sub[key]);
    Subscriptions._save(Subscriptions.all());
  }
  tickStartup();
  refreshCreatedHub(hub);
  saveCreatedHubs();
}

// Runs every second: deadlines, launches, and the visible countdowns.
function tickStartup() {
  let changed = false;
  for (const hub of hubs) {
    if (!hub.userCreated) continue;
    const r = hub.record;
    if (r.status === "forming" && Date.now() >= Date.parse(r.deadlineAt)) {
      r.status = "failed";
      r.failedAt = r.deadlineAt;
      changed = true;
    }
    const before = hub.value;
    refreshCreatedHub(hub);
    const phase = hubPhase(hub);
    if (hub.value !== before || phase !== hub.lastPhase) changed = true;
    hub.lastPhase = phase;
  }
  reconcileFounding();
  if (changed) saveCreatedHubs();
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    el.textContent = formatCountdown(Date.parse(el.dataset.countdown) - Date.now());
  });
}

setInterval(tickStartup, 1000);
document.addEventListener("auth-changed", () => setTimeout(reconcileFounding));

function formatCountdown(ms) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const pad = (n) => String(n).padStart(2, "0");
  const hms = `${pad(Math.floor((s % 86400) / 3600))}h ${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`;
  return d ? `${d}d ${hms}` : hms;
}

// --- Timeline -----------------------------------------------------------------

function startupTimeline(hub) {
  const r = hub.record;
  const phase = hubPhase(hub);
  const step = (state, title, detail) => `<li class="${state}"><strong>${title}</strong>${detail ? `<div>${detail}</div>` : ""}</li>`;
  const pct = Math.min(100, (r.members / r.minMembers) * 100);
  const countdown = (iso) => `<span class="countdown" data-countdown="${iso}">${formatCountdown(Date.parse(iso) - Date.now())}</span>`;

  const gather =
    phase === "forming"
      ? `${r.members} of ${r.minMembers} founding members
         <div class="progress"><span style="width:${Math.max(3, pct)}%"></span></div>
         ${countdown(r.deadlineAt)} left · deadline ${formatDate(r.deadlineAt)}`
      : phase === "failed"
        ? `Only ${r.members} of ${r.minMembers} joined by ${formatDate(r.deadlineAt)}. The hub closed and no one was charged.`
        : `${r.minMembers} members reached`;

  const launched = Boolean(r.launchedAt);
  const opens = launched ? firstMonthEnds(hub) : null;
  return `<ol class="timeline">
    ${step("done", "Hub created", `${formatDate(r.createdAt)} by ${escapeHtml(r.creatorName)}`)}
    ${step(phase === "forming" ? "current" : phase === "failed" ? "failed" : "done", `Gather ${r.minMembers} founding members`, gather)}
    ${step(launched ? "done" : "todo", "Hub launches", launched ? `Launched ${formatDate(r.launchedAt)} · billing of ${formatMoney(r.monthlyFee)}/month started` : `Billing of ${formatMoney(r.monthlyFee)}/month starts for every member. Free until then.`)}
    ${step(phase === "first-month" ? "current" : phase === "open" ? "done" : "todo", "First valid month", phase === "first-month" ? `Requests open ${formatDate(opens)} · ${countdown(opens.toISOString())} to go` : "No requests until the hub's first month is complete.")}
    ${step(phase === "open" ? "done" : "todo", "Requests open", phase === "open" ? `Since ${formatDate(opens)}` : "")}
  </ol>`;
}

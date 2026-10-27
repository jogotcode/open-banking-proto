// Subscriptions + the "join this bubble" dialog.
// Payment info is handled later on the account page, so a subscription is
// saved as "pending payment" (or "pending review" for application-only hubs).
//
// Every subscription starts with a one-month commitment: members can't make
// requests until it's over, and cancelling during it keeps the subscription
// running until the month ends.

const STORAGE_KEY = "hub-subscriptions";
const DAY_MS = 86_400_000;

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const Subscriptions = {
  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  },
  _save(all) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Storage unavailable (private mode etc.) — subscriptions last for this page view only.
    }
    document.dispatchEvent(new Event("subscriptions-changed"));
  },
  _memory: null,
  all() {
    if (!this._memory) {
      this._memory = this._load();
      // Drop cancelled subscriptions whose final month has ended.
      for (const [id, sub] of Object.entries(this._memory)) {
        if (sub.status === "cancelling" && Date.now() >= Date.parse(sub.endsAt)) delete this._memory[id];
      }
    }
    return this._memory;
  },
  get(hubId) {
    return this.all()[hubId] || null;
  },
  add(hub) {
    const all = this.all();
    const now = new Date();
    all[hub.id] = {
      status: hub.joinPolicy === "open" ? "pending-payment" : "pending-review",
      monthlyFee: hub.monthlyFee,
      joinedAt: now.toISOString(),
      commitmentEndsAt: addMonths(now, 1).toISOString(),
    };
    this._save(all);
    return all[hub.id];
  },
  // Withdrawn requests and finished commitments end right away; otherwise the
  // subscription runs until the commitment month is over.
  cancel(hubId) {
    const all = this.all();
    const sub = all[hubId];
    if (!sub) return;
    const info = subscriptionInfo(sub);
    if (sub.status === "pending-review" || info.unlocked) {
      delete all[hubId];
    } else {
      sub.previousStatus = sub.status;
      sub.status = "cancelling";
      sub.endsAt = info.commitmentEnds.toISOString();
    }
    this._save(all);
  },
  resume(hubId) {
    const sub = this.all()[hubId];
    if (!sub || sub.status !== "cancelling") return;
    sub.status = sub.previousStatus || "pending-payment";
    delete sub.previousStatus;
    delete sub.endsAt;
    this._save(this.all());
  },
};

// Derived numbers for a subscription at the current moment.
function subscriptionInfo(sub, now = Date.now()) {
  const joined = new Date(sub.joinedAt);
  const commitmentEnds = sub.commitmentEndsAt ? new Date(sub.commitmentEndsAt) : addMonths(joined, 1);
  const total = commitmentEnds - joined;
  // Billing months started so far (the first month is committed up front).
  let monthsStarted = 0;
  while (addMonths(joined, monthsStarted) <= now) monthsStarted++;
  return {
    joined,
    commitmentEnds,
    unlocked: now >= commitmentEnds,
    daysLeft: Math.max(0, Math.ceil((commitmentEnds - now) / DAY_MS)),
    progress: Math.min(1, Math.max(0, (now - joined) / total)),
    contributed: Math.max(1, monthsStarted) * sub.monthlyFee,
  };
}

const STATUS_TEXT = {
  "pending-payment": "You're in! Add a payment method on your account page to activate. Your one-month commitment has started.",
  "pending-review": "Request sent — the bubble's members will review your application.",
  cancelling: "Subscription cancelled. You're still a member until your one-month commitment ends.",
};

const dialog = document.getElementById("join-dialog");
const dialogBody = document.getElementById("join-body");
let dialogHub = null;
let dialogDistance = 0;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderJoinDialog(hub, distanceKm) {
  dialogHub = hub;
  dialogDistance = distanceKm;
  const sub = Subscriptions.get(hub.id);
  const isOpen = hub.joinPolicy === "open";

  const rules = [
    isOpen ? "Open to anyone within the bubble's area" : "Joining requires approval from current members",
    "You must commit to at least one month of membership before making requests",
    `Requests are capped at ${formatMoney(hub.maxRequest)}`,
    "You must stay within the bubble's area to submit requests",
  ];

  dialogBody.innerHTML = `
    <header class="dlg-head" style="--hub-color:${colorFor(hub.value)}">
      <div>
        <div class="dlg-eyebrow">${escapeHtml(hub.name)}, ${escapeHtml(hub.country)} · ${distanceKm.toFixed(1)} km away</div>
        <h2 tabindex="-1" autofocus>${escapeHtml(hub.purpose.title)}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </header>

    <div class="dlg-stats">
      <div><span>Pool</span><strong>${formatMoney(hub.value)}</strong></div>
      <div><span>Members</span><strong>${hub.members.toLocaleString()}</strong></div>
      <div><span>Since</span><strong>${hub.founded}</strong></div>
    </div>

    <section>
      <h3>Why this bubble was formed</h3>
      <p>${escapeHtml(hub.why)}</p>
    </section>

    <section>
      <h3>Subscription</h3>
      <p class="fee"><strong>${formatMoney(hub.monthlyFee)}</strong> / month</p>
      <p class="commitment"><strong>One-month commitment.</strong> You need to stay subscribed for at least one month before you can make requests from the pool.</p>
      <p class="muted">Billed monthly. You'll add payment info on your account page.</p>
    </section>

    <section>
      <h3>How transactions are approved</h3>
      <p><span class="chip">${escapeHtml(hub.approval.label)}</span></p>
      <p>${escapeHtml(hub.approvalText)}</p>
    </section>

    <section>
      <h3>Rules</h3>
      <ul class="rules">${rules.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
    </section>

    ${sub ? `<p class="notice">${STATUS_TEXT[sub.status]}</p>` : ""}

    <footer class="dlg-foot">
      ${
        sub
          ? `<button type="button" class="secondary" data-action="my-hubs">View my hubs</button>
             <button type="button" data-action="close">Done</button>`
          : `<button type="button" class="secondary" data-action="close">Not now</button>
             <button type="button" data-action="join">${isOpen ? `Subscribe · ${formatMoney(hub.monthlyFee)}/mo` : "Request to join"}</button>`
      }
    </footer>
  `;

  dialogBody.onclick = (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "close") dialog.close();
    if (action === "join") Subscriptions.add(hub); // re-render comes from the change event
    if (action === "my-hubs") {
      dialog.close();
      openMyHubs(hub.id);
    }
  };
}

function openJoinDialog(hub, distanceKm) {
  renderJoinDialog(hub, distanceKm);
  if (!dialog.open) dialog.showModal();
}

document.addEventListener("subscriptions-changed", () => {
  if (dialog.open && dialogHub) renderJoinDialog(dialogHub, dialogDistance);
});

// Close when clicking the backdrop.
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

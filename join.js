// Subscriptions + the "join this bubble" dialog.
// Payment info is handled later on the account page, so a subscription is
// saved as "pending payment" (or "pending review" for application-only hubs).

const STORAGE_KEY = "hub-subscriptions";

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
      // Storage unavailable (private mode etc.) — subscription lasts for this page view only.
    }
  },
  _memory: null,
  all() {
    if (!this._memory) this._memory = this._load();
    return this._memory;
  },
  get(hubId) {
    return this.all()[hubId] || null;
  },
  add(hub) {
    const all = this.all();
    all[hub.id] = {
      status: hub.joinPolicy === "open" ? "pending-payment" : "pending-review",
      monthlyFee: hub.monthlyFee,
      joinedAt: new Date().toISOString(),
    };
    this._save(all);
    return all[hub.id];
  },
  remove(hubId) {
    const all = this.all();
    delete all[hubId];
    this._save(all);
  },
};

const STATUS_TEXT = {
  "pending-payment": "Subscribed — add a payment method on your account page to activate.",
  "pending-review": "Request sent — the bubble's members will review your application.",
};

const dialog = document.getElementById("join-dialog");
const dialogBody = document.getElementById("join-body");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderJoinDialog(hub, distanceKm, onChange) {
  const sub = Subscriptions.get(hub.id);
  const isOpen = hub.joinPolicy === "open";

  const rules = [
    isOpen ? "Open to anyone within the bubble's area" : "Joining requires approval from current members",
    hub.minMonthsBeforeRequest
      ? `You must be a member for ${hub.minMonthsBeforeRequest} month${hub.minMonthsBeforeRequest > 1 ? "s" : ""} before requesting funds`
      : "You can request funds right after your first payment",
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
          ? `<button type="button" class="secondary" data-action="leave">${sub.status === "pending-review" ? "Withdraw request" : "Leave bubble"}</button>
             <button type="button" data-action="close">Done</button>`
          : `<button type="button" class="secondary" data-action="close">Not now</button>
             <button type="button" data-action="join">${isOpen ? `Subscribe · ${formatMoney(hub.monthlyFee)}/mo` : "Request to join"}</button>`
      }
    </footer>
  `;

  dialogBody.onclick = (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "close") dialog.close();
    if (action === "join") {
      Subscriptions.add(hub);
      onChange(hub);
      renderJoinDialog(hub, distanceKm, onChange);
    }
    if (action === "leave") {
      Subscriptions.remove(hub.id);
      onChange(hub);
      renderJoinDialog(hub, distanceKm, onChange);
    }
  };
}

function openJoinDialog(hub, distanceKm, onChange) {
  renderJoinDialog(hub, distanceKm, onChange);
  if (!dialog.open) dialog.showModal();
}

// Close when clicking the backdrop.
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

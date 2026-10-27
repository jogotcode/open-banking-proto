// Subscriptions + the "join this bubble" dialog.
//
// Subscriptions belong to the logged-in account. Joining an open bubble needs
// a payment method; the subscription is active from that moment and its
// one-month commitment starts then. Application-only bubbles start as
// "pending review" and aren't billed until approved.
//
// Members can't make requests until the one-month commitment is over, and
// cancelling during it keeps the subscription running until the month ends.

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
  _memory: null,
  _key() {
    const user = Auth.user();
    return user ? `${LEGACY_SUBS_KEY}:${user.id}` : null;
  },
  _save(all) {
    if (this._key()) writeJson(this._key(), all);
    document.dispatchEvent(new Event("subscriptions-changed"));
  },
  all() {
    if (!this._memory) {
      this._memory = this._key() ? readJson(this._key(), {}) : {};
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
  add(hub, paymentMethod) {
    const all = this.all();
    const now = new Date();
    all[hub.id] = { monthlyFee: hub.monthlyFee, joinedAt: now.toISOString() };
    if (hub.joinPolicy === "open") this._activate(all[hub.id], paymentMethod, now);
    else all[hub.id].status = "pending-review";
    this._save(all);
    return all[hub.id];
  },
  _activate(sub, paymentMethod, now = new Date()) {
    sub.status = "active";
    sub.paymentMethodId = paymentMethod.id;
    sub.activatedAt = now.toISOString();
    sub.commitmentEndsAt = addMonths(now, 1).toISOString();
  },
  // Subscriptions saved before payments existed start once a method is added.
  activatePending(paymentMethod) {
    const all = this.all();
    let changed = false;
    for (const sub of Object.values(all)) {
      if (sub.status === "pending-payment") {
        this._activate(sub, paymentMethod);
        changed = true;
      }
    }
    if (changed) this._save(all);
  },
  // Unpaid subscriptions and finished commitments end right away; otherwise
  // the subscription runs until the commitment month is over.
  cancel(hubId) {
    const all = this.all();
    const sub = all[hubId];
    if (!sub) return;
    const info = subscriptionInfo(sub);
    if (sub.status !== "active" || info.unlocked) {
      delete all[hubId];
    } else {
      sub.status = "cancelling";
      sub.endsAt = info.commitmentEnds.toISOString();
    }
    this._save(all);
  },
  resume(hubId) {
    const sub = this.all()[hubId];
    if (!sub || sub.status !== "cancelling") return;
    sub.status = "active";
    delete sub.endsAt;
    this._save(this.all());
  },
  // Active + cancelling subscriptions (those still being paid for this month).
  paying() {
    return Object.values(this.all()).filter((s) => s.status === "active" || s.status === "cancelling");
  },
};

document.addEventListener("auth-changed", () => {
  Subscriptions._memory = null;
  document.dispatchEvent(new Event("subscriptions-changed"));
});

// Derived numbers for a subscription at the current moment.
function subscriptionInfo(sub, now = Date.now()) {
  const started = sub.status === "active" || sub.status === "cancelling";
  const start = new Date(sub.activatedAt || sub.joinedAt);
  const commitmentEnds = sub.commitmentEndsAt ? new Date(sub.commitmentEndsAt) : addMonths(start, 1);
  // Billing months started so far (the first month is charged up front).
  let monthsStarted = 0;
  if (started) while (addMonths(start, monthsStarted) <= now) monthsStarted++;
  return {
    started,
    commitmentEnds,
    unlocked: started && now >= commitmentEnds,
    daysLeft: Math.max(0, Math.ceil((commitmentEnds - now) / DAY_MS)),
    progress: Math.min(1, Math.max(0, (now - start) / (commitmentEnds - start))),
    contributed: started ? Math.max(1, monthsStarted) * sub.monthlyFee : 0,
  };
}

function statusText(sub) {
  if (sub.status === "active") {
    const method = Auth.paymentMethods().find((m) => m.id === sub.paymentMethodId);
    return `You're in!${method ? ` Paying with ${paymentLabel(method)}.` : ""} Your one-month commitment has started — you can make requests from ${formatDate(sub.commitmentEndsAt)}.`;
  }
  return {
    "pending-payment": "Add a payment method to activate this subscription.",
    "pending-review": "Request sent — the bubble's members will review your application. You won't be charged until you're approved.",
    cancelling: "Subscription cancelled. You're still a member until your one-month commitment ends.",
  }[sub.status];
}

const dialog = document.getElementById("join-dialog");
const dialogBody = document.getElementById("join-body");
let dialogHub = null;
let dialogDistance = 0;
let confirmingJoin = false; // showing the "pay with …" confirmation step

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function joinFooter(hub, sub) {
  if (sub) {
    const addPayment = sub.status === "pending-payment" ? `<button type="button" data-action="add-payment">Add payment method</button>` : "";
    return `<button type="button" class="secondary" data-action="my-hubs">View my hubs</button>
            ${addPayment || `<button type="button" data-action="close">Done</button>`}`;
  }
  if (confirmingJoin) {
    const method = Auth.defaultPaymentMethod();
    return `<div class="pay-confirm">
        <span>Pay ${formatMoney(hub.monthlyFee)}/month with <strong>${escapeHtml(paymentLabel(method))}</strong></span>
        <button type="button" class="link-btn" data-action="change-payment">Change</button>
      </div>
      <button type="button" class="secondary" data-action="back">Back</button>
      <button type="button" data-action="confirm-join">Confirm · ${formatMoney(hub.monthlyFee)}/mo</button>`;
  }
  return `<button type="button" class="secondary" data-action="close">Not now</button>
          <button type="button" data-action="join">${hub.joinPolicy === "open" ? `Subscribe · ${formatMoney(hub.monthlyFee)}/mo` : "Request to join"}</button>`;
}

function renderJoinDialog(hub, distanceKm) {
  if (dialogHub !== hub) confirmingJoin = false;
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
      <p class="muted">Billed monthly to your card or Apple Pay.</p>
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

    ${sub ? `<p class="notice">${escapeHtml(statusText(sub))}</p>` : ""}

    <footer class="dlg-foot">${joinFooter(hub, sub)}</footer>
  `;

  dialogBody.onclick = (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "close") dialog.close();
    if (action === "join") startJoin(hub);
    if (action === "back") {
      confirmingJoin = false;
      renderJoinDialog(hub, distanceKm);
    }
    if (action === "confirm-join") {
      confirmingJoin = false;
      Subscriptions.add(hub, Auth.defaultPaymentMethod()); // re-render comes from the change event
    }
    if (action === "change-payment" || action === "add-payment") {
      openAddPayment({
        reason: `Choose how to pay ${formatMoney(hub.monthlyFee)}/month for ${hub.name}.`,
        onDone: () => renderJoinDialog(hub, distanceKm),
      });
    }
    if (action === "my-hubs") {
      dialog.close();
      openMyHubs(hub.id);
    }
  };
}

// Subscribe flow: sign in → payment method → confirm.
function startJoin(hub) {
  if (!Auth.user()) {
    openAuth({ reason: `Create an account or log in to join ${hub.name}.`, onDone: () => startJoin(hub) });
    return;
  }
  if (Subscriptions.get(hub.id)) {
    renderJoinDialog(hub, dialogDistance); // logging in revealed an existing membership
    return;
  }
  if (hub.joinPolicy !== "open") {
    Subscriptions.add(hub); // billed only once approved
    return;
  }
  if (!Auth.defaultPaymentMethod()) {
    openAddPayment({
      reason: `Add a payment method to start your ${formatMoney(hub.monthlyFee)}/month subscription to ${hub.name}.`,
      onDone: () => startJoin(hub),
    });
    return;
  }
  confirmingJoin = true;
  renderJoinDialog(hub, dialogDistance);
}

function openJoinDialog(hub, distanceKm) {
  confirmingJoin = false;
  renderJoinDialog(hub, distanceKm);
  if (!dialog.open) dialog.showModal();
}

for (const event of ["subscriptions-changed", "payment-methods-changed"]) {
  document.addEventListener(event, () => {
    if (dialog.open && dialogHub) renderJoinDialog(dialogHub, dialogDistance);
  });
}

// Close when clicking the backdrop.
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

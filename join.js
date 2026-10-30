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
        if (sub.status === "cancelling" && Date.now() >= Date.parse(sub.endsAt)) {
          delete this._memory[id];
          setTimeout(() => document.dispatchEvent(new CustomEvent("membership-ended", { detail: id })));
        }
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
    if (sub.status === "founding") {
      // Leaving a hub that's still forming: free, and it loses a member.
      delete all[hubId];
      this._save(all);
      changeMembers(hubs.find((h) => h.id === hubId), -1);
      return;
    }
    if (sub.status !== "active" || info.unlocked) {
      delete all[hubId];
      document.dispatchEvent(new CustomEvent("membership-ended", { detail: hubId }));
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
    founding: "You're a founding member! Nothing is charged while the hub is forming. If it launches, billing starts then; if it doesn't, it closes and you're never charged.",
    "not-launched": "This hub didn't reach its minimum members in time, so it closed. You were never charged.",
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
    const canUseFunds = !fundsBlocker(hub);
    const fundsBtn = !canUseFunds
      ? ""
      : hub.approval.type === "restricted"
        ? `<button type="button" data-action="open-card">Use your card</button>`
        : `<button type="button" data-action="request">Request funds</button>`;
    return `<button type="button" class="secondary" data-action="my-hubs">View my hubs</button>
            ${addPayment || fundsBtn || `<button type="button" data-action="close">Done</button>`}`;
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
  const phase = hubPhase(hub);
  if (phase === "failed") return `<button type="button" data-action="close">Close</button>`;
  const label =
    phase === "forming"
      ? "Join free as a founding member"
      : hub.joinPolicy === "open"
        ? `Subscribe · ${formatMoney(hub.monthlyFee)}/mo`
        : "Request to join";
  return `<button type="button" class="secondary" data-action="close">Not now</button>
          <button type="button" data-action="join">${label}</button>`;
}

// Startup status for hubs created by users: timeline + creator's demo tools.
function startupSection(hub) {
  if (!hub.userCreated) return "";
  const phase = hubPhase(hub);
  const intro = {
    forming: `This hub is still forming. It needs ${hub.minMembers} founding members by ${formatDate(hub.record.deadlineAt)} to launch. Joining is free until then.`,
    failed: "This hub didn't reach its minimum members in time and has closed. Nobody was charged.",
    "first-month": "This hub has launched. Requests open once its first month is complete.",
    open: "This hub is up and running.",
  }[phase];
  const demo = isCreator(hub) && phase !== "failed" && phase !== "open"
    ? `<div class="demo-tools">
        <span>Demo controls (you created this hub)</span>
        ${phase === "forming" ? `<button type="button" class="secondary small" data-action="demo-member">+ Simulate a neighbor joining</button>` : ""}
        <button type="button" class="secondary small" data-action="demo-skip">Skip ahead 7 days</button>
      </div>`
    : "";
  return `<section class="startup">
      <h3>Startup</h3>
      <p>${escapeHtml(intro)}</p>
      ${startupTimeline(hub)}
      ${demo}
    </section>`;
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
        <div class="dlg-eyebrow">${escapeHtml(hub.name)}, ${escapeHtml(hub.country)}${Number.isFinite(distanceKm) ? ` · ${distanceKm.toFixed(1)} km away` : ""}</div>
        <h2 tabindex="-1" autofocus>${escapeHtml(hub.purpose.title)}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </header>

    <div class="dlg-stats">
      <div><span>Pool</span><strong>${formatMoney(hub.value)}</strong></div>
      <div><span>Members</span><strong>${hub.members.toLocaleString()}</strong></div>
      <div><span>Since</span><strong>${hub.founded}</strong></div>
    </div>

    ${startupSection(hub)}

    <section>
      <h3>Why this bubble was formed</h3>
      <p>${escapeHtml(hub.why)}</p>
    </section>

    <section>
      <h3>Subscription</h3>
      <p class="fee"><strong>${formatMoney(hub.monthlyFee)}</strong> / month${hubPhase(hub) === "forming" ? ` <span class="free-tag">Free until launch</span>` : ""}</p>
      <p class="commitment"><strong>One-month commitment.</strong> You need to stay subscribed for at least one month before you can make requests from the pool.</p>
      <p class="muted">Billed monthly to your card or Apple Pay.</p>
    </section>

    <section>
      <h3>How transactions are approved</h3>
      <p><span class="chip">${escapeHtml(hub.approval.label)}</span></p>
      <p>${escapeHtml(hub.approvalText)}</p>
      ${hub.approval.type === "restricted" ? "" : `<p class="muted">Approved funds arrive on a virtual card for this hub, valid for ${hub.cardDays} days.</p>`}
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
    if (action === "request") openRequest(hub);
    if (action === "demo-member") changeMembers(hub, +1);
    if (action === "demo-skip") skipAhead(hub, 7);
    if (action === "open-card") {
      dialog.close();
      openWallet();
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
  const phase = hubPhase(hub);
  if (phase === "failed") return;
  if (phase === "forming") {
    joinAsFounder(hub); // free until the hub launches
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

for (const event of ["subscriptions-changed", "payment-methods-changed", "hubs-changed"]) {
  document.addEventListener(event, () => {
    if (dialog.open && dialogHub) renderJoinDialog(dialogHub, dialogDistance);
  });
}

// Close when clicking the backdrop.
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

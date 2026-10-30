// "My hubs" panel: every hub the user belongs to, what they contribute,
// a word of encouragement, and a way to cancel.

const myHubsPanel = document.getElementById("my-hubs");
const myHubsBody = document.getElementById("my-hubs-body");
const myHubsToggle = document.getElementById("my-hubs-toggle");
let confirmingCancel = null; // hub id showing the "are you sure?" step

const THANKS = [
  "Thank you for showing up for your neighbors.",
  "Small monthly amounts add up to big help.",
  "Communities like this run on people like you.",
  "Every dollar stays local. Thank you!",
];

function pickFor(id, list) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length];
}

function encouragement(hub, sub, info) {
  const fee = formatMoney(sub.monthlyFee);
  if (sub.status === "pending-review") {
    return `Fingers crossed! Once ${hub.name}'s members approve you, your ${fee} a month will help ${hub.impact}.`;
  }
  if (sub.status === "founding") {
    return `You're one of ${hub.members} founding members. Once ${hub.minMembers} neighbors join, your ${fee} a month will help ${hub.impact}. Invite people nearby!`;
  }
  if (sub.status === "not-launched") {
    return `${hub.name} didn't reach ${hub.minMembers} members in time, so it closed. You were never charged. Thanks for trying to get it started.`;
  }
  if (sub.status === "pending-payment") {
    return `Add a payment method and your ${fee} a month will help ${hub.impact}.`;
  }
  if (sub.status === "cancelling") {
    return `Thanks for being part of ${hub.name}. Your support helped ${hub.impact}. You're still a member until ${formatDate(sub.endsAt)}.`;
  }
  if (!info.unlocked) {
    return `Your ${fee} a month helps ${hub.impact}. ${pickFor(hub.id, THANKS)}`;
  }
  return `You've put ${formatMoney(info.contributed)} into ${hub.name} so far, helping ${hub.impact}. ${pickFor(hub.id, THANKS)}`;
}

function badgeFor(sub) {
  if (sub.status === "pending-review") return `<span class="badge warn">Awaiting approval</span>`;
  if (sub.status === "cancelling") return `<span class="badge muted">Ends ${formatDate(sub.endsAt)}</span>`;
  if (sub.status === "pending-payment") return `<span class="badge warn">Payment needed</span>`;
  if (sub.status === "founding") return `<span class="badge info">Founding member</span>`;
  if (sub.status === "not-launched") return `<span class="badge muted">Didn't launch</span>`;
  return `<span class="badge ok">Active</span>`;
}

function paidWith(sub) {
  if (!sub.paymentMethodId || sub.status === "cancelling") return "";
  const method = Auth.paymentMethods().find((m) => m.id === sub.paymentMethodId) || Auth.defaultPaymentMethod();
  return method ? `<span class="paid-with">Paid with ${escapeHtml(paymentLabel(method))}</span>` : "";
}

function commitmentBlock(hub, sub, info) {
  if (sub.status === "founding") return startupTimeline(hub);
  if (sub.status === "not-launched") return "";
  if (sub.status === "pending-review") {
    return `<p class="commit-note">Your one-month commitment starts once you're approved.</p>`;
  }
  if (sub.status === "pending-payment") {
    return `<p class="commit-note">Your one-month commitment starts once you add a payment method.</p>
      <div class="card-actions"><button type="button" data-action="add-payment">Add payment method</button></div>`;
  }
  if (sub.status === "cancelling") return "";
  if (info.unlocked) {
    return `<p class="commit-note done">✓ Commitment complete — ${
      hub.approval.type === "restricted" ? `your ${escapeHtml(hub.purpose.category)} card is ready.` : "you can now request funds."
    }</p>`;
  }
  return `
    <div class="commit">
      <div class="commit-row">
        <span>One-month commitment</span>
        <span>${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"} left</span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(info.progress * 100)}">
        <span style="width:${Math.max(4, info.progress * 100)}%"></span>
      </div>
      <p class="commit-note">You can start making requests on ${formatDate(info.commitmentEnds)}.</p>
    </div>`;
}

// Request funds (or open the spending card) once the first month is done.
function fundsAction(hub, sub, info) {
  if (!info.unlocked || !["active", "cancelling"].includes(sub.status)) return "";
  if (hub.approval.type === "restricted") {
    return `<button type="button" class="full" data-action="open-card" data-hub="${hub.id}">Use your ${escapeHtml(hub.purpose.category)} card</button>`;
  }
  const pending = openRequestFor(hub);
  return pending
    ? `<p class="commit-note">⏳ ${formatMoney(pending.amount)} request in review.</p>`
    : `<button type="button" class="full" data-action="request" data-hub="${hub.id}">Request funds</button>`;
}

function cancelBlock(hub, sub, info) {
  if (sub.status === "cancelling") {
    return `<div class="card-actions">
      <button type="button" class="secondary" data-action="show" data-hub="${hub.id}">Show on map</button>
      <button type="button" data-action="resume" data-hub="${hub.id}">Keep subscription</button>
    </div>`;
  }
  const isRequest = sub.status === "pending-review";
  if (confirmingCancel === hub.id) {
    const message = isRequest
      ? `Withdraw your request to join ${hub.name}?`
      : sub.status === "founding"
        ? `Leave ${hub.name}? You haven't been charged, and the hub will need another member to launch.`
        : !info.started
        ? `Remove ${hub.name} from your hubs? You haven't been charged yet.`
        : info.unlocked
        ? `Cancel your ${formatMoney(sub.monthlyFee)}/month subscription to ${hub.name}? It ends right away.`
        : `You committed to one month. If you cancel, you stay a member until ${formatDate(info.commitmentEnds)} and won't be billed after that.`;
    return `<div class="confirm">
      <p>${escapeHtml(message)}</p>
      <div class="card-actions">
        <button type="button" class="secondary" data-action="keep" data-hub="${hub.id}">Keep it</button>
        <button type="button" class="danger" data-action="confirm-cancel" data-hub="${hub.id}">${
          isRequest ? "Withdraw request" : sub.status === "founding" ? "Yes, leave" : sub.status === "not-launched" ? "Remove" : "Yes, cancel"
        }</button>
      </div>
    </div>`;
  }
  return `<div class="card-actions">
    ${sub.status === "not-launched" ? "" : `<button type="button" class="secondary" data-action="${hub.isGroup ? "open-group" : hub.userCreated ? "open-hub" : "show"}" data-hub="${hub.id}">${hub.isGroup ? "Open group" : hub.userCreated ? "Open hub" : "Show on map"}</button>`}
    <button type="button" class="secondary danger-text" data-action="cancel" data-hub="${hub.id}">${
      isRequest ? "Withdraw request" : sub.status === "founding" ? "Leave hub" : sub.status === "not-launched" ? "Remove" : "Cancel subscription"
    }</button>
  </div>`;
}

function renderMyHubs() {
  const entries = hubs
    .map((hub) => ({ hub, sub: Subscriptions.get(hub.id) }))
    .filter((e) => e.sub)
    .sort((a, b) => Date.parse(b.sub.joinedAt) - Date.parse(a.sub.joinedAt));

  const paying = entries.filter((e) => e.sub.status === "active");
  const monthly = paying.reduce((sum, e) => sum + e.sub.monthlyFee, 0);
  myHubsToggle.textContent = entries.length ? `My hubs · ${entries.length}` : "My hubs";

  if (!Auth.user()) {
    myHubsBody.innerHTML = `
      <div class="empty">
        <p><strong>Log in to see your hubs.</strong></p>
        <p>Your memberships and contributions are saved to your account.</p>
        <p><button type="button" data-action="log-in">Log in or sign up</button></p>
      </div>`;
    return;
  }

  if (!entries.length) {
    myHubsBody.innerHTML = `
      <div class="empty">
        <p><strong>You haven't joined any hubs yet.</strong></p>
        <p>Walk into a bubble on the map and tap it to see how to join, or start one for your neighborhood.</p>
        <p><button type="button" data-action="start-hub">+ Start a hub</button></p>
      </div>`;
    return;
  }

  const summary = monthly
    ? `<div class="summary">
         <span>You contribute</span>
         <strong>${formatMoney(monthly)}<small> / month</small></strong>
         <p>across ${paying.length} hub${paying.length === 1 ? "" : "s"}. That's real money keeping your communities strong.</p>
       </div>`
    : "";

  myHubsBody.innerHTML =
    summary +
    entries
      .map(({ hub, sub }) => {
        const info = subscriptionInfo(sub);
        return `
        <article class="hub-card" style="--hub-color:${colorFor(hub.value)}">
          <header>
            <div>
              <div class="dlg-eyebrow">${escapeHtml(hub.name)}, ${escapeHtml(hub.country)}${isCreator(hub) ? " · You created this hub" : ""}</div>
              <h3>${escapeHtml(hub.purpose.title)}</h3>
            </div>
            ${badgeFor(sub)}
          </header>
          ${sub.status === "not-launched" ? "" : `<div class="contribution">
            <span>Your contribution</span>
            <strong>${formatMoney(sub.monthlyFee)}<small> / month${sub.status === "founding" ? " after launch" : ""}</small></strong>
            ${sub.status === "founding" ? `<span class="total">Free while the hub is forming</span>` : ""}
            ${info.started ? `<span class="total">${formatMoney(info.contributed)} contributed so far</span>` : ""}
            ${paidWith(sub)}
          </div>`}
          <p class="encourage">${escapeHtml(encouragement(hub, sub, info))}</p>
          ${commitmentBlock(hub, sub, info)}
          ${fundsAction(hub, sub, info)}
          ${cancelBlock(hub, sub, info)}
        </article>`;
      })
      .join("");
}

function openMyHubs(focusHubId) {
  if (!filterPanel.hidden) filterToggle.click(); // panels open in the same spot
  if (typeof closeWallet === "function") closeWallet();
  if (typeof closeFriends === "function") closeFriends();
  renderMyHubs();
  myHubsPanel.hidden = false;
  myHubsToggle.classList.add("active");
  myHubsToggle.setAttribute("aria-expanded", "true");
  if (focusHubId) {
    myHubsBody.querySelector(`[data-hub="${focusHubId}"]`)?.closest(".hub-card")?.scrollIntoView({ block: "nearest" });
  }
}

function closeMyHubs() {
  myHubsPanel.hidden = true;
  confirmingCancel = null;
  myHubsToggle.classList.remove("active");
  myHubsToggle.setAttribute("aria-expanded", "false");
}

myHubsToggle.addEventListener("click", () => (myHubsPanel.hidden ? openMyHubs() : closeMyHubs()));
filterToggle.addEventListener("click", () => !filterPanel.hidden && closeMyHubs());
document.getElementById("my-hubs-close").addEventListener("click", closeMyHubs);

myHubsBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const hub = hubs.find((h) => h.id === btn.dataset.hub);
  switch (btn.dataset.action) {
    case "show":
      if (window.matchMedia("(max-width: 640px)").matches) closeMyHubs();
      map.flyToBounds(hub.coverage.getBounds(), { maxZoom: 12 });
      return;
    case "cancel":
      confirmingCancel = hub.id;
      break;
    case "keep":
      confirmingCancel = null;
      break;
    case "confirm-cancel":
      confirmingCancel = null;
      Subscriptions.cancel(hub.id); // re-renders via the change event
      return;
    case "resume":
      Subscriptions.resume(hub.id);
      return;
    case "open-hub":
      if (window.matchMedia("(max-width: 640px)").matches) closeMyHubs();
      map.flyToBounds(hub.coverage.getBounds(), { maxZoom: 13 });
      return openJoinDialog(hub, distanceKm(hub));
    case "open-group":
      return openGroup(hub);
    case "start-hub":
      return openCreateHub();
    case "request":
      return openRequest(hub);
    case "open-card":
      return openWallet(VirtualCards.all().find((c) => c.hubId === hub.id && c.type === "category")?.id);
    case "add-payment":
      openAddPayment({ reason: "Add a payment method to activate your subscriptions." });
      return;
    case "log-in":
      openAuth({ reason: "Log in to see your hubs." });
      return;
  }
  renderMyHubs();
});

document.addEventListener("subscriptions-changed", renderMyHubs);
document.addEventListener("payment-methods-changed", renderMyHubs);
document.addEventListener("funds-changed", () => !myHubsPanel.hidden && renderMyHubs());
document.addEventListener("hubs-changed", () => !myHubsPanel.hidden && renderMyHubs());
renderMyHubs();

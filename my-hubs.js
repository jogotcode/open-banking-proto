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
  return `<span class="badge warn">Add payment method</span>`;
}

function commitmentBlock(sub, info) {
  if (sub.status === "pending-review") {
    return `<p class="commit-note">Your one-month commitment starts once you're approved.</p>`;
  }
  if (sub.status === "cancelling") return "";
  if (info.unlocked) {
    return `<p class="commit-note done">✓ Commitment complete — you can now make requests.</p>`;
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
      : info.unlocked
        ? `Cancel your ${formatMoney(sub.monthlyFee)}/month subscription to ${hub.name}? It ends right away.`
        : `You committed to one month. If you cancel, you stay a member until ${formatDate(info.commitmentEnds)} and won't be billed after that.`;
    return `<div class="confirm">
      <p>${escapeHtml(message)}</p>
      <div class="card-actions">
        <button type="button" class="secondary" data-action="keep" data-hub="${hub.id}">Keep it</button>
        <button type="button" class="danger" data-action="confirm-cancel" data-hub="${hub.id}">${isRequest ? "Withdraw request" : "Yes, cancel"}</button>
      </div>
    </div>`;
  }
  return `<div class="card-actions">
    <button type="button" class="secondary" data-action="show" data-hub="${hub.id}">Show on map</button>
    <button type="button" class="secondary danger-text" data-action="cancel" data-hub="${hub.id}">${isRequest ? "Withdraw request" : "Cancel subscription"}</button>
  </div>`;
}

function renderMyHubs() {
  const entries = hubs
    .map((hub) => ({ hub, sub: Subscriptions.get(hub.id) }))
    .filter((e) => e.sub)
    .sort((a, b) => Date.parse(b.sub.joinedAt) - Date.parse(a.sub.joinedAt));

  const paying = entries.filter((e) => e.sub.status !== "pending-review");
  const monthly = paying.filter((e) => e.sub.status !== "cancelling").reduce((sum, e) => sum + e.sub.monthlyFee, 0);
  myHubsToggle.textContent = entries.length ? `My hubs · ${entries.length}` : "My hubs";

  if (!entries.length) {
    myHubsBody.innerHTML = `
      <div class="empty">
        <p><strong>You haven't joined any hubs yet.</strong></p>
        <p>Walk into a bubble on the map and tap it to see how to join.</p>
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
              <div class="dlg-eyebrow">${escapeHtml(hub.name)}, ${escapeHtml(hub.country)}</div>
              <h3>${escapeHtml(hub.purpose.title)}</h3>
            </div>
            ${badgeFor(sub)}
          </header>
          <div class="contribution">
            <span>Your contribution</span>
            <strong>${formatMoney(sub.monthlyFee)}<small> / month</small></strong>
            ${sub.status === "pending-review" ? "" : `<span class="total">${formatMoney(info.contributed)} committed so far</span>`}
          </div>
          <p class="encourage">${escapeHtml(encouragement(hub, sub, info))}</p>
          ${commitmentBlock(sub, info)}
          ${cancelBlock(hub, sub, info)}
        </article>`;
      })
      .join("");
}

function openMyHubs(focusHubId) {
  if (!filterPanel.hidden) filterToggle.click(); // both panels open in the same spot
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
  }
  renderMyHubs();
});

document.addEventListener("subscriptions-changed", renderMyHubs);
renderMyHubs();

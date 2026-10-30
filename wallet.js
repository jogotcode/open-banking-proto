// Request-funds dialog and the Wallet panel (virtual cards + purchase simulator).

const requestDialog = document.getElementById("request-dialog");
const requestBody = document.getElementById("request-body");
const walletPanel = document.getElementById("wallet");
const walletBody = document.getElementById("wallet-body");
const walletToggle = document.getElementById("wallet-toggle");

let requestHub = null;
let requestShown = null; // id of the request whose result the dialog is showing
const revealed = new Set(); // card ids with details shown
let buyingWith = null; // card id with the purchase form open
let lastPurchase = null; // { cardId, tx }

const HOW_DECIDED = {
  fcfs: "Approved right away while this month's pool lasts.",
  committee: (hub) => `Reviewed by the hub's elected committee of ${hub.committeeSize}.`,
  "member-vote": () => "Every member gets 48 hours to vote.",
  organizer: (hub) => `${hub.record.organizerName}, the group's organizer, reviews it.`,
};

function howDecided(hub) {
  const rule = HOW_DECIDED[hub.approval.type];
  return typeof rule === "function" ? rule(hub) : rule;
}

function fundRuleText(hub) {
  return hub.approval.type === "restricted"
    ? `Members use a ${hub.purpose.category} card: up to ${formatMoney(hub.perPurchaseLimit)} per purchase, ${formatMoney(hub.monthlyAllowance)} a month.`
    : `Approved funds arrive on a virtual card for this ${hub.isGroup ? "group" : "hub"}, valid for ${hub.cardDays} days. Anything unused goes back to the pool.`;
}

// --- Request dialog -----------------------------------------------------------

function requestResult(request, hub) {
  if (request.status === "in-review") {
    return `<div class="result pending">
        <strong>Request submitted</strong>
        <p>${formatMoney(request.amount)} for “${escapeHtml(request.reason)}”. ${escapeHtml(howDecided(hub))}</p>
        <p class="small">Demo: the decision arrives in a few seconds instead of up to 48 hours.</p>
      </div>
      <footer class="dlg-foot"><button type="button" data-action="close">Done</button></footer>`;
  }
  return `<div class="result approved">
      <strong>Approved — ${formatMoney(request.amount)} is ready to spend</strong>
      <p>${escapeHtml(request.votes)}. Your new ${escapeHtml(hub.name)} card is in your wallet, valid for ${hub.cardDays} days.</p>
    </div>
    <footer class="dlg-foot">
      <button type="button" class="secondary" data-action="close">Close</button>
      <button type="button" data-action="wallet" data-card="${request.cardId}">Open wallet</button>
    </footer>`;
}

function renderRequestDialog() {
  const hub = requestHub;
  const blocker = fundsBlocker(hub);
  const shown = requestShown && FundRequests.all().find((r) => r.id === requestShown);
  const pending = openRequestFor(hub);

  let body;
  if (hub.approval.type === "restricted") {
    body = `<p class="notice">${escapeHtml(hub.name)} doesn't take requests. ${escapeHtml(fundRuleText(hub))}</p>
      <footer class="dlg-foot"><button type="button" data-action="wallet">Open wallet</button></footer>`;
  } else if (shown) {
    body = requestResult(shown, hub);
  } else if (pending) {
    body = requestResult(pending, hub);
  } else if (blocker) {
    body = `<p class="warn-box">${escapeHtml(blocker)}</p>
      <footer class="dlg-foot"><button type="button" data-action="close">OK</button></footer>`;
  } else {
    const outside = !isInRange(hub);
    body = `
      ${outside ? `<p class="warn-box">You need to be inside the ${escapeHtml(hub.name)} bubble to submit a request.</p>` : ""}
      <form data-form="request" novalidate>
        <label class="field">
          <span>Amount (up to ${formatMoney(hub.maxRequest)})</span>
          <div class="card-input"><span class="prefix">$</span><input name="amount" type="number" inputmode="decimal" min="1" max="${hub.maxRequest}" step="1" placeholder="0" required /></div>
        </label>
        <label class="field">
          <span>What's it for?</span>
          <textarea name="reason" rows="3" maxlength="300" placeholder="e.g. Replacing my food cart's broken generator before the weekend market" required></textarea>
        </label>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="full" ${outside ? "disabled" : ""}>Submit request</button>
      </form>`;
  }

  requestBody.innerHTML = `
    <header class="acct-head">
      <div>
        <div class="dlg-eyebrow">${escapeHtml(hub.name)} · ${escapeHtml(hub.purpose.title)}</div>
        <h2 tabindex="-1" autofocus>Request funds</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </header>
    <div class="rule-box">
      <span class="chip">${escapeHtml(hub.approval.label)}</span>
      ${hub.approval.type === "restricted" ? "" : `<p>${escapeHtml(howDecided(hub))}</p>`}
      <p>${escapeHtml(fundRuleText(hub))}</p>
    </div>
    ${body}`;
}

function openRequest(hub) {
  requestHub = hub;
  requestShown = null;
  renderRequestDialog();
  if (!requestDialog.open) requestDialog.showModal();
}

requestBody.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    const request = submitFundRequest(requestHub, { amount: parseFloat(form.amount.value), reason: form.reason.value });
    requestShown = request.id;
    renderRequestDialog();
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
  }
});

requestBody.addEventListener("input", () => {
  const error = requestBody.querySelector(".form-error");
  if (error) error.textContent = "";
});

requestBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "close") requestDialog.close();
  if (btn.dataset.action === "wallet") {
    // Close whatever the request came from (hub or group pop-up) so the Wallet is usable.
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    openWallet(btn.dataset.card);
  }
});

requestDialog.addEventListener("click", (e) => {
  if (e.target === requestDialog) requestDialog.close();
});

// --- Wallet panel -------------------------------------------------------------

function cardFace(card, state) {
  const show = revealed.has(card.id);
  const number = show ? card.number.replace(/(\d{4})(?=\d)/g, "$1 ") : `•••• •••• •••• ${card.last4}`;
  const label = card.type === "grant" ? `Grant · ${formatMoney(card.amount)}` : `${card.category[0].toUpperCase()}${card.category.slice(1)} card`;
  return `<div class="vcard ${state.usable ? "" : "inactive"}" style="--hub-color:${colorFor(state.hub.value)}">
    <div class="vcard-top">
      <span class="vcard-hub">${escapeHtml(state.hub.name)}</span>
      <span class="vcard-type">${escapeHtml(label)}</span>
    </div>
    <div class="vcard-number">${number}</div>
    <div class="vcard-bottom">
      <span>EXP ${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}</span>
      <span>${show ? `CVC ${card.cvc}` : "CVC •••"}</span>
      <span class="vcard-brand">VISA</span>
    </div>
  </div>`;
}

function purchaseForm(card) {
  const options = DEMO_MERCHANTS.map(
    (m) => `<option value="${escapeHtml(m.name)}" ${card.type === "category" && m.category === card.category ? "selected" : ""}>${escapeHtml(m.name)} · ${escapeHtml(m.category)}</option>`
  ).join("");
  return `<form class="purchase" data-form="purchase" data-card="${card.id}" novalidate>
    <p class="small muted">Try a purchase to see the card's spending rules in action.</p>
    <label class="field"><span>Store</span><select name="merchant">${options}</select></label>
    <label class="field"><span>Amount</span>
      <div class="card-input"><span class="prefix">$</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00" required /></div>
    </label>
    <div class="card-actions">
      <button type="button" class="secondary" data-action="cancel-buy">Cancel</button>
      <button type="submit">Pay with card</button>
    </div>
  </form>`;
}

function txRow(tx) {
  return `<li class="${tx.approved ? "" : "declined"}">
    <span><strong>${escapeHtml(tx.merchant)}</strong><small>${tx.approved ? formatDate(tx.at) : escapeHtml(tx.declineReason)}</small></span>
    <span>${tx.approved ? "-" : ""}${formatCents(tx.amount)}${tx.approved ? "" : " · Declined"}</span>
  </li>`;
}

function cardBlock(card) {
  const state = cardState(card);
  const rules =
    card.type === "grant"
      ? `<p class="card-rule">${state.usable ? `${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left · ` : ""}Usable anywhere until ${formatDate(card.expiresAt)}.</p>`
      : `<p class="card-rule">Only ${escapeHtml(card.category)} · up to ${formatMoney(card.perPurchaseLimit)} per purchase · ${formatMoney(card.monthlyAllowance)} a month.</p>`;
  const result =
    lastPurchase?.cardId === card.id
      ? `<p class="buy-result ${lastPurchase.tx.approved ? "ok" : "no"}">${
          lastPurchase.tx.approved
            ? `✓ Approved: ${formatCents(lastPurchase.tx.amount)} at ${escapeHtml(lastPurchase.tx.merchant)}`
            : `✕ Declined: ${escapeHtml(lastPurchase.tx.declineReason)}`
        }</p>`
      : "";
  return `<article class="wallet-card" data-card-block="${card.id}">
    ${cardFace(card, state)}
    <div class="card-balance">
      <div><span>Available</span><strong>${formatCents(Math.max(0, state.remaining))}</strong></div>
      <span class="badge ${state.usable ? "ok" : "muted"}">${escapeHtml(state.status)}</span>
    </div>
    ${rules}
    ${result}
    ${
      buyingWith === card.id
        ? purchaseForm(card)
        : `<div class="card-actions">
            <button type="button" class="secondary" data-action="reveal" data-card="${card.id}">${revealed.has(card.id) ? "Hide details" : "Show details"}</button>
            ${state.usable ? `<button type="button" data-action="buy" data-card="${card.id}">Simulate a purchase</button>` : ""}
          </div>`
    }
    ${card.transactions.length ? `<ul class="tx-list">${card.transactions.slice(0, 5).map(txRow).join("")}</ul>` : ""}
  </article>`;
}

function renderWallet() {
  if (!Auth.user()) {
    walletToggle.textContent = "Wallet";
    walletBody.innerHTML = `<div class="empty">
      <p><strong>Log in to see your wallet.</strong></p>
      <p>Cards from your hubs show up here.</p>
      <p><button type="button" data-action="log-in">Log in or sign up</button></p>
    </div>`;
    return;
  }
  ensureCategoryCards();
  const cards = VirtualCards.all();
  const active = cards.filter((c) => cardState(c).usable);
  const past = cards.filter((c) => !cardState(c).usable);
  const pending = FundRequests.all().filter((r) => r.status === "in-review");
  const available = active.reduce((sum, c) => sum + cardState(c).remaining, 0);
  walletToggle.textContent = active.length ? `Wallet · ${active.length}` : "Wallet";

  const pendingHtml = pending.length
    ? `<section><h3>In review</h3>${pending
        .map((r) => {
          const hub = hubById(r.hubId);
          return `<div class="pending-row"><span class="spinner" aria-hidden="true"></span>
            <span><strong>${formatMoney(r.amount)} from ${escapeHtml(hub.name)}</strong><small>${escapeHtml(howDecided(hub))}</small></span></div>`;
        })
        .join("")}</section>`
    : "";

  walletBody.innerHTML = `
    <div class="summary">
      <span>Available to spend</span>
      <strong>${formatCents(available)}</strong>
      <p>${active.length ? `across ${active.length} card${active.length === 1 ? "" : "s"} from your hubs.` : "Request funds from a hub you belong to, or join a hub with a spending card."}</p>
    </div>
    ${pendingHtml}
    ${active.length ? `<section><h3>Cards</h3>${active.map(cardBlock).join("")}</section>` : ""}
    ${past.length ? `<details class="past"><summary>Past cards (${past.length})</summary>${past.map(cardBlock).join("")}</details>` : ""}
    ${!cards.length && !pending.length ? `<div class="empty"><p>No cards yet. Open <strong>My hubs</strong> and tap <strong>Request funds</strong> once your first month is done.</p></div>` : ""}
    <p class="proto-note">Demo cards: numbers are generated for testing and can't be used in real stores.</p>`;
}

function openWallet(focusCardId) {
  if (!filterPanel.hidden) filterToggle.click();
  closeMyHubs();
  if (typeof closeFriends === "function") closeFriends();
  renderWallet();
  walletPanel.hidden = false;
  walletToggle.classList.add("active");
  walletToggle.setAttribute("aria-expanded", "true");
  if (focusCardId) walletBody.querySelector(`[data-card-block="${focusCardId}"]`)?.scrollIntoView({ block: "nearest" });
}

function closeWallet() {
  walletPanel.hidden = true;
  buyingWith = null;
  lastPurchase = null;
  walletToggle.classList.remove("active");
  walletToggle.setAttribute("aria-expanded", "false");
}

walletToggle.addEventListener("click", () => (walletPanel.hidden ? openWallet() : closeWallet()));
document.getElementById("wallet-close").addEventListener("click", closeWallet);
filterToggle.addEventListener("click", () => !filterPanel.hidden && closeWallet());
myHubsToggle.addEventListener("click", () => !myHubsPanel.hidden && closeWallet());

walletBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.card;
  switch (btn.dataset.action) {
    case "reveal":
      revealed.has(id) ? revealed.delete(id) : revealed.add(id);
      break;
    case "buy":
      buyingWith = id;
      lastPurchase = null;
      break;
    case "cancel-buy":
      buyingWith = null;
      break;
    case "log-in":
      return openAuth({ reason: "Log in to see your wallet." });
    default:
      return;
  }
  renderWallet();
});

walletBody.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const card = VirtualCards.all().find((c) => c.id === form.dataset.card);
  const merchant = DEMO_MERCHANTS.find((m) => m.name === form.merchant.value);
  const tx = simulatePurchase(card, merchant, parseFloat(form.amount.value));
  lastPurchase = { cardId: card.id, tx };
  if (tx.approved) buyingWith = null;
  renderWallet();
});

for (const event of ["funds-changed", "subscriptions-changed"]) {
  document.addEventListener(event, () => {
    if (!walletPanel.hidden) renderWallet();
    else if (Auth.user()) {
      const active = VirtualCards.all().filter((c) => cardState(c).usable).length;
      walletToggle.textContent = active ? `Wallet · ${active}` : "Wallet";
    }
    if (requestDialog.open && requestHub) renderRequestDialog();
  });
}
renderWallet();

// Fund requests and the virtual cards they produce.
//
// - Grant cards: a member requests funds from a hub; if approved, the amount
//   is loaded onto a virtual card for that hub that lasts as long as the
//   hub's creator set (`hub.cardDays`). Unused funds go back to the pool when
//   it expires.
// - Category cards: restricted hubs give members a card they can just use for
//   one kind of purchase (food, shoes, …), within the hub's per-purchase limit
//   and monthly allowance.
//
// PROTOTYPE: card numbers are generated demo numbers, purchases are
// simulated, and committee / member votes are simulated with a short delay.
// A live version would issue cards through a card-issuing platform (e.g.
// Stripe Issuing, Marqeta) whose spending controls enforce the same rules.

const REVIEW_DEMO_MS = 6000; // stands in for up to 48 hours of voting

function userKey(name) {
  const user = Auth.user();
  return user ? `${name}:${user.id}` : null;
}

function makeStore(name) {
  return {
    _memory: null,
    all() {
      if (!this._memory) this._memory = userKey(name) ? readJson(userKey(name), []) : [];
      return this._memory;
    },
    save() {
      if (userKey(name)) writeJson(userKey(name), this._memory);
      document.dispatchEvent(new Event("funds-changed"));
    },
    reset() {
      this._memory = null;
    },
  };
}

const FundRequests = makeStore("hub-requests");
const VirtualCards = makeStore("hub-cards");

document.addEventListener("auth-changed", () => {
  FundRequests.reset();
  VirtualCards.reset();
  document.dispatchEvent(new Event("funds-changed"));
});

const hubById = (id) => hubs.find((h) => h.id === id);
const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

// Demo card number on a test-style prefix, with a valid check digit.
function demoCardNumber() {
  const body = `400000${randomDigits(9)}`;
  for (let check = 0; check < 10; check++) {
    if (passesLuhn(body + check)) return body + check;
  }
}

function formatCents(v) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// --- Eligibility --------------------------------------------------------------

// Why a member can't use a hub's funds right now (null if they can).
function fundsBlocker(hub) {
  if (!Auth.user()) return "Log in to request funds.";
  if (hubPhase(hub) === "forming") return `${hub.name} is still forming. Requests open one month after it launches.`;
  if (hubPhase(hub) === "failed") return `${hub.name} didn't launch, so it has no funds.`;
  const sub = Subscriptions.get(hub.id);
  if (!sub || !["active", "cancelling"].includes(sub.status)) return `Join ${hub.name} to request funds.`;
  const phase = hubPhase(hub);
  if (phase === "first-month") {
    return `Requests open on ${formatDate(firstMonthEnds(hub))}, after the hub's first valid month.`;
  }
  const info = subscriptionInfo(sub);
  if (!info.unlocked) {
    return `You can request funds after your one-month commitment ends on ${formatDate(info.commitmentEnds)}.`;
  }
  return null;
}

function openRequestFor(hub) {
  return FundRequests.all().find((r) => r.hubId === hub.id && r.status === "in-review") || null;
}

// --- Requests ---------------------------------------------------------------

function submitFundRequest(hub, { amount, reason }) {
  const blocker = fundsBlocker(hub);
  if (blocker) throw new Error(blocker);
  if (!isInRange(hub)) throw new Error(`You need to be inside the ${hub.name} bubble to submit a request.`);
  if (openRequestFor(hub)) throw new Error("You already have a request in review for this hub.");
  if (!(amount >= 1)) throw new Error("Enter an amount.");
  if (amount > hub.maxRequest) throw new Error(`This hub caps requests at ${formatMoney(hub.maxRequest)}.`);
  if (reason.trim().length < 10) throw new Error("Tell the hub a little more about what it's for.");

  const now = Date.now();
  const request = {
    id: `req_${now.toString(36)}`,
    hubId: hub.id,
    amount: Math.round(amount),
    reason: reason.trim(),
    submittedAt: new Date(now).toISOString(),
    status: "in-review",
    // First come, first served pays out right away; votes take time.
    decideAt: new Date(hub.approval.type === "fcfs" ? now : now + REVIEW_DEMO_MS).toISOString(),
  };
  FundRequests.all().unshift(request);
  resolveDueRequests({ silent: hub.approval.type === "fcfs" });
  FundRequests.save();
  return request;
}

function decide(request, hub) {
  // Simulated outcome: valid requests pass, with a believable vote count.
  if (hub.approval.type === "committee") {
    const yes = Math.ceil(hub.committeeSize / 2) + Math.floor(Math.random() * (hub.committeeSize / 2));
    request.votes = `${yes} of ${hub.committeeSize} committee members approved`;
  } else if (hub.approval.type === "organizer") {
    request.votes = `Approved by ${hub.record.organizerName}`;
  } else if (hub.approval.type === "member-vote") {
    // Groups are small enough that everyone votes.
    const cast = hub.isGroup ? hub.members : Math.max(5, Math.round(hub.members * (0.15 + Math.random() * 0.2)));
    const yes = Math.ceil(cast * (0.55 + Math.random() * 0.35));
    request.votes = `${yes} of ${cast} votes in favor`;
  } else {
    request.votes = "Paid from this month's pool";
  }
  request.status = "approved";
  request.decidedAt = new Date().toISOString();
  request.cardId = issueGrantCard(hub, request).id;
}

function resolveDueRequests({ silent = false } = {}) {
  const now = Date.now();
  let changed = false;
  for (const request of FundRequests.all()) {
    if (request.status !== "in-review" || Date.parse(request.decideAt) > now) continue;
    const hub = hubById(request.hubId);
    decide(request, hub);
    changed = true;
    if (!silent) showStatus(`Your ${formatMoney(request.amount)} request to ${hub.name} was approved — card added to your wallet`);
  }
  if (changed) {
    VirtualCards.save();
    FundRequests.save();
  }
}

setInterval(resolveDueRequests, 1000);

// --- Cards --------------------------------------------------------------------

function newCard(hub, fields) {
  const expiresAt = fields.expiresAt ? new Date(fields.expiresAt) : null;
  const expDate = expiresAt || addMonths(new Date(), 36);
  const number = demoCardNumber();
  return {
    id: `card_${Date.now().toString(36)}${randomDigits(3)}`,
    hubId: hub.id,
    number,
    last4: number.slice(-4),
    cvc: randomDigits(3),
    expMonth: expDate.getMonth() + 1,
    expYear: expDate.getFullYear(),
    issuedAt: new Date().toISOString(),
    transactions: [],
    ...fields,
  };
}

function issueGrantCard(hub, request) {
  const card = newCard(hub, {
    type: "grant",
    requestId: request.id,
    amount: request.amount,
    expiresAt: new Date(Date.now() + hub.cardDays * DAY_MS).toISOString(),
  });
  VirtualCards.all().unshift(card);
  return card;
}

// Restricted hubs: members past their first month get a category card.
function ensureCategoryCards() {
  if (!Auth.user()) return;
  let added = false;
  for (const hub of hubs) {
    if (hub.approval.type !== "restricted" || fundsBlocker(hub)) continue;
    if (VirtualCards.all().some((c) => c.hubId === hub.id && c.type === "category")) continue;
    VirtualCards.all().push(
      newCard(hub, {
        type: "category",
        category: hub.purpose.category,
        perPurchaseLimit: hub.perPurchaseLimit,
        monthlyAllowance: hub.monthlyAllowance,
      })
    );
    added = true;
  }
  if (added) VirtualCards.save();
}

function approvedTotal(card, since) {
  return card.transactions
    .filter((t) => t.approved && (!since || Date.parse(t.at) >= since))
    .reduce((sum, t) => sum + t.amount, 0);
}

// Current state of a card: what's left, and whether it can be used.
function cardState(card) {
  const hub = hubById(card.hubId);
  const now = Date.now();
  if (card.type === "grant") {
    const remaining = card.amount - approvedTotal(card);
    const expired = now >= Date.parse(card.expiresAt);
    return {
      hub,
      remaining,
      usable: !expired && remaining > 0,
      status: expired ? "Expired" : remaining <= 0 ? "Used up" : `Expires ${formatDate(card.expiresAt)}`,
      daysLeft: Math.max(0, Math.ceil((Date.parse(card.expiresAt) - now) / DAY_MS)),
    };
  }
  // Category card: works while the user is still a member in good standing.
  const member = !fundsBlocker(hub);
  const remaining = card.monthlyAllowance - approvedTotal(card, startOfMonth().getTime());
  return {
    hub,
    remaining,
    usable: member && remaining > 0,
    status: !member ? "Paused — membership ended" : remaining <= 0 ? "Monthly allowance used" : `${formatCents(remaining)} left this month`,
  };
}

// Simulated card purchase, checked against the hub's spending controls.
function simulatePurchase(card, merchant, amount) {
  const state = cardState(card);
  let decline = null;
  if (!(amount > 0)) decline = "Enter an amount.";
  else if (card.type === "grant" && Date.now() >= Date.parse(card.expiresAt)) decline = "Card expired";
  else if (card.type === "category" && fundsBlocker(state.hub)) decline = "Membership is no longer active";
  else if (card.type === "category" && merchant.category !== card.category) decline = `Only ${card.category} purchases are allowed`;
  else if (card.type === "category" && amount > card.perPurchaseLimit) decline = `Over the ${formatMoney(card.perPurchaseLimit)} per-purchase limit`;
  else if (amount > state.remaining) decline = `Only ${formatCents(Math.max(0, state.remaining))} left on this card`;

  const tx = {
    id: `tx_${Date.now().toString(36)}`,
    merchant: merchant.name,
    category: merchant.category,
    amount: Math.round(amount * 100) / 100,
    at: new Date().toISOString(),
    approved: !decline,
    declineReason: decline,
  };
  card.transactions.unshift(tx);
  VirtualCards.save();
  return tx;
}

// Demo merchants for the purchase simulator.
const DEMO_MERCHANTS = [
  { name: "FreshMart Groceries", category: "food and groceries" },
  { name: "Corner Bakery", category: "food and groceries" },
  { name: "Sole Street Shoes", category: "shoes and clothing" },
  { name: "KidStyle Clothing", category: "shoes and clothing" },
  { name: "City Pharmacy", category: "medical expenses" },
  { name: "Campus Books", category: "education" },
  { name: "Little Steps Daycare", category: "childcare" },
  { name: "ArtSupply Co.", category: "art supplies and studio time" },
  { name: "QuickFix Auto Repair", category: "repairs" },
  { name: "Power & Light Utility", category: "rent and utilities" },
  { name: "ToolBarn Equipment", category: "business equipment" },
  { name: "GameZone Electronics", category: "electronics" },
];

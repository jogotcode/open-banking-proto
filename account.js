// Account dialog: sign up, log in, account page and payment methods
// (card or Apple Pay).
//
// Cards run in TEST MODE: the form checks the number like a real checkout
// (Luhn check, expiry, CVC) but only brand, last 4 and expiry are kept.
// Apple Pay shows a demo approval step; the real Apple Pay sheet needs a
// payment processor and an Apple Pay merchant ID, which is where a provider
// such as Stripe plugs in (see `finishPayment`).

const accountDialog = document.getElementById("account-dialog");
const accountBody = document.getElementById("account-body");
const accountBtn = document.getElementById("account-btn");

let view = "login";
let ctx = {}; // { reason, onDone } for flows started elsewhere (e.g. joining a hub)
let accountError = "";

const applePaySupported = (() => {
  try {
    return Boolean(window.ApplePaySession && ApplePaySession.canMakePayments());
  } catch {
    return false;
  }
})();

// --- Card helpers -----------------------------------------------------------

function cardBrand(digits) {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  if (/^6(011|5)/.test(digits)) return "Discover";
  return "Card";
}

function passesLuhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

function formatCardNumber(digits) {
  const groups = cardBrand(digits) === "Amex" ? [4, 6, 5] : [4, 4, 4, 4];
  const parts = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  return parts.join(" ");
}

function validateCard(form) {
  const digits = form.number.value.replace(/\D/g, "");
  const brand = cardBrand(digits);
  const [mm, yy] = form.exp.value.split("/").map((s) => parseInt(s, 10));
  const expiryEnd = new Date(2000 + yy, mm, 1); // first day after the expiry month
  const errors = {};
  if (!form.cardname.value.trim()) errors.cardname = "Enter the name on the card.";
  if (digits.length !== (brand === "Amex" ? 15 : 16) || !passesLuhn(digits)) errors.number = "Enter a valid card number.";
  if (!(mm >= 1 && mm <= 12) || Number.isNaN(yy)) errors.exp = "Enter the expiry as MM/YY.";
  else if (expiryEnd <= new Date()) errors.exp = "This card has expired.";
  if (form.cvc.value.length !== (brand === "Amex" ? 4 : 3)) errors.cvc = `Enter the ${brand === "Amex" ? 4 : 3}-digit code.`;
  if (form.zip.value.trim().length < 3) errors.zip = "Enter your ZIP or postal code.";
  return { errors, digits, brand, mm, yy };
}

// --- Rendering --------------------------------------------------------------

const brandClass = (m) => (m.type === "apple_pay" ? "apple" : m.brand.toLowerCase());
const brandMark = (m) => (m.type === "apple_pay" ? "Apple<br>Pay" : { Visa: "VISA", Mastercard: "MC", Amex: "AMEX", Discover: "DISC" }[m.brand] || "CARD");

function head(title) {
  return `<header class="acct-head">
    <h2 tabindex="-1" autofocus>${title}</h2>
    <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
  </header>
  ${ctx.reason ? `<p class="reason">${escapeHtml(ctx.reason)}</p>` : ""}`;
}

const PROTOTYPE_NOTE = `<p class="proto-note">Prototype: your account is saved only in this browser.</p>`;

function field(name, label, attrs, hint = "") {
  return `<label class="field">
    <span>${label}</span>
    <input name="${name}" ${attrs} />
    ${hint ? `<small class="hint">${hint}</small>` : ""}
    <small class="field-error" data-error="${name}"></small>
  </label>`;
}

function renderLogin() {
  return `${head("Log in")}
    <form data-form="login" novalidate>
      ${field("email", "Email", 'type="email" autocomplete="email" required')}
      ${field("password", "Password", 'type="password" autocomplete="current-password" required')}
      <p class="form-error" role="alert"></p>
      <button type="submit" class="full">Log in</button>
    </form>
    <p class="switch">New here? <button type="button" class="link-btn" data-action="to-signup">Create an account</button></p>
    ${PROTOTYPE_NOTE}`;
}

function renderSignup() {
  return `${head("Create your account")}
    <form data-form="signup" novalidate>
      ${field("fullname", "Full name", 'type="text" autocomplete="name" required')}
      ${field("email", "Email", 'type="email" autocomplete="email" required')}
      ${field("password", "Password", 'type="password" autocomplete="new-password" minlength="8" required', "At least 8 characters")}
      <p class="form-error" role="alert"></p>
      <button type="submit" class="full">Create account</button>
    </form>
    <p class="switch">Already have an account? <button type="button" class="link-btn" data-action="to-login">Log in</button></p>
    ${PROTOTYPE_NOTE}`;
}

function methodRow(m, { choosing }) {
  const sub = m.type === "apple_pay" ? "Apple Wallet" : `Expires ${String(m.expMonth).padStart(2, "0")}/${String(m.expYear).slice(-2)}`;
  const actions = choosing
    ? `<button type="button" class="secondary small" data-action="use-method" data-id="${m.id}">Use</button>`
    : `${m.isDefault ? `<span class="badge ok">Default</span>` : `<button type="button" class="link-btn" data-action="make-default" data-id="${m.id}">Make default</button>`}
       <button type="button" class="link-btn danger-text" data-action="remove-method" data-id="${m.id}">Remove</button>`;
  return `<div class="pm-row">
    <span class="pm-icon ${brandClass(m)}">${brandMark(m)}</span>
    <div class="pm-text"><strong>${escapeHtml(paymentLabel(m))}</strong><span>${sub}</span></div>
    <div class="pm-actions">${actions}</div>
  </div>`;
}

function renderAccount() {
  const user = Auth.user();
  const methods = Auth.paymentMethods();
  const paying = Subscriptions.paying().filter((s) => s.status === "active");
  const monthly = paying.reduce((sum, s) => sum + s.monthlyFee, 0);
  return `${head("Your account")}
    <div class="profile">
      <span class="avatar big">${escapeHtml(user.name[0].toUpperCase())}</span>
      <div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)}</span></div>
    </div>

    <section>
      <h3>Payment methods</h3>
      ${methods.length ? methods.map((m) => methodRow(m, { choosing: false })).join("") : `<p class="muted">No payment method yet. Add a card or Apple Pay to join hubs.</p>`}
      <p class="form-error" role="alert">${escapeHtml(accountError)}</p>
      <button type="button" class="secondary" data-action="to-payment">+ Add payment method</button>
    </section>

    <section>
      <h3>Subscriptions</h3>
      <p>${paying.length ? `${formatMoney(monthly)}/month across ${paying.length} hub${paying.length === 1 ? "" : "s"}` : "No active subscriptions yet."}</p>
      <button type="button" class="secondary" data-action="my-hubs">View my hubs</button>
    </section>

    <footer class="dlg-foot"><button type="button" class="secondary" data-action="log-out">Log out</button></footer>
    ${PROTOTYPE_NOTE}`;
}

function renderPayment() {
  const choosing = Boolean(ctx.onDone);
  const saved = choosing ? Auth.paymentMethods() : [];
  return `${head("Payment method")}
    ${saved.length ? `<section class="saved"><h3>Saved</h3>${saved.map((m) => methodRow(m, { choosing })).join("")}</section>` : ""}

    <button type="button" class="apple-pay-btn" data-action="apple-pay" aria-label="Set up Apple Pay"><span>Apple Pay</span></button>
    <p class="muted center small">${applePaySupported ? "Apple Pay is available on this device." : "Apple Pay works in Safari on iPhone, iPad and Mac."}</p>

    <div class="divider"><span>or add a card</span></div>

    <div class="test-mode">
      <strong>Test mode:</strong> no real charges. Don't enter a real card.
      <button type="button" class="link-btn" data-action="fill-test">Use test card 4242 4242 4242 4242</button>
    </div>

    <form data-form="card" novalidate>
      ${field("cardname", "Name on card", 'type="text" autocomplete="cc-name" required')}
      <label class="field">
        <span>Card number</span>
        <div class="card-input">
          <input name="number" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234" required />
          <span class="brand-tag" data-brand></span>
        </div>
        <small class="field-error" data-error="number"></small>
      </label>
      <div class="field-row">
        ${field("exp", "Expiry", 'inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5" required')}
        ${field("cvc", "CVC", 'inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" required')}
        ${field("zip", "ZIP", 'autocomplete="postal-code" maxlength="10" required')}
      </div>
      <button type="submit" class="full">Save card</button>
    </form>`;
}

function renderApplePay() {
  return `${head("Apple Pay")}
    <div class="applepay-demo">
      <span class="apple-pay-btn static"><span>Apple Pay</span></span>
      <p><strong>Demo mode</strong></p>
      <p>In the live app, the Apple Pay sheet opens here so you can confirm with Face ID or Touch ID. This prototype isn't connected to a payment processor yet, so no real payment method is set up.</p>
    </div>
    <footer class="dlg-foot">
      <button type="button" class="secondary" data-action="to-payment">Back</button>
      <button type="button" data-action="approve-apple-pay">Simulate approval</button>
    </footer>`;
}

function renderAccountDialog() {
  const render = { login: renderLogin, signup: renderSignup, account: renderAccount, payment: renderPayment, "apple-pay": renderApplePay }[view];
  accountBody.innerHTML = render();
  accountBody.querySelector("form input")?.focus();
}

function show(nextView) {
  view = nextView;
  accountError = "";
  renderAccountDialog();
  if (!accountDialog.open) accountDialog.showModal();
}

// --- Flows ------------------------------------------------------------------

function openAuth(options = {}) {
  if (Auth.user()) return options.onDone?.();
  ctx = options;
  show(Object.keys(Auth._users).length ? "login" : "signup");
}

function openAddPayment(options = {}) {
  if (!Auth.user()) {
    openAuth({ reason: options.reason, onDone: () => openAddPayment(options) });
    return;
  }
  ctx = options;
  show("payment");
}

function openAccount() {
  ctx = {};
  show(Auth.user() ? "account" : "login");
}

// Hand control back to whatever started the flow, or go to the account page.
function finish(result) {
  const done = ctx.onDone;
  ctx = {};
  if (done) {
    accountDialog.close();
    done(result);
  } else {
    show("account");
  }
}

// The one place a real processor plugs in: it would tokenize the card (or
// complete the Apple Pay session) and return the saved method.
function finishPayment(details) {
  const method = Auth.addPaymentMethod(details);
  if (ctx.onDone) Auth.setDefaultPaymentMethod(method.id); // the user picked it for this purchase
  Subscriptions.activatePending(method);
  showStatus(`${paymentLabel(method)} added`);
  finish(method);
}

function setFieldErrors(form, errors) {
  form.querySelectorAll("[data-error]").forEach((el) => {
    el.textContent = errors[el.dataset.error] || "";
    el.closest(".field")?.classList.toggle("invalid", Boolean(errors[el.dataset.error]));
  });
}

accountBody.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = form.querySelector(".form-error");
  const submit = form.querySelector('[type="submit"]');

  if (form.dataset.form === "card") {
    const { errors, digits, brand, mm, yy } = validateCard(form);
    setFieldErrors(form, errors);
    if (Object.keys(errors).length) return;
    finishPayment({ type: "card", brand, last4: digits.slice(-4), expMonth: mm, expYear: 2000 + yy, name: form.cardname.value.trim() });
    return;
  }

  submit.disabled = true;
  errorEl.textContent = "";
  try {
    if (form.dataset.form === "signup") {
      const user = await Auth.signUp({ name: form.fullname.value, email: form.email.value, password: form.password.value });
      showStatus(`Welcome, ${user.name.split(" ")[0]}!`);
    } else {
      const user = await Auth.logIn({ email: form.email.value, password: form.password.value });
      showStatus(`Welcome back, ${user.name.split(" ")[0]}`);
    }
    finish();
  } catch (err) {
    errorEl.textContent = err.message;
    submit.disabled = false;
  }
});

accountBody.addEventListener("input", (e) => {
  const input = e.target;
  if (input.name === "number") {
    const digits = input.value.replace(/\D/g, "").slice(0, 16);
    const trimmed = cardBrand(digits) === "Amex" ? digits.slice(0, 15) : digits;
    input.value = formatCardNumber(trimmed);
    accountBody.querySelector("[data-brand]").textContent = trimmed ? cardBrand(trimmed) : "";
  }
  if (input.name === "exp") {
    let digits = input.value.replace(/\D/g, "").slice(0, 4);
    if (digits.length === 1 && digits > "1") digits = `0${digits}`;
    input.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }
  if (input.name === "cvc") input.value = input.value.replace(/\D/g, "").slice(0, 4);
});

accountBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  switch (btn.dataset.action) {
    case "close":
      ctx = {};
      accountDialog.close();
      break;
    case "to-signup":
      return show("signup");
    case "to-login":
      return show("login");
    case "to-payment":
      return show("payment");
    case "apple-pay":
      return show("apple-pay");
    case "approve-apple-pay":
      return finishPayment({ type: "apple_pay", brand: "Apple Pay" });
    case "fill-test": {
      const form = accountBody.querySelector('[data-form="card"]');
      form.cardname.value ||= Auth.user()?.name || "";
      form.number.value = "4242 4242 4242 4242";
      form.exp.value = `12/${String(new Date().getFullYear() + 3).slice(-2)}`;
      form.cvc.value = "123";
      form.zip.value = "10001";
      accountBody.querySelector("[data-brand]").textContent = "Visa";
      setFieldErrors(form, {});
      return;
    }
    case "use-method":
      Auth.setDefaultPaymentMethod(id);
      return finish(Auth.defaultPaymentMethod());
    case "make-default":
      Auth.setDefaultPaymentMethod(id);
      return renderAccountDialog();
    case "remove-method":
      if (Auth.paymentMethods().length === 1 && Subscriptions.paying().length) {
        accountError = "You have active subscriptions. Add another payment method before removing this one.";
        return renderAccountDialog();
      }
      Auth.removePaymentMethod(id);
      // Subscriptions paid with the removed method move to the new default.
      for (const sub of Subscriptions.paying()) if (sub.paymentMethodId === id) sub.paymentMethodId = Auth.defaultPaymentMethod()?.id;
      Subscriptions._save(Subscriptions.all());
      accountError = "";
      return renderAccountDialog();
    case "my-hubs":
      accountDialog.close();
      return openMyHubs();
    case "log-out":
      accountDialog.close();
      Auth.logOut();
      showStatus("Logged out");
      return;
  }
});

accountDialog.addEventListener("click", (e) => {
  if (e.target === accountDialog) {
    ctx = {};
    accountDialog.close();
  }
});
accountDialog.addEventListener("cancel", () => (ctx = {}));

// --- Account button (top right, like Google Maps) ---------------------------

function renderAccountButton() {
  const user = Auth.user();
  accountBtn.className = user ? "avatar-btn" : "signin-btn";
  accountBtn.textContent = user ? user.name[0].toUpperCase() : "Sign in";
  accountBtn.title = user ? `${user.name} (${user.email})` : "Sign in";
  accountBtn.setAttribute("aria-label", user ? `Account: ${user.name}` : "Sign in");
}

accountBtn.addEventListener("click", openAccount);
document.addEventListener("auth-changed", renderAccountButton);
renderAccountButton();

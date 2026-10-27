// Accounts, sessions and saved payment methods.
//
// PROTOTYPE ONLY: there's no server yet, so accounts live in this browser's
// storage. Passwords are salted and hashed (PBKDF2) rather than stored as
// typed, but anything client-side can be read by whoever uses this browser —
// a real launch needs a backend for accounts and a payment processor (e.g.
// Stripe) for cards and Apple Pay.
//
// Payment methods never hold a full card number or CVC: only brand, last 4
// digits and expiry, the same details a processor hands back after it
// stores the card itself.

const USERS_KEY = "hub-users";
const SESSION_KEY = "hub-session";
const LEGACY_SUBS_KEY = "hub-subscriptions"; // subscriptions saved before accounts existed

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — changes last for this page view only.
  }
}

const toBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password, saltB64) {
  if (!crypto.subtle) {
    throw new Error("Accounts need a secure connection. Open the site over https or on localhost.");
  }
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, key, 256);
  return { salt: toBase64(salt), hash: toBase64(bits) };
}

const normalizeEmail = (email) => email.trim().toLowerCase();

const Auth = {
  _users: readJson(USERS_KEY, {}),
  _userId: readJson(SESSION_KEY, null),

  _save() {
    writeJson(USERS_KEY, this._users);
  },
  _setSession(userId) {
    this._userId = userId;
    writeJson(SESSION_KEY, userId);
    document.dispatchEvent(new Event("auth-changed"));
  },

  user() {
    return (this._userId && this._users[this._userId]) || null;
  },

  async signUp({ name, email, password }) {
    name = name.trim();
    email = normalizeEmail(email);
    if (!name) throw new Error("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
    if (Object.values(this._users).some((u) => u.email === email)) {
      throw new Error("An account with this email already exists. Log in instead.");
    }
    const { salt, hash } = await hashPassword(password);
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    this._users[id] = { id, name, email, salt, hash, createdAt: new Date().toISOString(), paymentMethods: [] };
    this._save();

    // Hand any subscriptions saved before accounts existed to the first account.
    const legacy = readJson(LEGACY_SUBS_KEY, null);
    if (legacy) {
      writeJson(`${LEGACY_SUBS_KEY}:${id}`, legacy);
      try {
        localStorage.removeItem(LEGACY_SUBS_KEY);
      } catch {}
    }

    this._setSession(id);
    return this.user();
  },

  async logIn({ email, password }) {
    const user = Object.values(this._users).find((u) => u.email === normalizeEmail(email));
    // Same message either way, so the form doesn't reveal which emails have accounts.
    const fail = new Error("That email and password don't match an account.");
    if (!user) throw fail;
    const { hash } = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw fail;
    this._setSession(user.id);
    return user;
  },

  logOut() {
    this._setSession(null);
  },

  // --- Payment methods ------------------------------------------------------

  paymentMethods() {
    return this.user()?.paymentMethods ?? [];
  },

  defaultPaymentMethod() {
    const methods = this.paymentMethods();
    return methods.find((m) => m.isDefault) || methods[0] || null;
  },

  addPaymentMethod(method) {
    const user = this.user();
    if (!user) throw new Error("Log in to add a payment method.");
    const isFirst = user.paymentMethods.length === 0;
    const saved = { id: `pm_${Date.now().toString(36)}`, addedAt: new Date().toISOString(), ...method, isDefault: isFirst };
    user.paymentMethods.push(saved);
    this._save();
    document.dispatchEvent(new Event("payment-methods-changed"));
    return saved;
  },

  setDefaultPaymentMethod(id) {
    for (const m of this.paymentMethods()) m.isDefault = m.id === id;
    this._save();
    document.dispatchEvent(new Event("payment-methods-changed"));
  },

  removePaymentMethod(id) {
    const user = this.user();
    user.paymentMethods = user.paymentMethods.filter((m) => m.id !== id);
    if (user.paymentMethods.length && !user.paymentMethods.some((m) => m.isDefault)) {
      user.paymentMethods[0].isDefault = true;
    }
    this._save();
    document.dispatchEvent(new Event("payment-methods-changed"));
  },
};

function paymentLabel(method) {
  if (!method) return "";
  if (method.type === "apple_pay") return "Apple Pay";
  return `${method.brand} •••• ${method.last4}`;
}

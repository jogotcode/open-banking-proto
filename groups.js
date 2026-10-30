// Friends (added with a daily code) and friend groups.
//
// Every account gets a fresh random friend code each day; yesterday's code
// stops working. Adding someone's code makes you friends both ways, since
// they chose to share it.
//
// A friend group is set up by one person (the organizer), who picks the
// monthly amount and how requests are approved, then invites friends. Each
// member pays monthly. Groups reuse hub memberships, requests and virtual
// cards, but aren't places on the map.
//
// PROTOTYPE: friends and groups are stored in this browser, so "friends"
// are other accounts created here. Sample friends make it easy to try.

const FRIENDS_KEY = "hub-friendships";
const GROUPS_KEY = "hub-groups";
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O or 1/I mix-ups

const todayKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local day

function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

function randomCode() {
  const chars = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_ALPHABET[b % 32]).join("");
  return `${chars.slice(0, 3)}-${chars.slice(3)}`;
}

const normalizeCode = (s) => s.toUpperCase().replace(/[^0-9A-Z]/g, "");

// Today's code for a user, generated the first time it's needed each day.
function friendCodeFor(user) {
  if (user.friendCodeDay !== todayKey()) {
    user.friendCode = randomCode();
    user.friendCodeDay = todayKey();
    Auth._save();
  }
  return user.friendCode;
}

// --- Friends ------------------------------------------------------------------

const Friends = {
  _all: readJson(FRIENDS_KEY, []),
  _save() {
    writeJson(FRIENDS_KEY, this._all);
    document.dispatchEvent(new Event("friends-changed"));
  },
  of(userId) {
    return this._all
      .filter((f) => f.a === userId || f.b === userId)
      .map((f) => ({ user: Auth._users[f.a === userId ? f.b : f.a], since: f.since }))
      .filter((f) => f.user)
      .sort((x, y) => x.user.name.localeCompare(y.user.name));
  },
  areFriends(a, b) {
    return this._all.some((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a));
  },
  addByCode(input) {
    const me = Auth.user();
    if (!me) throw new Error("Log in to add friends.");
    const code = normalizeCode(input);
    if (code.length !== 6) throw new Error("Friend codes have 6 letters and numbers, like K7Q-4ZP.");
    const owner = Object.values(Auth._users).find(
      (u) => u.friendCodeDay === todayKey() && normalizeCode(u.friendCode || "") === code
    );
    if (!owner) throw new Error("That code doesn't match anyone today. Codes change every day, so ask your friend for today's code.");
    if (owner.id === me.id) throw new Error("That's your own code. Share it with friends so they can add you.");
    if (this.areFriends(me.id, owner.id)) throw new Error(`You're already friends with ${owner.name}.`);
    this._all.push({ a: me.id, b: owner.id, since: new Date().toISOString() });
    this._save();
    return owner;
  },
  remove(friendId) {
    const me = Auth.user().id;
    this._all = this._all.filter((f) => !((f.a === me && f.b === friendId) || (f.a === friendId && f.b === me)));
    this._save();
  },
};

// Sample accounts to befriend in the prototype. They can also log in.
const SAMPLE_FRIENDS = [
  { name: "Maya Chen", email: "maya@example.com" },
  { name: "Leo Okafor", email: "leo@example.com" },
  { name: "Priya Shah", email: "priya@example.com" },
];
const SAMPLE_PASSWORD = "demo1234";

async function ensureSampleFriends() {
  const users = [];
  for (const sample of SAMPLE_FRIENDS) {
    let user = Object.values(Auth._users).find((u) => u.email === sample.email);
    if (!user) {
      const { salt, hash } = await hashPassword(SAMPLE_PASSWORD);
      const id = `sample-${sample.email.split("@")[0]}`;
      user = Auth._users[id] = {
        id,
        ...sample,
        salt,
        hash,
        sample: true,
        createdAt: new Date().toISOString(),
        paymentMethods: [{ id: `pm_${id}`, type: "card", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030, isDefault: true }],
      };
    }
    friendCodeFor(user);
    users.push(user);
  }
  Auth._save();
  return users;
}

// --- Groups -------------------------------------------------------------------

const GROUP_APPROVAL_STYLES = [
  APPROVAL_STYLES.find((a) => a.type === "member-vote"),
  {
    type: "organizer",
    label: "Organizer approves",
    describe: (h) => `${h.record.organizerName}, who set up the group, reviews and approves each request.`,
  },
  APPROVAL_STYLES.find((a) => a.type === "fcfs"),
  APPROVAL_STYLES.find((a) => a.type === "restricted"),
];

const groupRecords = readJson(GROUPS_KEY, []);

function saveGroups() {
  writeJson(GROUPS_KEY, groupRecords);
  document.dispatchEvent(new Event("groups-changed"));
}

function buildGroupHub(record) {
  const hub = {
    id: record.id,
    isGroup: true,
    record,
    name: record.name,
    country: "Friends group",
    purpose: { title: `${capitalize(record.category)} fund`, category: record.category, why: record.why },
    approval: GROUP_APPROVAL_STYLES.find((a) => a.type === record.approvalType),
    monthlyFee: record.monthlyFee,
    maxRequest: record.maxRequest,
    cardDays: record.cardDays,
    perPurchaseLimit: record.perPurchaseLimit,
    monthlyAllowance: record.monthlyAllowance,
    joinPolicy: "open",
    founded: new Date(record.createdAt).getFullYear(),
    why: record.why,
    impact: `cover ${record.category} for your group`, // reads after "helps" or "helping"
  };
  refreshGroup(hub);
  hub.approvalText = hub.approval.describe(hub);
  return hub;
}

// Members and pool: every member's monthly payment since the group started.
function refreshGroup(hub) {
  const r = hub.record;
  hub.members = r.members.length;
  hub.committeeSize = r.members.length;
  let months = 0;
  while (addMonths(r.createdAt, months) <= Date.now()) months++;
  hub.value = r.members.length * r.monthlyFee * Math.max(1, months);
}

for (const record of groupRecords) hubs.push(buildGroupHub(record));

const groupById = (id) => hubs.find((h) => h.isGroup && h.id === id);
const isMember = (group, userId) => group.record.members.includes(userId);
const pendingInvite = (group, userId) => group.record.invites.find((i) => i.userId === userId && i.status === "pending");

function myGroups() {
  const me = Auth.user();
  return me ? hubs.filter((h) => h.isGroup && isMember(h, me.id)) : [];
}

function myInvites() {
  const me = Auth.user();
  return me ? hubs.filter((h) => h.isGroup && pendingInvite(h, me.id)) : [];
}

function createGroup(fields, inviteIds) {
  const me = Auth.user();
  const now = new Date();
  const record = {
    id: `g-${now.getTime().toString(36)}`,
    organizerId: me.id,
    organizerName: me.name,
    createdAt: now.toISOString(),
    members: [me.id],
    invites: inviteIds.map((userId) => ({ userId, status: "pending", at: now.toISOString() })),
    ...fields,
  };
  groupRecords.push(record);
  const hub = buildGroupHub(record);
  hubs.push(hub);
  Subscriptions.add(hub, Auth.defaultPaymentMethod()); // the organizer pays too
  saveGroups();
  return hub;
}

function inviteFriends(group, userIds) {
  for (const userId of userIds) {
    if (isMember(group, userId) || pendingInvite(group, userId)) continue;
    group.record.invites = group.record.invites.filter((i) => i.userId !== userId);
    group.record.invites.push({ userId, status: "pending", at: new Date().toISOString() });
  }
  saveGroups();
}

function acceptInvite(group) {
  const me = Auth.user();
  const invite = pendingInvite(group, me.id);
  if (!invite) return;
  invite.status = "accepted";
  group.record.members.push(me.id);
  refreshGroup(group);
  Subscriptions.add(group, Auth.defaultPaymentMethod());
  saveGroups();
}

function declineInvite(group) {
  const invite = pendingInvite(group, Auth.user().id);
  if (invite) invite.status = "declined";
  saveGroups();
}

// When a membership ends for good, the person leaves the group.
document.addEventListener("membership-ended", (e) => {
  const group = groupById(e.detail);
  const me = Auth.user();
  if (!group || !me) return;
  group.record.members = group.record.members.filter((id) => id !== me.id);
  refreshGroup(group);
  saveGroups();
});

// Demo: invited sample friends accept, each with an active paid membership
// saved to their own account.
function demoAcceptInvites(group) {
  for (const invite of group.record.invites) {
    const user = Auth._users[invite.userId];
    if (invite.status !== "pending" || !user?.sample) continue;
    invite.status = "accepted";
    group.record.members.push(user.id);
    const key = `${LEGACY_SUBS_KEY}:${user.id}`;
    const subs = readJson(key, {});
    const now = new Date();
    subs[group.id] = {
      monthlyFee: group.monthlyFee,
      joinedAt: now.toISOString(),
      status: "active",
      paymentMethodId: user.paymentMethods[0]?.id,
      activatedAt: now.toISOString(),
      commitmentEndsAt: addMonths(now, 1).toISOString(),
    };
    writeJson(key, subs);
  }
  refreshGroup(group);
  saveGroups();
}

// Demo: move the group and the signed-in member's membership back in time.
function demoSkipGroup(group, days) {
  const shift = (iso) => iso && new Date(Date.parse(iso) - days * DAY_MS).toISOString();
  group.record.createdAt = shift(group.record.createdAt);
  const sub = Subscriptions.get(group.id);
  if (sub) {
    for (const key of ["joinedAt", "activatedAt", "commitmentEndsAt", "endsAt"]) if (sub[key]) sub[key] = shift(sub[key]);
    Subscriptions._save(Subscriptions.all());
  }
  refreshGroup(group);
  saveGroups();
}

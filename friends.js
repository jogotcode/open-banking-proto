// Friends panel (daily code, add by code, invites, groups, friends) and the
// group dialog (create a group, or view one you're in or invited to).

const friendsPanel = document.getElementById("friends");
const friendsBody = document.getElementById("friends-body");
const friendsToggle = document.getElementById("friends-toggle");
const groupDialog = document.getElementById("group-dialog");
const groupBody = document.getElementById("group-body");

let addMessage = null; // { ok, text } after trying a code
let showSamples = false;
let groupView = null; // { mode: "create" } or { mode: "view", id }
let groupDraft = null;
let groupError = "";
let lastDay = todayKey();

const initial = (user) => escapeHtml(user.name[0].toUpperCase());
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// --- Friends panel ------------------------------------------------------------

function updateFriendsChip() {
  const invites = myInvites().length;
  friendsToggle.textContent = invites ? `Friends · ${plural(invites, "invite")}` : "Friends";
}

function renderFriends() {
  updateFriendsChip();
  const me = Auth.user();
  if (!me) {
    friendsBody.innerHTML = `<div class="empty">
      <p><strong>Log in to add friends.</strong></p>
      <p>Friends can start money groups together.</p>
      <p><button type="button" data-action="log-in">Log in or sign up</button></p>
    </div>`;
    return;
  }

  const code = friendCodeFor(me);
  const friends = Friends.of(me.id);
  const groups = myGroups();
  const invites = myInvites();
  const samples = Object.values(Auth._users).filter((u) => u.sample && u.id !== me.id && !Friends.areFriends(me.id, u.id));

  friendsBody.innerHTML = `
    <div class="code-card">
      <span>Your friend code today</span>
      <strong class="friend-code" id="my-friend-code">${escapeHtml(code)}</strong>
      <small>New code in <span class="countdown" data-countdown="${nextMidnight().toISOString()}">${formatCountdown(nextMidnight() - Date.now())}</span>. Old codes stop working.</small>
      <button type="button" class="secondary small" data-action="copy-code">Copy code</button>
    </div>

    <form class="add-friend" data-form="add-friend" novalidate>
      <label class="field" for="friend-code-input"><span>Add a friend with their code</span></label>
      <div class="code-row">
        <input id="friend-code-input" name="code" placeholder="ABC-234" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" />
        <button type="submit">Add</button>
      </div>
      ${addMessage ? `<p class="add-msg ${addMessage.ok ? "ok" : "err"}" role="status">${escapeHtml(addMessage.text)}</p>` : ""}
    </form>

    <div class="demo-tools">
      <span>Demo: everything is saved in this browser, so friends are other accounts made here.</span>
      ${
        showSamples
          ? samples.length
            ? samples.map((u) => `<button type="button" class="secondary small" data-action="fill-code" data-code="${escapeHtml(u.friendCode)}">${escapeHtml(u.name)} · ${escapeHtml(u.friendCode)}</button>`).join("") +
              `<span>Sample friends can also log in with their email (e.g. maya@example.com) and the password ${SAMPLE_PASSWORD}.</span>`
            : `<span>You're friends with all the sample accounts.</span>`
          : `<button type="button" class="secondary small" data-action="show-samples">Show sample friends' codes</button>`
      }
    </div>

    ${
      invites.length
        ? `<section><h3>Invitations</h3>${invites
            .map(
              (g) => `<div class="invite-card">
                <strong>${escapeHtml(g.name)}</strong>
                <span>${escapeHtml(g.record.organizerName)} invited you · ${formatMoney(g.monthlyFee)}/month · ${escapeHtml(g.approval.label)}</span>
                <div class="card-actions">
                  <button type="button" class="secondary small" data-action="view-group" data-id="${g.id}">Details</button>
                  <button type="button" class="secondary small" data-action="decline" data-id="${g.id}">Decline</button>
                  <button type="button" class="small" data-action="accept" data-id="${g.id}">Join · ${formatMoney(g.monthlyFee)}/mo</button>
                </div>
              </div>`
            )
            .join("")}</section>`
        : ""
    }

    <section>
      <h3>Your groups</h3>
      ${groups
        .map(
          (g) => `<button type="button" class="group-row" data-action="view-group" data-id="${g.id}">
            <span class="group-net">${groupNetwork(g, { compact: true })}</span>
            <span><strong>${escapeHtml(g.name)}</strong><small>${plural(g.members, "member")} · ${formatMoney(g.monthlyFee)}/month each</small></span>
            <span class="chev" aria-hidden="true">›</span>
          </button>`
        )
        .join("")}
      ${
        friends.length
          ? `<button type="button" class="full" data-action="create-group">+ Create a group</button>`
          : `<p class="muted small">Add a friend first, then you can start a group together.</p>`
      }
    </section>

    <section>
      <h3>Friends${friends.length ? ` (${friends.length})` : ""}</h3>
      ${
        friends.length
          ? friends
              .map(
                ({ user, since }) => `<div class="friend-row">
                  <span class="avatar">${initial(user)}</span>
                  <span><strong>${escapeHtml(user.name)}</strong><small>Friends since ${formatDate(since)}</small></span>
                  <button type="button" class="link-btn danger-text" data-action="unfriend" data-id="${user.id}">Remove</button>
                </div>`
              )
              .join("")
          : `<p class="muted small">No friends yet. Share your code, or add someone else's.</p>`
      }
    </section>`;
}

function openFriends() {
  if (!filterPanel.hidden) filterToggle.click();
  if (typeof closeOffers === "function") closeOffers();
  closeMyHubs();
  closeWallet();
  renderFriends();
  friendsPanel.hidden = false;
  friendsToggle.classList.add("active");
  friendsToggle.setAttribute("aria-expanded", "true");
}

function closeFriends() {
  friendsPanel.hidden = true;
  addMessage = null;
  friendsToggle.classList.remove("active");
  friendsToggle.setAttribute("aria-expanded", "false");
}

friendsToggle.addEventListener("click", () => (friendsPanel.hidden ? openFriends() : closeFriends()));
document.getElementById("friends-close").addEventListener("click", closeFriends);
for (const toggle of [myHubsToggle, walletToggle, filterToggle]) toggle.addEventListener("click", closeFriends);

friendsBody.addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const friend = Friends.addByCode(e.target.code.value);
    addMessage = { ok: true, text: `You and ${friend.name} are now friends.` };
  } catch (err) {
    addMessage = { ok: false, text: err.message };
  }
  renderFriends();
});

friendsBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const group = btn.dataset.id && groupById(btn.dataset.id);
  switch (btn.dataset.action) {
    case "log-in":
      return openAuth({ reason: "Log in to add friends." });
    case "copy-code": {
      const code = Auth.user().friendCode;
      try {
        await navigator.clipboard.writeText(code);
        showStatus("Friend code copied");
      } catch {
        getSelection().selectAllChildren(document.getElementById("my-friend-code")); // copy by hand
      }
      return;
    }
    case "show-samples":
      await ensureSampleFriends();
      showSamples = true;
      return renderFriends();
    case "fill-code":
      friendsBody.querySelector("#friend-code-input").value = btn.dataset.code;
      return;
    case "unfriend":
      return Friends.remove(btn.dataset.id);
    case "create-group":
      return openCreateGroup();
    case "view-group":
      return openGroup(group);
    case "accept":
      return joinGroup(group);
    case "decline":
      return declineInvite(group);
  }
});

// Joining needs a payment method; the monthly payment starts right away.
function joinGroup(group) {
  if (!Auth.defaultPaymentMethod()) {
    openAddPayment({
      reason: `Add a payment method to join ${group.name} for ${formatMoney(group.monthlyFee)}/month.`,
      onDone: () => joinGroup(group),
    });
    return;
  }
  acceptInvite(group);
  showStatus(`You joined ${group.name}`);
}

// --- Group dialog: create -----------------------------------------------------

const GROUP_STYLE_TEXT = {
  "member-vote": "Everyone in the group votes on each request",
  organizer: "You approve each request yourself",
  fcfs: "Requests are paid in order until the month's pool runs out",
  restricted: (d) => `Everyone gets a card that only works for ${d.category}`,
};

function renderCreateGroup() {
  const d = groupDraft;
  const friends = Friends.of(Auth.user().id);
  const restricted = d.approvalType === "restricted";
  const styleText = (type) => (typeof GROUP_STYLE_TEXT[type] === "function" ? GROUP_STYLE_TEXT[type](d) : GROUP_STYLE_TEXT[type]);
  groupBody.innerHTML = `
    <header class="acct-head">
      <div><div class="dlg-eyebrow">New friends group</div><h2 tabindex="-1" autofocus>Create a group</h2></div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </header>
    <form data-form="group" novalidate>
      <label class="field"><span>Group name</span>
        <input name="groupName" maxlength="40" placeholder="e.g. Lisbon Trip Fund" value="${escapeHtml(d.name)}" /></label>
      <label class="field"><span>What will the money be for?</span>
        <select name="category">${PURPOSES.map((p) => `<option value="${p.category}" ${p.category === d.category ? "selected" : ""}>${capitalize(p.category)}</option>`).join("")}</select></label>
      <label class="field"><span>Note for your friends (optional)</span>
        <textarea name="why" rows="2" maxlength="200" placeholder="What's the plan?">${escapeHtml(d.why)}</textarea></label>
      <label class="field"><span>Monthly amount per person ($)</span>
        <input name="monthlyFee" type="number" min="1" max="500" value="${d.monthlyFee}" /></label>
      <div class="field"><span>How are requests approved?</span>
        ${GROUP_APPROVAL_STYLES.map(
          (a) => `<label class="choice"><input type="radio" name="approvalType" value="${a.type}" ${a.type === d.approvalType ? "checked" : ""} />
            <span><strong>${a.label}</strong><small>${escapeHtml(styleText(a.type))}</small></span></label>`
        ).join("")}
      </div>
      ${
        restricted
          ? `<div class="field-row two">
              <label class="field"><span>Limit per purchase ($)</span><input name="perPurchaseLimit" type="number" min="5" value="${d.perPurchaseLimit}" /></label>
              <label class="field"><span>Monthly allowance ($)</span><input name="monthlyAllowance" type="number" min="5" value="${d.monthlyAllowance}" /></label>
            </div>`
          : `<div class="field-row two">
              <label class="field"><span>Max per request ($)</span><input name="maxRequest" type="number" min="10" value="${d.maxRequest}" /></label>
              <label class="field"><span>Granted card lasts</span><select name="cardDays">${[7, 14, 30].map((n) => `<option value="${n}" ${n === d.cardDays ? "selected" : ""}>${n} days</option>`).join("")}</select></label>
            </div>`
      }
      <div class="field"><span>Invite friends</span>
        ${friends
          .map(
            ({ user }) => `<label class="choice"><input type="checkbox" name="invite" value="${user.id}" ${d.invite.includes(user.id) ? "checked" : ""} />
              <span><strong>${escapeHtml(user.name)}</strong></span></label>`
          )
          .join("")}
      </div>
      <p class="hint-box">Everyone pays ${formatMoney(d.monthlyFee)} a month. You start now; friends start when they accept. Requests open after each member's first month.</p>
      <p class="form-error" role="alert">${escapeHtml(groupError)}</p>
      <footer class="dlg-foot">
        <button type="button" class="secondary" data-action="close">Cancel</button>
        <button type="submit">Create group · ${formatMoney(d.monthlyFee)}/mo</button>
      </footer>
    </form>`;
}

function readGroupForm() {
  const form = groupBody.querySelector('[data-form="group"]');
  const d = groupDraft;
  d.name = form.groupName.value;
  d.category = form.category.value;
  d.why = form.why.value;
  d.monthlyFee = Number(form.monthlyFee.value);
  d.approvalType = form.querySelector('[name="approvalType"]:checked').value;
  if (form.maxRequest) d.maxRequest = Number(form.maxRequest.value);
  if (form.cardDays) d.cardDays = Number(form.cardDays.value);
  if (form.perPurchaseLimit) d.perPurchaseLimit = Number(form.perPurchaseLimit.value);
  if (form.monthlyAllowance) d.monthlyAllowance = Number(form.monthlyAllowance.value);
  d.invite = [...form.querySelectorAll('[name="invite"]:checked')].map((el) => el.value);
}

function validateGroup() {
  const d = groupDraft;
  if (d.name.trim().length < 3) return "Give the group a name (at least 3 characters).";
  if (!(d.monthlyFee >= 1 && d.monthlyFee <= 500)) return "Set a monthly amount between $1 and $500.";
  if (d.approvalType === "restricted") {
    if (!(d.perPurchaseLimit >= 5)) return "Set a per-purchase limit of at least $5.";
    if (!(d.monthlyAllowance >= d.perPurchaseLimit)) return "The monthly allowance should be at least the per-purchase limit.";
  } else if (!(d.maxRequest >= 10)) {
    return "Set a request cap of at least $10.";
  }
  if (!d.invite.length) return "Invite at least one friend.";
  return "";
}

function finishCreateGroup() {
  if (!Auth.defaultPaymentMethod()) {
    openAddPayment({
      reason: `Add a payment method for your ${formatMoney(groupDraft.monthlyFee)}/month share of ${groupDraft.name.trim()}.`,
      onDone: finishCreateGroup,
    });
    return;
  }
  const d = groupDraft;
  const group = createGroup(
    {
      name: d.name.trim(),
      category: d.category,
      why: d.why.trim(),
      monthlyFee: d.monthlyFee,
      approvalType: d.approvalType,
      maxRequest: d.maxRequest,
      cardDays: d.cardDays,
      perPurchaseLimit: d.perPurchaseLimit,
      monthlyAllowance: d.monthlyAllowance,
    },
    d.invite
  );
  showStatus(`${group.name} created. ${plural(d.invite.length, "friend")} invited.`);
  openGroup(group);
}

function openCreateGroup() {
  if (!Auth.user()) return openAuth({ reason: "Log in to create a group.", onDone: openCreateGroup });
  groupDraft = { name: "", category: PURPOSES[0].category, why: "", monthlyFee: 25, approvalType: "member-vote", maxRequest: 200, cardDays: 14, perPurchaseLimit: 50, monthlyAllowance: 200, invite: [] };
  groupError = "";
  groupView = { mode: "create" };
  renderGroupDialog();
  if (!groupDialog.open) groupDialog.showModal();
}

// --- Group network: members as silhouettes around the pool -------------------

// One person: a round badge with a head-and-shoulders silhouette inside.
function silhouette(x, y, r, cls) {
  const k = r / 20;
  return `<g class="net-person ${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <g class="net-pop"><g transform="scale(${k})">
      <circle r="20" class="net-node"/>
      <circle cy="-5" r="7" class="net-figure"/>
      <path d="M-12 15 C-12 6 -6 3 0 3 C6 3 12 6 12 15 Z" class="net-figure"/>
    </g></g></g>`;
}

function groupNetwork(group, { compact = false } = {}) {
  const me = Auth.user();
  const r = group.record;
  const people = [
    ...r.members.map((id) => ({ id, user: Auth._users[id], joined: true })),
    ...r.invites
      .filter((i) => i.status === "pending" && !r.members.includes(i.userId))
      .map((i) => ({ id: i.userId, user: Auth._users[i.userId], joined: false })),
  ].filter((p) => p.user);

  const W = compact ? 120 : 360;
  const H = compact ? 72 : 260;
  const cx = W / 2;
  const cy = compact ? H / 2 : 118;
  const rx = compact ? 46 : 132;
  const ry = compact ? 26 : 84;
  const nodeR = compact ? 8 : 20;
  const centerR = compact ? 12 : 36;
  const animate = !compact && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Spread people evenly around an ellipse, starting at the top.
  const pts = people.map((p, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, people.length);
    return { ...p, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), delay: 0.15 + i * 0.12 };
  });
  const joined = pts.filter((p) => p.joined);

  // Ring through the members, so everyone is linked to their neighbors too.
  const ring =
    joined.length >= 3
      ? `<path class="net-ring" d="M${joined.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} Z"/>`
      : joined.length === 2
        ? `<line class="net-ring" x1="${joined[0].x}" y1="${joined[0].y}" x2="${joined[1].x}" y2="${joined[1].y}"/>`
        : "";

  const spokes = pts
    .map(
      (p) => `<line class="net-line ${p.joined ? "" : "pending"} ${animate && p.joined ? "draw" : ""}" pathLength="1"
        x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${cx}" y2="${cy}" style="--d:${p.delay}s"/>`
    )
    .join("");

  // Dots travelling from each member to the pool: their monthly payments.
  const flows = animate
    ? joined
        .map(
          (p, i) => `<circle r="3" class="net-flow"><animateMotion dur="2.6s" begin="${(1 + i * 0.45).toFixed(2)}s" repeatCount="indefinite"
            path="M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${cx} ${cy}"/></circle>`
        )
        .join("")
    : "";

  const people_ = pts
    .map((p) => {
      const isMe = p.id === me?.id;
      const isOrganizer = p.id === r.organizerId;
      const cls = [p.joined ? "" : "pending", isMe ? "me" : "", animate ? "anim" : ""].join(" ");
      const label = compact
        ? ""
        : `<text class="net-name" x="${p.x.toFixed(1)}" y="${(p.y + nodeR + 14).toFixed(1)}">${escapeHtml(isMe ? "You" : p.user.name.split(" ")[0])}</text>
           ${p.joined ? "" : `<text class="net-sub" x="${p.x.toFixed(1)}" y="${(p.y + nodeR + 26).toFixed(1)}">Invited</text>`}`;
      const badge =
        !compact && isOrganizer
          ? `<g class="net-badge" transform="translate(${(p.x + nodeR * 0.75).toFixed(1)} ${(p.y - nodeR * 0.75).toFixed(1)})"><circle r="8"/><text y="3.5">★</text></g>`
          : "";
      return `<g style="--d:${p.delay}s">${silhouette(p.x, p.y, nodeR, cls)}${badge}${label}</g>`;
    })
    .join("");

  const center = `<g class="net-center ${animate ? "anim" : ""}">
      <circle cx="${cx}" cy="${cy}" r="${centerR}"/>
      ${
        compact
          ? `<text x="${cx}" y="${cy + 4}" class="net-center-mini">$</text>`
          : `<text x="${cx}" y="${cy - 2}" class="net-center-value">${formatShort(group.value)}</text>
             <text x="${cx}" y="${cy + 14}" class="net-center-label">pool</text>`
      }
    </g>`;

  const joinedCount = joined.length;
  const label = `${group.name}: ${joinedCount} member${joinedCount === 1 ? "" : "s"}${pts.length > joinedCount ? ` and ${pts.length - joinedCount} invited` : ""}, connected to a ${formatShort(group.value)} pool`;
  return `<svg class="net ${compact ? "compact" : ""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}" style="--hub-color:${colorFor(group.value)}">
    ${ring}${spokes}${flows}${center}${people_}
  </svg>`;
}

// --- Group dialog: view -------------------------------------------------------

function memberRows(group) {
  const me = Auth.user();
  const rows = group.record.members.map((id) => {
    const user = Auth._users[id] || { name: "Former member" };
    const tags = [id === group.record.organizerId && "Organizer", id === me?.id && "You"].filter(Boolean);
    return `<div class="friend-row"><span class="avatar">${initial(user)}</span>
      <span><strong>${escapeHtml(user.name)}</strong><small>${formatMoney(group.monthlyFee)}/month</small></span>
      ${tags.map((t) => `<span class="badge ${t === "You" ? "info" : "ok"}">${t}</span>`).join("")}</div>`;
  });
  for (const invite of group.record.invites.filter((i) => i.status !== "accepted")) {
    const user = Auth._users[invite.userId];
    if (!user || isMember(group, user.id)) continue;
    rows.push(`<div class="friend-row muted-row"><span class="avatar">${initial(user)}</span>
      <span><strong>${escapeHtml(user.name)}</strong><small>${invite.status === "pending" ? "Invited · hasn't joined yet" : "Declined"}</small></span></div>`);
  }
  return rows.join("");
}

function yourMembership(group) {
  const sub = Subscriptions.get(group.id);
  if (!sub) return "";
  const info = subscriptionInfo(sub);
  const blocker = fundsBlocker(group);
  const action = blocker
    ? `<p class="commit-note">${escapeHtml(blocker)}</p>`
    : group.approval.type === "restricted"
      ? `<button type="button" class="full" data-action="open-card">Use your ${escapeHtml(group.purpose.category)} card</button>`
      : openRequestFor(group)
        ? `<p class="commit-note">⏳ ${formatMoney(openRequestFor(group).amount)} request in review.</p>`
        : `<button type="button" class="full" data-action="request">Request funds</button>`;
  const progress =
    !info.unlocked && sub.status === "active"
      ? `<div class="commit"><div class="commit-row"><span>Your first month</span><span>${plural(info.daysLeft, "day")} left</span></div>
          <div class="progress"><span style="width:${Math.max(4, info.progress * 100)}%"></span></div></div>`
      : "";
  return `<section><h3>Your membership</h3>
    <p>You pay ${formatMoney(sub.monthlyFee)} a month${sub.status === "cancelling" ? `, until ${formatDate(sub.endsAt)}` : ""}.</p>
    ${progress}${action}</section>`;
}

function renderViewGroup() {
  const group = groupById(groupView.id);
  const me = Auth.user();
  const r = group.record;
  const invited = me && pendingInvite(group, me.id);
  const organizer = me && r.organizerId === me.id;
  const invitable = organizer ? Friends.of(me.id).filter(({ user }) => !isMember(group, user.id) && !pendingInvite(group, user.id)) : [];
  const samplePending = r.invites.some((i) => i.status === "pending" && Auth._users[i.userId]?.sample);

  groupBody.innerHTML = `
    <header class="dlg-head" style="--hub-color:${colorFor(group.value)}">
      <div>
        <div class="dlg-eyebrow">Friends group · organized by ${escapeHtml(r.organizerName)}</div>
        <h2 tabindex="-1" autofocus>${escapeHtml(group.name)}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">×</button>
    </header>
    <div class="network">${groupNetwork(group)}</div>
    <div class="dlg-stats">
      <div><span>Pool</span><strong>${formatMoney(group.value)}</strong></div>
      <div><span>Members</span><strong>${group.members}</strong></div>
      <div><span>Each pays</span><strong>${formatMoney(group.monthlyFee)}/mo</strong></div>
    </div>
    ${r.why ? `<section><h3>What it's for</h3><p>${escapeHtml(r.why)}</p></section>` : ""}
    ${invited ? `<p class="notice">${escapeHtml(r.organizerName)} invited you. Joining costs ${formatMoney(group.monthlyFee)} a month, and you can request funds after your first month.</p>` : ""}
    <section><h3>Members</h3>${memberRows(group)}</section>
    <section>
      <h3>How requests are approved</h3>
      <p><span class="chip">${escapeHtml(group.approval.label)}</span></p>
      <p>${escapeHtml(group.approvalText)}</p>
      <p class="muted">${escapeHtml(fundRuleText(group))}</p>
    </section>
    ${yourMembership(group)}
    ${
      invitable.length
        ? `<section><h3>Invite more friends</h3>
            ${invitable.map(({ user }) => `<label class="choice"><input type="checkbox" name="more" value="${user.id}" /><span><strong>${escapeHtml(user.name)}</strong></span></label>`).join("")}
            <div class="card-actions"><button type="button" class="secondary small" data-action="invite-more">Send invites</button></div>
          </section>`
        : ""
    }
    ${
      (organizer && samplePending) || Subscriptions.get(group.id)
        ? `<div class="demo-tools"><span>Demo controls</span>
            ${organizer && samplePending ? `<button type="button" class="secondary small" data-action="demo-accept">Invited sample friends accept</button>` : ""}
            ${Subscriptions.get(group.id) ? `<button type="button" class="secondary small" data-action="demo-skip">Skip ahead 7 days</button>` : ""}
          </div>`
        : ""
    }
    <footer class="dlg-foot">
      ${
        invited
          ? `<button type="button" class="secondary" data-action="decline">Decline</button>
             <button type="button" data-action="accept">Join · ${formatMoney(group.monthlyFee)}/mo</button>`
          : `${Subscriptions.get(group.id) ? `<button type="button" class="secondary" data-action="my-hubs">Manage in My hubs</button>` : ""}
             <button type="button" data-action="close">Done</button>`
      }
    </footer>`;
}

function renderGroupDialog() {
  if (!groupView) return;
  if (groupView.mode === "create") renderCreateGroup();
  else if (groupById(groupView.id)) renderViewGroup();
}

function openGroup(group) {
  groupView = { mode: "view", id: group.id };
  renderGroupDialog();
  if (!groupDialog.open) groupDialog.showModal();
}

groupBody.addEventListener("submit", (e) => {
  e.preventDefault();
  readGroupForm();
  groupError = validateGroup();
  if (groupError) return renderCreateGroup();
  finishCreateGroup();
});

// Choices that change what the form shows.
groupBody.addEventListener("change", (e) => {
  if (groupView?.mode !== "create") return;
  if (e.target.name === "approvalType" || e.target.name === "category" || e.target.name === "monthlyFee") {
    readGroupForm();
    renderCreateGroup();
  }
});

groupBody.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  const group = groupView?.id && groupById(groupView.id);
  switch (action) {
    case "close":
      return groupDialog.close();
    case "accept":
      return joinGroup(group);
    case "decline":
      declineInvite(group);
      return groupDialog.close();
    case "request":
      return openRequest(group);
    case "open-card":
      groupDialog.close();
      return openWallet(VirtualCards.all().find((c) => c.hubId === group.id && c.type === "category")?.id);
    case "my-hubs":
      groupDialog.close();
      return openMyHubs(group.id);
    case "invite-more": {
      const ids = [...groupBody.querySelectorAll('[name="more"]:checked')].map((el) => el.value);
      if (ids.length) {
        inviteFriends(group, ids);
        showStatus(`${plural(ids.length, "invite")} sent`);
      }
      return;
    }
    case "demo-accept":
      return demoAcceptInvites(group);
    case "demo-skip":
      return demoSkipGroup(group, 7);
  }
});

groupDialog.addEventListener("click", (e) => {
  if (e.target === groupDialog) groupDialog.close();
});

// --- Keep everything in sync ----------------------------------------------------

for (const event of ["friends-changed", "groups-changed", "auth-changed", "subscriptions-changed", "payment-methods-changed", "funds-changed"]) {
  document.addEventListener(event, () => {
    if (event === "auth-changed") {
      showSamples = false;
      addMessage = null;
      if (groupDialog.open) groupDialog.close();
    }
    if (!friendsPanel.hidden) renderFriends();
    else updateFriendsChip();
    if (groupDialog.open && groupView?.mode === "view") renderGroupDialog();
  });
}

// A new day brings a new code.
setInterval(() => {
  if (todayKey() === lastDay) return;
  lastDay = todayKey();
  if (!friendsPanel.hidden) renderFriends();
}, 30_000);

updateFriendsChip();

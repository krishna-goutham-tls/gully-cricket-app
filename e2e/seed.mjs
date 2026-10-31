// Makes the test accounts and communities on Convex dev. Safe to run again.
import { api, client, convexRun, NAMES, ORG_A, ORG_B, phone, PIN } from "./lib/env.mjs";
import { playOneOverMatch } from "./lib/play.mjs";

convexRun("e2e:guard");
const c = client();

async function account(role) {
  const res = await c.mutation(api.auth.signUp, {
    phone: phone(role),
    pin: PIN,
    displayName: NAMES[role],
  });
  return res;
}
const memberships = async (token) =>
  (await c.query(api.auth.bootstrap, { token })).memberships;

const owner = await account("owner");
convexRun("access:setPlatformAdmin", { phone: phone("owner"), value: true });

async function organiser(role, orgName) {
  await c.mutation(api.access.submitRequest, { name: NAMES[role], phone: phone(role) });
  const { pending, decided } = await c.query(api.access.listRequests, { token: owner.token });
  const req = [...pending, ...decided].find((r) => r.phone.endsWith(phone(role)));
  if (req.status !== "approved" && !req.used) {
    await c.mutation(api.access.approveRequest, { token: owner.token, requestId: req.requestId });
  }
  const me = await account(role);
  const found = (await memberships(me.token)).find((m) => m.orgName === orgName);
  const orgId = found ? found.orgId : (await c.mutation(api.orgs.create, { token: me.token, name: orgName, location: "Test ground" })).orgId;
  return { ...me, orgId };
}

const org = await organiser("organiser", ORG_A);
await organiser("otherOrganiser", ORG_B);

async function member(role) {
  const me = await account(role);
  const mine = (await memberships(me.token)).find((m) => String(m.orgId) === String(org.orgId));
  if (!mine) await c.mutation(api.orgs.requestJoin, { token: me.token, orgId: org.orgId });
  if (!mine || mine.status === "pending") {
    const pending = await c.query(api.orgs.listPending, { token: org.token, orgId: org.orgId });
    const row = pending.find((p) => String(p.userId) === String(me.user._id ?? me.user.id));
    if (row) await c.mutation(api.orgs.approveMember, { token: org.token, membershipId: row.membershipId ?? row._id });
  }
  return me;
}
await member("admin2");
await member("player");
await member("junior");
await member("visitor");

const players = await c.query(api.players.listOrgPlayers, { token: org.token, orgId: org.orgId });
const byName = (n) => players.find((p) => p.displayName === n);
const has = (p, tag) => (p.playerTags ?? p.tags ?? []).includes(tag);
for (const [name, tag] of [[NAMES.junior, "junior"], [NAMES.visitor, "visitor"]]) {
  const p = byName(name);
  if (!has(p, tag)) await c.mutation(api.players.togglePlayerTag, { token: org.token, orgId: org.orgId, userId: p.userId, tag });
}
if (!byName("E2E Added Phone")) {
  await c.mutation(api.players.addGuest, { token: org.token, orgId: org.orgId, name: "E2E Added Phone", phone: phone("addedWithPhone") });
}
if (!byName("E2E Added Nophone")) {
  await c.mutation(api.players.addGuest, { token: org.token, orgId: org.orgId, name: "E2E Added Nophone" });
}

const { matches } = await c
  .query(api.matches.list, { token: org.token, orgId: org.orgId })
  .then((r) => ({ matches: Array.isArray(r) ? r : r.matches ?? r.page ?? [] }));
if (!matches.some((m) => m.status === "completed")) {
  await playOneOverMatch(c, org, await c.query(api.players.listOrgPlayers, { token: org.token, orgId: org.orgId }));
}
console.log("Seed done");

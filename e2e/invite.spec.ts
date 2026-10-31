import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, convexRun, NAMES, ORG_B, PIN, phone } from "./lib/env.mjs";

// Everything runs in the second test community, so the match tests keep their
// own player list. Test numbers go back to being strangers before each test.
const PREFIX = phone("owner").slice(0, -2);
const fresh = `${PREFIX}31`;
const fresh2 = `${PREFIX}32`;

async function adminToken() {
  const res = await client().mutation(api.auth.signIn, {
    phone: phone("otherOrganiser"),
    pin: PIN,
  });
  const boot = await client().query(api.auth.bootstrap, { token: res.token });
  const org = boot.memberships.find((m: { orgName: string }) => m.orgName === ORG_B);
  return { token: res.token, orgId: org.orgId };
}

async function inviteCode() {
  const { token, orgId } = await adminToken();
  return (await client().mutation(api.orgs.getInvite, { token, orgId })).code as string;
}

async function typePin(page: Page) {
  for (const d of PIN.split("")) {
    await page.getByRole("button", { name: d, exact: true }).click();
  }
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

async function removeAddedNamed(name: string) {
  const { token, orgId } = await adminToken();
  const rows = await client().query(api.players.listOrgPlayers, { token, orgId });
  for (const r of rows.filter((p: { displayName: string }) => p.displayName.startsWith(name))) {
    await client().mutation(api.orgs.removeMember, { token, orgId, userId: r.userId });
  }
}

test.beforeEach(async () => {
  convexRun("e2e:forgetPhone", { phone: fresh });
  convexRun("e2e:forgetPhone", { phone: fresh2 });
  await removeAddedNamed("Zaheer");
});

test("a new player joins by link and lands on Home, and the admin sees New", async ({ page, browser }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const code = await inviteCode();
  const shots = `e2e/out/shots/${info.project.name}`;

  await open(page, `/i/${code}`);
  await expect(page.getByRole("heading", { name: ORG_B })).toBeVisible();
  await page.screenshot({ path: `${shots}/invite-phone.png` });
  await noSidewaysScroll(page);

  await page.getByLabel("Phone number").fill(fresh);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByLabel("Your name").fill("Link Player");
  await page.screenshot({ path: `${shots}/invite-name.png` });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Set a 4-digit PIN")).toBeVisible();
  await typePin(page);
  await expect(page.getByText("Same PIN again")).toBeVisible();
  await typePin(page);
  await page.waitForURL("**/home");
  await expect(page.getByText(ORG_B).first()).toBeVisible();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminPage = await ctx.newPage();
  await loginAs(adminPage, "otherOrganiser", ORG_B);
  await open(adminPage, "/players");
  const row = adminPage.locator("div").filter({ hasText: /^LPLink Player/ }).first();
  await expect(adminPage.getByText("Link Player")).toBeVisible();
  await expect(row.getByText("New")).toBeVisible();
  await adminPage.screenshot({ path: `${shots}/invite-players-new.png` });
  await ctx.close();
  expect(errors).toEqual([]);
});

test("a player with a PIN joins, and a signed-in player joins in one tap", async ({ page, browser }) => {
  const code = await inviteCode();
  // The test player belongs to the other community, so this is a real join.
  await open(page, `/i/${code}`);
  await page.getByLabel("Phone number").fill(phone("player"));
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("Your PIN")).toBeVisible();
  await typePin(page);
  await page.waitForURL("**/home");

  const { token, orgId } = await adminToken();
  const rows = await client().query(api.players.listOrgPlayers, { token, orgId });
  const me = rows.find((p: { displayName: string }) => p.displayName === NAMES.player);
  expect(me).toBeTruthy();

  // Removed, then back by link in one tap while signed in.
  await client().mutation(api.orgs.removeMember, { token, orgId, userId: me.userId });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const again = await ctx.newPage();
  await loginAs(again, "player");
  await open(again, `/i/${code}`);
  await again.getByRole("button", { name: "Join", exact: true }).click();
  await again.waitForURL("**/home");
  const after = await client().query(api.players.listOrgPlayers, { token, orgId });
  expect(after.find((p: { displayName: string }) => p.displayName === NAMES.player)).toBeTruthy();
  await client().mutation(api.orgs.removeMember, { token, orgId, userId: me.userId });
  await ctx.close();
});

test("a member opens their own link and only gets Open", async ({ page }) => {
  const code = await inviteCode();
  await loginAs(page, "otherOrganiser", ORG_B);
  await open(page, `/i/${code}`);
  await expect(page.getByRole("button", { name: /You’re in/ })).toBeVisible();
  await page.getByRole("button", { name: /You’re in/ }).click();
  await page.waitForURL("**/home");
  const { token, orgId } = await adminToken();
  const rows = await client().query(api.players.listOrgPlayers, { token, orgId });
  expect(rows.find((p: { displayName: string }) => p.displayName === NAMES.otherOrganiser).isAdmin).toBe(true);
});

test("Is this you: Yes keeps the old player, No makes a new one", async ({ page, context }, info) => {
  const { token, orgId } = await adminToken();
  const code = await inviteCode();
  const shots = `e2e/out/shots/${info.project.name}`;
  const { userId } = await client().mutation(api.players.addGuest, { token, orgId, name: "Zaheer Added" });

  await open(page, `/i/${code}`);
  await page.getByLabel("Phone number").fill(fresh);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByLabel("Your name").fill("Zaheer K");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Is this you?")).toBeVisible();
  await expect(page.getByText("Zaheer Added")).toBeVisible();
  await page.screenshot({ path: `${shots}/invite-is-this-you.png` });
  await page.getByRole("button", { name: "Yes" }).click();
  await typePin(page);
  await typePin(page);
  await page.waitForURL("**/home");
  const rows = await client().query(api.players.listOrgPlayers, { token, orgId });
  expect(rows.find((p: { userId: string }) => p.userId === userId).displayName).toBe("Zaheer K");

  // Number two says No to a second added player with a shared word.
  await client().mutation(api.players.addGuest, { token, orgId, name: "Zaheer Other" });
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await open(page, `/i/${code}`);
  await page.getByLabel("Phone number").fill(fresh2);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByLabel("Your name").fill("Zaheer New");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "No" }).click();
  await typePin(page);
  await typePin(page);
  await page.waitForURL("**/home");
  const later = await client().query(api.players.listOrgPlayers, { token, orgId });
  expect(later.filter((p: { displayName: string }) => p.displayName.startsWith("Zaheer"))).toHaveLength(3);
  expect(later.find((p: { displayName: string }) => p.displayName === "Zaheer Other").isGuest).toBe(true);
});

test("a bad code and an old code say the link stopped, with no form", async ({ page }) => {
  await open(page, "/i/nosuchcode");
  await expect(page.getByRole("heading", { name: "This link has stopped working" })).toBeVisible();
  await expect(page.getByLabel("Phone number")).toHaveCount(0);

  const { token, orgId } = await adminToken();
  const old = await inviteCode();
  const { code } = await client().mutation(api.orgs.resetInvite, { token, orgId });
  await open(page, `/i/${old}`);
  await expect(page.getByRole("heading", { name: "This link has stopped working" })).toBeVisible();
  await open(page, `/i/${code}`);
  await expect(page.getByRole("heading", { name: ORG_B })).toBeVisible();
});

test("admin: Invite players, the WhatsApp link, New link and Remove", async ({ page }, info) => {
  const shots = `e2e/out/shots/${info.project.name}`;
  const { token, orgId } = await adminToken();
  await client().mutation(api.players.addGuest, { token, orgId, name: "Zaheer Remove" });
  await loginAs(page, "otherOrganiser", ORG_B);
  await open(page, "/players");
  await page.getByRole("button", { name: "Invite players" }).click();
  const send = page.getByRole("link", { name: "Send on WhatsApp" });
  await expect(send).toBeVisible();
  await page.screenshot({ path: `${shots}/invite-sheet.png` });
  await noSidewaysScroll(page);
  const code = await inviteCode();
  expect(await send.getAttribute("href")).toContain(`%2Fi%2F${code}`);

  await page.getByRole("button", { name: "New link" }).click();
  await expect(page.getByText("Stop the old link?")).toBeVisible();
  await page.screenshot({ path: `${shots}/invite-new-link.png` });
  await page.getByRole("button", { name: "New link" }).last().click();
  await expect(send).not.toHaveAttribute("href", new RegExp(`%2Fi%2F${code}`));
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Remove Zaheer Remove" }).click();
  await expect(page.getByText("Their stats stay.")).toBeVisible();
  await page.screenshot({ path: `${shots}/remove-confirm.png` });
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Zaheer Remove")).toHaveCount(0);
});

test("a player sees no invite button and no remove button", async ({ page }) => {
  await loginAs(page, "player");
  await open(page, "/players");
  await expect(page.getByPlaceholder("Search players")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite players" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
});

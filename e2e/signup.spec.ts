import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, convexRun, ORG_A, PIN, phone } from "./lib/env.mjs";

// Open sign-up: one phone field, the number decides, then two cards.
const PREFIX = phone("owner").slice(0, -2);
const fresh = `${PREFIX}41`;
const fresh2 = `${PREFIX}42`;

/** Takes a test number's communities and account away, so it starts as a stranger. */
async function forget(num: string) {
  try {
    const { token } = await client().mutation(api.auth.signIn, { phone: num, pin: PIN });
    const boot = await client().query(api.auth.bootstrap, { token });
    for (const m of boot.memberships) {
      if (!m.isSandbox && m.orgName.startsWith("E2E Signup")) {
        convexRun("e2e:forgetOrg", { orgId: m.orgId });
      }
    }
  } catch {
    // No account on this number yet.
  }
  convexRun("e2e:forgetPhone", { phone: num });
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

test.beforeEach(async () => {
  await forget(fresh);
  await forget(fresh2);
});

test.afterAll(async () => {
  await forget(fresh);
  await forget(fresh2);
});

test("an unknown number signs up, taps I'm the admin, and lands on Home of a new community", async ({ page }, info) => {
  const shots = `e2e/out/shots/${info.project.name}`;
  const name = `E2E Signup ${Date.now().toString(36)}`;
  await open(page, "/");
  await page.getByLabel("Phone number").fill(fresh);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/login**");

  // The number is new, so the app asks for a name. Nobody picks "new".
  await page.getByLabel("Your name").fill("E2E Stranger");
  await page.getByRole("button", { name: "Next" }).click();
  await typePin(page);
  // The digits show, and there is no second PIN entry.
  await expect(page.locator("span.tabular", { hasText: PIN[0] }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/join");
  await expect(page.getByRole("button", { name: /I'm the admin/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /My team is already on Gully Cricket/ })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${shots}/join-cards.png`, fullPage: true });

  await page.getByRole("button", { name: /I'm the admin/ }).click();
  await page.waitForURL("**/org/new");
  await page.getByLabel("Community name").fill(name);
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL("**/home");
  await page.getByRole("button", { name: "Close" }).click();

  // One black button: Invite players. Start match steps back to secondary.
  const invite = page.getByRole("button", { name: "Invite players" });
  await expect(invite).toBeVisible();
  await expect(invite).toHaveClass(/bg-ink/);
  await expect(page.getByRole("link", { name: /Start match/ })).not.toHaveClass(/bg-ink/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/signup-home.png`, fullPage: true });

  // Krishna closes it: the member is sent back to the cards with one line.
  const owner = await client().mutation(api.auth.signIn, { phone: phone("owner"), pin: PIN });
  const rows = await client().query(api.admin.newCommunities, { token: owner.token });
  const row = rows.find((r: { name: string }) => r.name === name);
  expect(row.matches).toBe(0);
  await client().mutation(api.admin.setClosed, { token: owner.token, orgId: row.orgId, closed: true });
  await page.waitForURL("**/join");
  await expect(page.getByText(`${name} is closed.`)).toBeVisible();
  await client().mutation(api.admin.setClosed, { token: owner.token, orgId: row.orgId, closed: false });
  await expect(page.getByRole("button", { name: "Go to home" })).toBeVisible();
});

test("the other card shows only the link line", async ({ page }, info) => {
  const res = await client().mutation(api.auth.signUp, {
    phone: fresh2,
    pin: PIN,
    displayName: "E2E Stranger Two",
  });
  await page.addInitScript((t) => localStorage.setItem("cricket_session_token", t), res.token);
  await open(page, "/join");
  const card = page.getByRole("button", { name: /My team is already on Gully Cricket/ });
  await expect(card).toBeVisible();
  const before = await page.locator("main").locator("button, a").count();
  await card.click();
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByText("Ask your admin for the community link")).toBeVisible();
  await expect(card.getByText("gullycricket.space/i/…")).toBeVisible();
  expect(await page.locator("main").locator("button, a").count()).toBe(before);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/join-ask.png`, fullPage: true });
});

test("the landing hero shows the phone field and the live counter in the first fold", async ({ page }, info) => {
  await open(page, "/");
  const counter = page.getByTestId("live-counter");
  await expect(counter).toBeVisible();
  for (const label of ["Matches", "Runs", "Wickets", "Sixes", "Fours", "Catches"]) {
    await expect(counter.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(counter.locator("p.tabular").first()).toHaveText(/\d/);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByText("Register your community")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByLabel("Phone number")).toHaveCount(1);
  await noSidewaysScroll(page);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/landing-fold.png` });
  const vp = page.viewportSize()!;
  if (vp.width === 390 && vp.height === 844) {
    const box = (await counter.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  }
});

test("Records has a Community tab with the card, all time; other tabs do not show it", async ({ page }, info) => {
  const shots = `e2e/out/shots/${info.project.name}`;
  await loginAs(page, "organiser", ORG_A);
  await open(page, "/records");
  const card = page.getByTestId("community-card");
  await expect(page.getByRole("button", { name: "Honours" })).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Community" }).click();
  await expect(card.getByText(`${ORG_A} in numbers`)).toBeVisible();
  for (const label of ["Matches", "Runs", "Wickets", "Sixes", "Fours", "Catches", "Players"]) {
    await expect(card.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(card.getByText("Player of the community")).toBeVisible();
  await expect(page.getByText("All time")).toBeVisible();
  const leaders = page.getByTestId("community-leaders");
  await expect(leaders.getByText("Batting")).toBeVisible();
  await expect(leaders.getByRole("link").first()).toBeVisible();
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${shots}/records-community.png` });
  await page.getByRole("button", { name: "Milestones" }).click();
  await expect(card).toHaveCount(0);
});

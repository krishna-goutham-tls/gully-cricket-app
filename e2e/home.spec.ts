import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, convexRun, NAMES, ORG_A, ORG_B } from "./lib/env.mjs";
import { playOneOverMatch } from "./lib/play.mjs";

const setFeature = (token: string, orgId: string, key: string, on: boolean) =>
  client().mutation(api.orgs.setFeature, { token, orgId, key, on });

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

async function top(page: Page, locator: ReturnType<Page["getByText"]>) {
  const box = await locator.first().boundingBox();
  expect(box).toBeTruthy();
  return box!.y;
}

test("the tab bar is Home, Leaders, Players, Profile; Series only when it is on", async ({ page }) => {
  const { token, orgId } = await loginAs(page, "otherOrganiser", ORG_B);
  try {
    await setFeature(token, orgId, "series", false);
    await open(page, "/home");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link")).toHaveText(["Home", "Leaders", "Players", "Profile"]);
    await setFeature(token, orgId, "series", true);
    await expect(nav.getByRole("link")).toHaveText(["Home", "Series", "Leaders", "Players", "Profile"]);
  } finally {
    await setFeature(token, orgId, "series", true);
  }
});

test("Home reads top to bottom: start, last result, match day, then matches", async ({ page }, info) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  await open(page, "/home");

  const start = page.getByRole("link", { name: /Start match/ });
  const result = page.getByText("Last result", { exact: true });
  const day = page.getByText(/^(Your match day|Player of the Match) · /);
  const all = page.getByRole("link", { name: "All matches" });
  await expect(start).toBeVisible();
  await expect(result).toBeVisible();
  // The match-day card shows for 3 days after a match. Test data ages, so
  // finish a match today when the last one is older than that.
  if ((await day.count()) === 0) {
    const c = client();
    const players = await c.query(api.players.listOrgPlayers, { token, orgId });
    await playOneOverMatch(c, { token, orgId }, players);
    await page.reload();
    await expect(result).toBeVisible();
  }
  await expect(day.first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Share on WhatsApp" })).toBeVisible();
  await expect(all).toBeVisible();

  const ys = [await top(page, start), await top(page, result), await top(page, day), await top(page, all)];
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);

  // Gone from Home.
  await expect(page.getByText(/Who.s in/)).toHaveCount(0);
  await expect(page.getByText("Relive match day")).toHaveCount(0);
  await expect(page.getByText("No season yet")).toHaveCount(0);
  await expect(page.getByText("Honours & roasts")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Records/ })).toHaveCount(0);

  await noSidewaysScroll(page);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/home.png`, fullPage: true });

  // The card opens the scorecard.
  await result.click();
  await expect(page).toHaveURL(/\/matches\/[^/]+$/);
  expect(errors).toEqual([]);
});

test("Home for a new community: one black button and nothing else to read", async ({ page }, info) => {
  const name = `E2E New ${Date.now().toString(36)}`;
  const { token } = await loginAs(page, "owner");
  const before = await client().query(api.auth.bootstrap, { token });
  for (const m of before.memberships.filter((x: { orgName: string }) => x.orgName.startsWith("E2E New"))) {
    convexRun("e2e:forgetOrg", { orgId: m.orgId });
  }
  await open(page, "/org/new");
  await expect(page.getByText("You become admin. Invite players with a link.")).toBeVisible();
  await page.getByLabel(/name/i).first().fill(name);
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL("**/home");
  await page.getByRole("button", { name: "Close" }).click();
  try {
    await expect(page.getByText("No matches yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /Start match/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite players" })).toBeVisible();
    await expect(page.getByText("Last result", { exact: true })).toHaveCount(0);
    await expect(page.getByText("No season yet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start season" })).toHaveCount(0);
    // A new community has Series off: four tabs.
    await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(4);
    await noSidewaysScroll(page);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/home-empty.png`, fullPage: true });
  } finally {
    const boot = await client().query(api.auth.bootstrap, { token });
    const made = boot.memberships.find((m: { orgName: string }) => m.orgName === name);
    if (made) convexRun("e2e:forgetOrg", { orgId: made.orgId });
  }
});

test("Who's in? is gone: the old poll pages do not open", async ({ page }) => {
  await loginAs(page, "player", ORG_A);
  for (const path of ["/polls/abc", "/p/abc"]) {
    await open(page, path);
    await page.waitForTimeout(500);
    await expect(page.getByText(/Who.s in/)).toHaveCount(0);
  }
});

test("Leaders has a Records link, and no format filter with Test matches off", async ({ page }, info) => {
  await loginAs(page, "organiser", ORG_A);
  await open(page, "/leaderboard");
  await expect(page.locator("main").getByText(NAMES.organiser).first()).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Test or ODI" })).toHaveCount(0);
  await expect(page.getByLabel("Test or ODI")).toHaveCount(0);
  await noSidewaysScroll(page);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/leaders.png`, fullPage: true });
  await page.getByRole("link", { name: "Records" }).click();
  await expect(page).toHaveURL(/\/records$/);
});

test("match setup has no format choice with Test matches off; on brings it back", async ({ page }, info) => {
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  try {
    await setFeature(token, orgId, "testMatches", false);
    await open(page, "/matches/new");
    for (const n of [NAMES.organiser, NAMES.admin2, NAMES.player, NAMES.junior]) {
      await page.getByRole("button", { name: new RegExp(`^${n}`) }).first().click();
    }
    await page.getByRole("button", { name: /^Next · 4 playing/ }).click();
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await page.waitForTimeout(450);
    await page.getByRole("button", { name: /^Next · \d v \d/ }).click();
    await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
    const line = page.getByRole("button", { name: /^\d+ overs · / }).first();
    await expect(line).not.toContainText("ODI");
    await line.click();
    await expect(page.getByText("Overs", { exact: true })).toBeVisible();
    await expect(page.getByText("Format", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Test", exact: true })).toHaveCount(0);
    await noSidewaysScroll(page);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/match-setup.png`, fullPage: true });

    await setFeature(token, orgId, "testMatches", true);
    await expect(page.getByText("Format", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Test", exact: true })).toBeVisible();
  } finally {
    await setFeature(token, orgId, "testMatches", false);
  }
});

import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, NAMES, ORG_A } from "./lib/env.mjs";

// All tests share one community, so the last match is whatever ran last.
async function finishLiveMatch(page: Page, token: string) {
  const id = page.url().match(/matches\/([^/]+)\/score/)?.[1];
  if (id) await client().mutation(api.matches.remove, { token, matchId: id });
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

async function pickHere(page: Page, names: string[]) {
  for (const n of names) {
    await page.getByRole("button", { name: new RegExp(`^${n}`) }).first().click();
  }
}

test("a new match with an odd count: teams open split, one player on Both", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { token } = await loginAs(page, "organiser", ORG_A);
  await open(page, "/matches/new");
  const shots = `e2e/out/shots/${info.project.name}`;
  await expect(page.getByRole("heading", { name: "Who’s here?" })).toBeVisible();
  await pickHere(page, [NAMES.organiser, NAMES.admin2, NAMES.player, NAMES.junior, NAMES.visitor]);
  await page.screenshot({ path: `${shots}-start-1-who.png`, fullPage: true });
  await page.getByRole("button", { name: /^Next · 5 playing/ }).click();

  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByText("Plays both sides")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Both", pressed: true })).toHaveCount(1);
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${shots}-start-2-teams.png`, fullPage: true });

  // One tap moves a player. The odd player goes to a side, and back.
  const group = page.getByRole("group", { name: `Team for ${NAMES.visitor}` });
  await group.getByRole("button", { name: "A", exact: true }).click();
  await expect(group.getByRole("button", { name: "A", pressed: true })).toHaveCount(1);
  await group.getByRole("button", { name: "Both" }).click();
  await expect(group.getByRole("button", { name: "Both", pressed: true })).toHaveCount(1);
  await page.getByRole("button", { name: /^Next · \d v \d/ }).click();

  await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start scoring" })).toBeDisabled();
  await page.screenshot({ path: `${shots}-start-3-start.png`, fullPage: true });
  await page.getByRole("button", { name: "Team E2E", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Start scoring" })).toBeEnabled();
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${shots}-start-4-openers.png`, fullPage: true });

  // Settings stay one tap away.
  await page.getByRole("button", { name: /ODI|Test/ }).first().click();
  await expect(page.getByRole("button", { name: /^(Two|One)$/, pressed: true })).toBeVisible();
  await page.screenshot({ path: `${shots}-start-5-settings.png`, fullPage: true });

  await page.getByRole("button", { name: "Start scoring" }).click();
  await page.waitForURL(/\/score/);
  await expect(page.getByRole("button", { name: "Players" })).toBeVisible();
  await finishLiveMatch(page, token);
  expect(errors).toEqual([]);
});

test("a repeat match takes 3 taps from this screen, on settings from the last match", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A new browser has nothing saved on the phone, so it copies a second phone.
  const { token, orgId } = await loginAs(page, "player", ORG_A);
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  const id = (n: string) => players.find((p) => p.displayName === n).userId;
  const made = await client().mutation(api.matches.create, {
    token, orgId, overs: 7, oversPerPlayer: 4,
    sideAPlayerIds: [id(NAMES.organiser), id(NAMES.admin2)],
    sideBPlayerIds: [id(NAMES.player), id(NAMES.junior)],
  });
  await open(page, "/matches/new");
  await page.getByRole("button", { name: /Reuse last teams/ }).click();
  await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
  await expect(page.getByText(/7 overs · 4 overs each/)).toBeVisible();
  await page.getByRole("button", { name: "Team E2E", exact: true }).first().click();
  await page.getByRole("button", { name: "Start scoring" }).click();
  await page.waitForURL(/\/score/);
  await expect(page.getByRole("button", { name: "Players" })).toBeVisible();
  await finishLiveMatch(page, token);
  await client().mutation(api.matches.remove, { token, matchId: made.matchId ?? made });
  expect(errors).toEqual([]);
});

test("moving an opener to the other team and going back keeps a valid start", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { token } = await loginAs(page, "organiser", ORG_A);
  await open(page, "/matches/new");
  await pickHere(page, [NAMES.organiser, NAMES.admin2, NAMES.player, NAMES.junior, NAMES.visitor]);
  await page.getByRole("button", { name: /^Next · 5 playing/ }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: /^Next · 3 v 3/ }).click();
  await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
  await page.getByRole("button", { name: "Team E2E", exact: true }).first().click();
  // The last match sets the default, so choose two batters for this test.
  await page.getByRole("button", { name: /ODI|Test/ }).first().click();
  await page.getByRole("button", { name: "Two", exact: true }).click();
  const striker = await page.getByRole("button", { name: /^Striker/ }).innerText();
  const strikerName = striker.split("\n").pop()!.trim();

  await page.waitForTimeout(450);
  await page.getByRole("button", { name: /Team E2E v Team E2E/ }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  const row = page.getByRole("group", { name: `Team for ${strikerName}` });
  await row.getByRole("button", { name: "B", exact: true }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
  const now = await page.getByRole("button", { name: /^Striker/ }).innerText();
  expect(now).not.toContain(strikerName);

  await page.getByRole("button", { name: "Start scoring" }).click();
  await page.waitForURL(/\/score/);
  await expect(page.getByRole("button", { name: "Players" })).toBeVisible();
  await finishLiveMatch(page, token);
  expect(errors).toEqual([]);
});

test("one batter at a time starts with no non-striker", async ({ page }) => {
  const { token } = await loginAs(page, "organiser", ORG_A);
  await open(page, "/matches/new");
  await pickHere(page, [NAMES.organiser, NAMES.admin2, NAMES.player, NAMES.junior]);
  await page.getByRole("button", { name: /^Next · 4 playing/ }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: /^Next · 2 v 2/ }).click();
  await page.getByRole("button", { name: "Team E2E", exact: true }).first().click();
  await page.getByRole("button", { name: /ODI|Test/ }).first().click();
  await page.getByRole("button", { name: "One", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Non-striker/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Start scoring" }).click();
  await page.waitForURL(/\/score/);
  await expect(page.getByRole("button", { name: "Players" })).toBeVisible();
  await finishLiveMatch(page, token);
});

test("a late player joins mid-match in 3 taps, and Done is always in view", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  const id = (n: string) => players.find((p) => p.displayName === n).userId;
  const sideA = [id(NAMES.organiser), id(NAMES.admin2)];
  const sideB = [id(NAMES.player), id(NAMES.junior)];
  const made = await client().mutation(api.matches.create, {
    token, orgId, sideAPlayerIds: sideA, sideBPlayerIds: sideB, overs: 2,
  });
  const matchId = made.matchId ?? made;
  await client().mutation(api.scoring.setBattingFirst, { token, matchId, side: "A" });
  await client().mutation(api.scoring.startInnings, {
    token, matchId, strikerId: sideA[0], nonStrikerId: sideA[1], openingBowlerId: sideB[0],
  });
  await open(page, `/matches/${matchId}/score`);
  await page.getByRole("button", { name: "Players" }).click();

  const done = page.getByRole("button", { name: "Done" });
  await expect(done).toBeInViewport();
  await expect(page.getByText(/turned up late/i)).toHaveCount(0);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}-sheet-1.png` });

  // Late player: one tap on a team, one on Done.
  const visitor = page.getByRole("group", { name: `Team for ${NAMES.visitor}` });
  await visitor.getByRole("button", { name: "A", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${NAMES.visitor} · A` })).toBeVisible();
  await expect(done).toBeInViewport();

  // A new name: type, Add, team.
  const fresh = `E2E Late ${info.project.name}`;
  await page.getByLabel("Search or add a name").fill(fresh);
  // A keyboard covers the bottom of the screen. Done must rise above it.
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, "height", { configurable: true, get: () => window.innerHeight - 280 });
    vv.dispatchEvent(new Event("resize"));
  });
  const box = (await done.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height - 280);
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    delete (vv as unknown as Record<string, unknown>).height;
    vv.dispatchEvent(new Event("resize"));
  });
  const add = page.getByRole("button", { name: `Add “${fresh}”` });
  if (await add.isVisible().catch(() => false)) await add.click();
  const row = page.getByRole("group", { name: `Team for ${fresh}` });
  await row.getByRole("button", { name: "B", exact: true }).click();
  await expect(row.getByRole("button", { name: "B", pressed: true })).toBeVisible();
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}-sheet-2.png` });
  await expect(done).toBeInViewport();
  await page.getByLabel("Search or add a name").fill("");

  // Players already in sit one tap away. A captain cannot leave their team.
  await page.getByRole("button", { name: /In this match/ }).click();
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}-sheet-3.png` });
  const captain = page.getByRole("group", { name: `Team for ${NAMES.organiser}` });
  await expect(captain.getByRole("button", { name: "B", exact: true })).toBeDisabled();
  await expect(done).toBeInViewport();
  await done.click();
  await expect(done).toHaveCount(0);

  const live = await client().query(api.matches.get, { token, matchId });
  expect(live.sideAPlayers.map((p) => p.displayName)).toContain(NAMES.visitor);
  expect(live.sideBPlayers.map((p) => p.displayName)).toContain(fresh);
  await client().mutation(api.matches.remove, { token, matchId });
  expect(errors).toEqual([]);
});

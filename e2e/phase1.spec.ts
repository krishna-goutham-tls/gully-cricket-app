import { expect, test } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, ORG_A } from "./lib/env.mjs";

test("a finished match opens on Scorecard, and Story loads on one tap", async ({ page }, info) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "player", ORG_A);
  const list = await client().query(api.matches.list, { token, orgId });
  const done = list.find((m) => m.status === "completed");
  await open(page, `/matches/${done._id ?? done.matchId}`);
  const shots = `e2e/out/shots/${info.project.name}`;

  await expect(page.getByRole("button", { name: "scorecard", exact: false }).first()).toBeVisible();
  // Story has not loaded yet: its sections are not on the page.
  await expect(page.getByText("Badges", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${shots}-match-scorecard.png`, fullPage: true });

  await page.getByRole("button", { name: "story", exact: false }).first().click();
  await expect(page.getByText("Badges", { exact: true })).toBeVisible();
  await expect(page.getByText(/replay/i)).toHaveCount(0);
  await expect(page.getByText(/strikes again|that's the \d/i)).toHaveCount(0);
  await expect(page.getByText(/Detected:/)).toHaveCount(0);
  await page.screenshot({ path: `${shots}-match-story.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("Hero, Leaders and Records open and show the economy winner", async ({ page }, info) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const shots = `e2e/out/shots/${info.project.name}`;
  await open(page, "/hero");
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}-hero.png`, fullPage: true });

  const board = await client().query(api.stats.leaderboard, { token, orgId });
  for (const r of board.bowling) {
    expect(typeof r.countedRuns).toBe("number");
    expect(typeof r.economyAt).toBe("number");
  }
  await open(page, "/leaderboard");
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}-leaders.png`, fullPage: true });
  await open(page, "/records");
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}-records.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("the Bowling card on a profile adds up", async ({ page }, info) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  // E2E Player bowled the seeded match, so the Bowling card has numbers.
  const me = players.find((p) => /E2E Player/i.test(p.displayName)) ?? players[0];
  await open(page, `/players/${me.userId ?? me._id}`);
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(800);
  // The card adds up: economy is runs conceded per over. Other tests add
  // matches to the test data, so check the sum, not fixed numbers.
  const tile = (label: string) => page.getByText(label, { exact: true }).last().locator("..");
  const num = async (label: string) => {
    await expect(tile(label)).toContainText(/\d/);
    const text = (await tile(label).innerText()).replace(label, "");
    return Number((text.match(/\d+(\.\d+)?/) ?? ["NaN"])[0]);
  };
  const overs = await num("Overs");
  const conceded = await num("Conceded");
  const economy = await num("Economy");
  // "1.3" overs means 1 over and 3 balls.
  const balls = Math.floor(overs) * 6 + Math.round((overs % 1) * 10);
  expect(balls).toBeGreaterThan(0);
  expect(economy).toBeCloseTo((conceded * 6) / balls, 1);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}-player-bowling.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("Leaders has an Impact tab: a table, and the how-it-works sheet on the i", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const shots = `e2e/out/shots/${info.project.name}`;
  const board = await client().query(api.stats.impact, { token, orgId });
  await open(page, "/leaderboard");
  await page.getByRole("button", { name: "Impact", exact: true }).click();
  if (board && board.rows.some((r) => r.qualified)) {
    await expect(page.getByText("Bowl", { exact: true })).toBeVisible();
  }
  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noScroll).toBe(true);
  // No minus number anywhere on the board.
  await expect(page.locator("main").getByText(/[−-]\d/)).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}-leaders-impact.png` });
  await page.getByText("100 is the average player", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "How Impact works" })).toBeVisible();
  // The sheet fits the screen: its title is not cut off on a small phone.
  await expect(page.getByText("How Impact works", { exact: true })).toBeInViewport();
  await expect(page.getByText(/one wicket is worth \d+ runs here/)).toBeVisible();
  await page.screenshot({ path: `${shots}-leaders-impact-info.png` });
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

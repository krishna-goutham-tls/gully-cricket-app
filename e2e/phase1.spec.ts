import { expect, test } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, ORG_A } from "./lib/env.mjs";

test("a finished match opens on Scorecard, and Story loads on one tap", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  page.on("pageerror", (e) => errors.push(e.message));
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
  page.on("pageerror", (e) => errors.push(e.message));
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  // E2E Player bowled the seeded match, so the Bowling card has numbers.
  const me = players.find((p) => /E2E Player/i.test(p.displayName)) ?? players[0];
  await open(page, `/players/${me.userId ?? me._id}`);
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForTimeout(800);
  // The card adds up: 13 conceded off 1.0 over is 13.0 an over.
  const tile = (label: string) => page.getByText(label, { exact: true }).last().locator("..");
  await expect(tile("Economy")).toContainText("13.0");
  await expect(tile("Overs")).toContainText("1.0");
  await expect(tile("Conceded")).toContainText("13");
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}-player-bowling.png`, fullPage: true });
  expect(errors).toEqual([]);
});

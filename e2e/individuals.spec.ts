import { expect, test } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, NAMES, ORG_A } from "./lib/env.mjs";

async function noSidewaysScroll(page: import("@playwright/test").Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

test("individuals: set up, score, end, standings on every screen", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token } = await loginAs(page, "organiser", ORG_A);
  const shots = `e2e/out/shots/${info.project.name}`;
  await open(page, "/matches/new");
  await expect(page.getByRole("heading", { name: "Who’s here?" })).toBeVisible();

  await page.getByRole("button", { name: "Individuals", exact: true }).click();
  for (const n of [NAMES.organiser, NAMES.admin2, NAMES.player]) {
    await page.getByRole("button", { name: new RegExp(`^${n}`) }).first().click();
  }
  await page.screenshot({ path: `${shots}-ind-1-who.png`, fullPage: true });
  await page.getByRole("button", { name: /^Next · 3 playing/ }).click();

  await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
  await expect(page.getByText("Batting order")).toBeVisible();
  await noSidewaysScroll(page);
  await page.screenshot({ path: `${shots}-ind-2-start.png`, fullPage: true });
  const start = page.getByRole("button", { name: "Start scoring" });
  if (await start.isDisabled()) {
    await page.getByRole("button", { name: /^Bowler/ }).click();
    await page.getByRole("button", { name: NAMES.admin2, exact: true }).click();
  }
  await start.click();
  await page.waitForURL(/\/score/);
  const matchId = page.url().match(/matches\/([^/]+)\/score/)![1];

  try {
    for (const runsBat of [4, 1, 6]) {
      await client().mutation(api.scoring.recordBall, { token, matchId, runsBat });
    }
    await expect(page.getByText(/Individuals ·/).first()).toBeVisible();
    await noSidewaysScroll(page);
    await page.screenshot({ path: `${shots}-ind-3-pad.png`, fullPage: true });

    await open(page, `/matches/${matchId}/watch`);
    await expect(page.getByText("Standings")).toBeVisible();
    await noSidewaysScroll(page);
    await page.screenshot({ path: `${shots}-ind-4-watch.png`, fullPage: true });

    await page.goto(`/m/${matchId}`);
    await expect(page.getByText("Standings")).toBeVisible();
    await noSidewaysScroll(page);
    await page.screenshot({ path: `${shots}-ind-5-public-live.png`, fullPage: true });

    await client().mutation(api.scoring.endInnings, { token, matchId });
    await open(page, `/matches/${matchId}`);
    await expect(page.getByText(/won · \d+ pts|share the win/).first()).toBeVisible();
    await expect(page.getByLabel("Winner").first()).toBeVisible();
    await noSidewaysScroll(page);
    await page.screenshot({ path: `${shots}-ind-6-result.png`, fullPage: true });

    await page.goto(`/m/${matchId}`);
    await expect(page.getByText(/won · \d+ pts|share the win/).first()).toBeVisible();
    await page.screenshot({ path: `${shots}-ind-7-public-result.png`, fullPage: true });

    await open(page, "/");
    await expect(page.getByText(/^3 players · /).first()).toBeVisible();
    const card = page.getByRole("link").filter({ hasText: "Last result" });
    await expect(card.getByText("Player of the Match")).toHaveCount(0);
    await page.screenshot({ path: `${shots}-ind-8-home.png`, fullPage: true });
  } finally {
    await client().mutation(api.matches.remove, { token, matchId });
  }
  expect(errors).toEqual([]);
});

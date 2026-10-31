import { expect, test } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, ORG_A } from "./lib/env.mjs";

async function noSidewaysScroll(page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

test("public pages render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/", "/login", "/gully-rules"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await noSidewaysScroll(page);
  }
  expect(errors).toEqual([]);
});

const SCREENS = ["/home", "/matches", "/leaderboard", "/players", "/profile", "/tournaments", "/matches/new"];

test("signed-in screens render for an admin", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAs(page, "organiser", ORG_A);
  for (const path of SCREENS) {
    await open(page, path);
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForTimeout(800);
    expect(page.url(), `${path} stays signed in`).not.toContain("/login");
    await noSidewaysScroll(page);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}${path.replace(/\//g, "-")}.png` });
  }
  expect(errors).toEqual([]);
});

test("a completed match opens", async ({ page }) => {
  const { token, orgId } = await loginAs(page, "player", ORG_A);
  const list = await client().query(api.matches.list, { token, orgId });
  const done = list.find((m) => m.status === "completed");
  await page.goto(`/matches/${done._id ?? done.matchId}`);
  await expect(page.getByText(/Scorecard/i).first()).toBeVisible();
  await noSidewaysScroll(page);
});

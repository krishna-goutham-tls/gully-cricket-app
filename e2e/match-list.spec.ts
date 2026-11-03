import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, convexRun, ORG_A } from "./lib/env.mjs";

// A card's date: "Sat 1 Nov", with the year only when it is not this year.
const DATE = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})? · /;
const PREFIX = "E2E Pages";

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

/** A throwaway community owned by the test owner, with three guests to pick. */
async function freshCommunity(token: string) {
  const c = client();
  const boot = await c.query(api.auth.bootstrap, { token });
  for (const m of boot.memberships.filter((x: { orgName: string }) => x.orgName.startsWith(PREFIX))) {
    convexRun("e2e:forgetOrg", { orgId: m.orgId });
  }
  const { orgId } = await c.mutation(api.orgs.create, {
    token,
    name: `${PREFIX} ${Date.now().toString(36)}`,
  });
  for (const name of ["Pages Guest One", "Pages Guest Two", "Pages Guest Three"]) {
    await c.mutation(api.players.addGuest, { token, orgId, name });
  }
  const players: Array<{ userId: string }> = await c.query(api.players.listOrgPlayers, { token, orgId });
  const ids = players.map((p) => p.userId);
  return { orgId, sides: [ids.slice(0, 2), ids.slice(2, 4)] };
}

/** Signs in as the owner, then switches the app to `orgId`. */
async function openAs(page: Page, orgId: string, path: string) {
  await page.addInitScript((o) => localStorage.setItem("cricket_active_org", o), String(orgId));
  await open(page, path);
}

test("a running series has its own block above the season line; the season page has no series", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { token } = await loginAs(page, "owner");
  const c = client();
  const { orgId, sides } = await freshCommunity(token);
  try {
    await c.mutation(api.orgs.setFeature, { token, orgId, key: "series", on: true });
    const seasonId = await c.mutation(api.seasons.start, { token, orgId });
    await c.mutation(api.tournaments.create, {
      token,
      orgId,
      name: "Pages Cup",
      format: "limited",
      oversPerInnings: 2,
      sideAName: "Reds",
      sideBName: "Blues",
      sideASquadIds: sides[0],
      sideBSquadIds: sides[1],
    });
    // One match in the season, called off, so the season page has a card.
    const { matchId } = await c.mutation(api.matches.create, {
      token,
      orgId,
      sideAPlayerIds: sides[0],
      sideBPlayerIds: sides[1],
      overs: 2,
    });
    await c.mutation(api.matches.abandon, { token, matchId });

    await openAs(page, orgId, "/home");
    const series = page.getByTestId("home-series");
    const season = page.getByTestId("home-season-line");
    await expect(series.getByText("Pages Cup")).toBeVisible();
    await expect(series.getByText("Series", { exact: true })).toBeVisible();
    await expect(season).toBeVisible();
    const s = (await series.boundingBox())!;
    const l = (await season.boundingBox())!;
    expect(s.y + s.height).toBeLessThanOrEqual(l.y);
    await noSidewaysScroll(page);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/home-series.png`, fullPage: true });

    await open(page, `/seasons/${seasonId}`);
    await expect(page.getByRole("link", { name: /Season cards/ })).toBeVisible();
    await expect(page.locator('a[href^="/tournaments/"]')).toHaveCount(0);
    await expect(page.getByText("Pages Cup")).toHaveCount(0);
    await expect(page.locator(`main a[href="/matches/${matchId}"]`)).toContainText(DATE);
    await expect(page.locator("main .animate-pulse")).toHaveCount(0);
    await noSidewaysScroll(page);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/season.png`, fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    convexRun("e2e:forgetOrg", { orgId });
  }
});

test("match cards and the last result show the day and date", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAs(page, "organiser", ORG_A);

  await open(page, "/home");
  const last = page.getByRole("link", { name: /Last result/ });
  await expect(last).toBeVisible();
  await expect(last).toContainText(DATE);

  await open(page, "/matches");
  // A finished match. A live card leaves the date out: it is today's game.
  const card = page
    .locator("main a[href^='/matches/']:not([href$='/watch']):not([href$='/score'])")
    .first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(DATE);
  await noSidewaysScroll(page);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/matches.png`, fullPage: true });

  expect(errors).toEqual([]);
});

test("All matches shows 20, and Load more adds the rest", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { token } = await loginAs(page, "owner");
  const c = client();
  const { orgId, sides } = await freshCommunity(token);
  try {
    for (let i = 0; i < 23; i++) {
      await c.mutation(api.matches.create, {
        token,
        orgId,
        sideAPlayerIds: sides[0],
        sideBPlayerIds: sides[1],
        overs: 2,
      });
    }
    await openAs(page, orgId, "/matches");
    const cards = page.locator("main a[href^='/matches/']");
    const more = page.getByRole("button", { name: "Load more" });
    await expect(more).toBeVisible();
    await expect(cards).toHaveCount(20);
    await more.click();
    await expect(cards).toHaveCount(23);
    await expect(more).toHaveCount(0);
    await noSidewaysScroll(page);
    expect(errors).toEqual([]);
  } finally {
    convexRun("e2e:forgetOrg", { orgId });
  }
});

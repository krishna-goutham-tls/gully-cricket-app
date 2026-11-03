import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, NAMES, ORG_A } from "./lib/env.mjs";

// Series runs in the first community, which has players. Each test puts the
// Series switch back the way it found it and deletes the series it made.
async function seriesOn(token: string, orgId: string) {
  const boot = await client().query(api.auth.bootstrap, { token });
  const was = !!boot.memberships.find((m: { orgId: string }) => m.orgId === orgId)?.features?.series;
  await client().mutation(api.orgs.setFeature, { token, orgId, key: "series", on: true });
  return () => client().mutation(api.orgs.setFeature, { token, orgId, key: "series", on: was });
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

test("a new series opens split by rank; one tap moves, takes out or crowns a player", async ({ page }, info) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const restore = await seriesOn(token, orgId);
  const shots = `e2e/out/shots/${info.project.name}`;
  let tournamentId: string | undefined;
  try {
    await open(page, "/tournaments/new");
    await expect(page.getByRole("heading", { name: "Who’s in this series?" })).toBeVisible();
    // Step 1: tap who plays, the same picker as match setup.
    for (const n of [NAMES.organiser, NAMES.admin2, NAMES.player, NAMES.junior, NAMES.visitor]) {
      await page.getByRole("button", { name: new RegExp(`^${n}`) }).first().click();
    }
    await page.screenshot({ path: `${shots}-series-1-who.png`, fullPage: true });
    await page.getByRole("button", { name: /^Next · 5 playing/ }).click();

    // Step 2: split by rank. Only the 5 picked are in; the rest are Not playing.
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    const organiser = page.getByRole("group", { name: `Team for ${NAMES.organiser}` });
    await expect(organiser.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Both", pressed: true })).toHaveCount(1);
    await expect(page.getByText("Not playing", { exact: true })).toBeVisible();
    const left = page.getByRole("group", { name: "Team for E2E Added Nophone" });
    await expect(left.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /, captain$/ })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Name the series" })).toBeDisabled();
    // No Core, no "Add here" step, no paragraphs.
    await expect(page.getByText("Core", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add here/ })).toHaveCount(0);
    await expect(page.getByText("Plays both sides")).toHaveCount(0);
    await noSidewaysScroll(page);
    await page.screenshot({ path: `${shots}-series-2-teams.png`, fullPage: true });

    // One tap moves a player.
    const visitor = page.getByRole("group", { name: `Team for ${NAMES.visitor}` });
    await visitor.getByRole("button", { name: "B", exact: true }).click();
    await expect(visitor.getByRole("button", { name: "B", pressed: true })).toHaveCount(1);

    // One tap takes a player out, one tap puts them back.
    await page.getByRole("button", { name: `Take ${NAMES.junior} out of the series` }).click();
    const junior = page.getByRole("group", { name: `Team for ${NAMES.junior}` });
    await expect(junior.getByRole("button", { pressed: true })).toHaveCount(0);
    await junior.getByRole("button", { name: "A", exact: true }).click();
    await expect(junior.getByRole("button", { name: "A", pressed: true })).toHaveCount(1);

    // Tap a name to make them captain.
    await page.getByRole("button", { name: `Make ${NAMES.junior} captain` }).click();
    await expect(page.getByRole("button", { name: `${NAMES.junior}, captain` })).toBeVisible();

    // Settings sit in one line. Test matches are off here, so no format.
    await page.getByRole("button", { name: /^\d+ overs · / }).click();
    await expect(page.getByText("Format", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "More matches" }).click();
    await expect(page.getByRole("button", { name: /6 matches/ })).toBeVisible();
    await page.screenshot({ path: `${shots}-series-3-settings.png`, fullPage: true });

    await page.getByRole("textbox", { name: "Series name" }).fill(`E2E Series ${Date.now()}`);
    await page.getByRole("button", { name: /^Create · \d+ v \d+$/ }).click();
    await page.waitForURL(/\/tournaments\/(?!new)[^/]+$/);
    tournamentId = page.url().split("/").pop();

    const t = await client().query(api.tournaments.get, { token, tournamentId });
    type Row = { displayName: string; isCore: boolean };
    expect(t.sideA[0].displayName).toBe(NAMES.junior);
    expect(t.sideB.map((p: Row) => p.displayName)).toContain(NAMES.visitor);
    expect(t.matchCount).toBe(6);
    expect(t.sideA.length + t.sideB.length).toBeLessThanOrEqual(6);
    expect([...t.sideA, ...t.sideB].some((p: Row) => p.isCore)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    if (tournamentId) await client().mutation(api.tournaments.remove, { token, tournamentId });
    await restore();
  }
});

test("captains change on the series page, and starting a match has no Core step", async ({ page }) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const restore = await seriesOn(token, orgId);
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  const id = (n: string) => players.find((p: { displayName: string }) => p.displayName === n).userId;
  const { tournamentId } = await client().mutation(api.tournaments.create, {
    token,
    orgId,
    name: `E2E Captains ${Date.now()}`,
    format: "limited",
    oversPerInnings: 2,
    sideAName: "Reds",
    sideBName: "Blues",
    sideASquadIds: [id(NAMES.organiser), id(NAMES.admin2)],
    sideBSquadIds: [id(NAMES.player), id(NAMES.junior)],
  });
  try {
    await open(page, `/tournaments/${tournamentId}`);
    await page.getByRole("button", { name: "Change captains" }).click();
    await expect(page.getByRole("button", { name: `${NAMES.organiser}, captain` })).toBeVisible();
    await page.getByRole("button", { name: `Make ${NAMES.admin2} captain of Reds` }).click();
    await expect(page.getByRole("button", { name: `${NAMES.admin2}, captain` })).toBeVisible();
    const t = await client().query(api.tournaments.get, { token, tournamentId });
    expect(t.sideA[0].displayName).toBe(NAMES.admin2);
    await noSidewaysScroll(page);

    await page.getByRole("button", { name: "Start match" }).click();
    await expect(page.getByText("Who's playing today?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Core only" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Whole squad" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(errors).toEqual([]);
  } finally {
    await client().mutation(api.tournaments.remove, { token, tournamentId });
    await restore();
  }
});

test("Reuse last series fills the teams and settings in one tap", async ({ page }) => {
  const errors: string[] = [];
  // Safari logs a cancelled background preload (`_rsc`) as an error. Not a bug.
  page.on("pageerror", (e) => {
    if (!/_rsc=.*access control checks/.test(e.message)) errors.push(e.message);
  });
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  const restore = await seriesOn(token, orgId);
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  const id = (n: string) => players.find((p: { displayName: string }) => p.displayName === n).userId;
  const last = await client().mutation(api.tournaments.create, {
    token,
    orgId,
    name: `E2E Last ${Date.now()}`,
    format: "limited",
    oversPerInnings: 3,
    sideAName: "Reds",
    sideBName: "Blues",
    sideASquadIds: [id(NAMES.organiser), id(NAMES.admin2)],
    sideBSquadIds: [id(NAMES.player), id(NAMES.junior)],
    matchCount: 4,
  });
  let tournamentId: string | undefined;
  try {
    await open(page, "/tournaments/new");
    await page.getByRole("button", { name: /Reuse last series/ }).click();
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Team A name" })).toHaveValue("Reds");
    await expect(page.getByRole("button", { name: /^3 overs · .* · 4 matches/ })).toBeVisible();
    await expect(page.getByRole("button", { name: `${NAMES.organiser}, captain` })).toBeVisible();
    await page.getByRole("textbox", { name: "Series name" }).fill(`E2E Again ${Date.now()}`);
    await page.getByRole("button", { name: "Create · 2 v 2" }).click();
    await page.waitForURL(/\/tournaments\/(?!new)[^/]+$/);
    tournamentId = page.url().split("/").pop();
    const t = await client().query(api.tournaments.get, { token, tournamentId });
    expect(t.sideA.map((p: { displayName: string }) => p.displayName)).toEqual([NAMES.organiser, NAMES.admin2]);
    expect(t.matchCount).toBe(4);
    expect(errors).toEqual([]);
  } finally {
    if (tournamentId) await client().mutation(api.tournaments.remove, { token, tournamentId });
    await client().mutation(api.tournaments.remove, { token, tournamentId: last.tournamentId });
    await restore();
  }
});

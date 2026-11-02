import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, convexRun, NAMES, ORG_A } from "./lib/env.mjs";

type Membership = { orgId: string; orgName: string; features?: Record<string, boolean> };

async function forgetNew(token: string) {
  const boot = await client().query(api.auth.bootstrap, { token });
  for (const m of boot.memberships.filter((x: Membership) => x.orgName.startsWith("E2E Rule"))) {
    convexRun("e2e:forgetOrg", { orgId: m.orgId });
  }
}

const setShown = (token: string, orgId: string, on: boolean) =>
  client().mutation(api.orgs.setFeature, { token, orgId, key: "visitorsOnLeaders", on });

/** The Leaders board rows, read once the board has landed. */
async function leaders(page: Page) {
  await open(page, "/leaderboard");
  const list = page.locator("main");
  await expect(list.getByText(NAMES.organiser).first()).toBeVisible();
  return list;
}

test("the create screen asks only for the community name", async ({ page }, info) => {
  const { token } = await loginAs(page, "owner");
  await forgetNew(token);
  await open(page, "/org/new");
  await expect(page.getByLabel("Community name")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText("Location")).toHaveCount(0);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/create.png`, fullPage: true });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);

  const name = `E2E Rule ${Date.now().toString(36)}`;
  await page.getByLabel("Community name").fill(name);
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL("**/home");

  const boot = await client().query(api.auth.bootstrap, { token });
  const made = boot.memberships.find((m: Membership) => m.orgName === name);
  expect(made.features.juniorRule).toBe(true);
  expect(made.features.visitorsOnLeaders).toBe(false);
  // A new community starts with Series and Test matches off.
  expect(made.features.series).toBe(false);
  expect(made.features.testMatches).toBe(false);
  convexRun("e2e:forgetOrg", { orgId: made.orgId });
});

test("the Visitors switch shows and hides a visitor on Leaders", async ({ page }, info) => {
  const shots = `e2e/out/shots/${info.project.name}`;
  const { token, orgId } = await loginAs(page, "organiser", ORG_A);
  await setShown(token, orgId, false);
  try {
    // A tagged player who batted in a seeded match: the visitor or the junior.
    const everyone = await client().query(api.stats.leaderboard, { token, orgId, includeVisitorsAndJuniors: true });
    const tagged = everyone.batting.find((r: { playerTags: string[] }) => r.playerTags.length > 0);
    expect(tagged).toBeTruthy();
    const visitor: string = tagged.displayName;

    let board = await leaders(page);
    await expect(page.getByRole("group", { name: "Who appears on the board" })).toHaveCount(0);
    await expect(board.getByText(visitor, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${shots}/leaders.png`, fullPage: true });

    await open(page, "/settings");
    await expect(page.getByRole("link", { name: "Visitors" })).toBeVisible();
    await expect(page.getByText("Seniors against juniors")).toHaveCount(0);
    await page.screenshot({ path: `${shots}/community.png`, fullPage: true });
    await page.getByRole("link", { name: "Visitors" }).click();
    await expect(page).toHaveURL(/\/community\/visitors$/);

    const toggle = page.getByRole("switch", { name: "Show visitors on Leaders" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("Seniors get no points off a Junior. The scorecard shows everything.")).toBeVisible();
    const href = (await page.getByRole("link", { name: "Change" }).getAttribute("href"))!;
    expect(href.startsWith("mailto:krishna@thelaunch.space?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain(`${ORG_A}: count seniors' points against juniors`);
    await page.screenshot({ path: `${shots}/visitors.png`, fullPage: true });

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    board = await leaders(page);
    await expect(board.getByText(visitor, { exact: true }).first()).toBeVisible();

    await open(page, "/community/visitors");
    await page.getByRole("switch", { name: "Show visitors on Leaders" }).click();
    await expect(page.getByRole("switch", { name: "Show visitors on Leaders" })).toHaveAttribute("aria-checked", "false");
    board = await leaders(page);
    await expect(board.getByText(visitor, { exact: true })).toHaveCount(0);
  } finally {
    await setShown(token, orgId, false);
  }
});

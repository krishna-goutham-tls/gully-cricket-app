import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, NAMES, ORG_A, ORG_B, signIn } from "./lib/env.mjs";

// Switches change in the second test community only, and every test puts them
// back, so the other specs see what the seed left.
async function setFeature(token: string, orgId: string, key: string, on: boolean) {
  await client().mutation(api.orgs.setFeature, { token, orgId, key, on });
}

async function restore(token: string, orgId: string) {
  await client().mutation(api.orgs.rename, { token, orgId, name: ORG_B });
  for (const key of ["series", "roast"]) await setFeature(token, orgId, key, true);
  for (const key of ["juniorBoard", "testMatches"]) await setFeature(token, orgId, key, false);
}

/** Your own player page has landed: your name, Settings, and no phone number. */
async function profileLoaded(page: Page, name: string) {
  await expect(page).toHaveURL(/\/players\//);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(/\+91/)).toHaveCount(0);
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
}

const GROUPS = ["Your account", "Community", "Extra features"];

test("an admin reaches Settings from Profile and sees all 3 groups", async ({ page }, info) => {
  const { token, orgId } = await loginAs(page, "otherOrganiser", ORG_B);
  try {
    await open(page, "/profile");
    await profileLoaded(page, NAMES.otherOrganiser);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/profile.png`, fullPage: true });
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    for (const g of GROUPS) await expect(page.getByText(g, { exact: true })).toBeVisible();
    for (const row of ["Name and bio", "Change PIN", "Sign out"]) {
      await expect(page.getByRole("button", { name: row })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Ask for a feature or report a problem" })).toBeVisible();
    await expect(page.getByText(ORG_B)).toBeVisible();
    for (const row of ["Invite link", "Grounds"]) {
      await expect(page.getByRole("button", { name: row })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Visitors" })).toBeVisible();
    await expect(page.getByText("Seasons", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Series" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Test matches" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "The Roast" })).toBeChecked();
    // Practice mode is for every player, so it sits in Your account.
    await expect(page.getByRole("switch", { name: "Practice mode" })).not.toBeChecked();
    await expect(page.getByText("Try scoring. Real numbers stay the same.")).toBeVisible();
    await expect(page.getByText("Hides the Series tab")).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Junior board" })).not.toBeChecked();
    await expect(page.getByLabel("Board title")).toHaveCount(0);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/settings-admin.png`, fullPage: true });
    await noSidewaysScroll(page);

    await page.getByRole("switch", { name: "Junior board" }).click();
    await expect(page.getByLabel("Board title")).toHaveValue("Playground Bullies");

    // The Roast off hides the junior board row with it.
    await page.getByRole("switch", { name: "The Roast" }).click();
    await expect(page.getByRole("switch", { name: "Junior board" })).toHaveCount(0);
  } finally {
    await restore(token, orgId);
  }
});

test("Series off hides the tab and the pages; on brings them back", async ({ page }) => {
  const { token, orgId } = await loginAs(page, "otherOrganiser", ORG_B);
  try {
    await open(page, "/settings");
    await page.getByRole("switch", { name: "Series" }).click();
    await expect(page.getByRole("switch", { name: "Series" })).not.toBeChecked();

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Series" })).toHaveCount(0);
    await open(page, "/tournaments");
    await expect(page.getByText("Series is off")).toBeVisible();
    await open(page, "/tournaments/new");
    await expect(page.getByText("Series is off")).toBeVisible();
    const box = await page.getByRole("link", { name: "Open Settings" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("link", { name: "Open Settings" }).click();
    await page.getByRole("switch", { name: "Series" }).click();
    await expect(page.getByRole("switch", { name: "Series" })).toBeChecked();
    await expect(nav.getByRole("link", { name: "Series" })).toBeVisible();
  } finally {
    await restore(token, orgId);
  }
});

test("a phone on the Roast tab lands on Honours when The Roast goes off", async ({ page }) => {
  const { token, orgId } = await loginAs(page, "otherOrganiser", ORG_B);
  try {
    await open(page, "/records");
    await page.getByRole("button", { name: "The Roast" }).click();
    await expect(page.getByRole("button", { name: "The Roast" })).toHaveAttribute("aria-current", "true");

    // Another phone turns it off.
    await setFeature(token, orgId, "roast", false);
    await expect(page.getByRole("button", { name: "The Roast" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Honours" })).toHaveAttribute("aria-current", "true");

    await open(page, "/leaderboard");
    await expect(page.getByRole("link", { name: "Records" })).toBeVisible();

    await setFeature(token, orgId, "roast", true);
    await open(page, "/records");
    await expect(page.getByRole("button", { name: "The Roast" })).toBeVisible();
  } finally {
    await restore(token, orgId);
  }
});

test("an admin renames the community and the header follows", async ({ page }) => {
  const { token, orgId } = await loginAs(page, "otherOrganiser", ORG_B);
  const newName = `${ORG_B} Renamed`;
  try {
    await open(page, "/settings");
    await page.getByRole("button", { name: new RegExp(`^Name\\s*${ORG_B}`) }).click();
    await page.getByLabel("Name").fill(newName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(newName)).toBeVisible();
    await open(page, "/home");
    await expect(page.getByText(newName).first()).toBeVisible();
  } finally {
    await restore(token, orgId);
  }
});

test("the Profile tab is your own player page, with Settings in the header", async ({ page }, info) => {
  const { token } = await loginAs(page, "player", ORG_A);
  const boot = await client().query(api.auth.bootstrap, { token });
  await open(page, "/home");
  const nav = page.getByRole("navigation");
  await nav.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/players/${boot.user._id}$`));
  await profileLoaded(page, NAMES.player);
  await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Players" })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  // Old links still work.
  await open(page, "/profile");
  await expect(page).toHaveURL(new RegExp(`/players/${boot.user._id}$`));
  await profileLoaded(page, NAMES.player);
});

test("the platform owner finds All communities in Settings", async ({ page }) => {
  await loginAs(page, "owner");
  await open(page, "/settings");
  await page.getByRole("link", { name: "All communities" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("new-community").first()).toBeVisible();
});

test("a player sees only Your account in Settings, and /community lands there", async ({ page }, info) => {
  await loginAs(page, "player", ORG_A);
  await open(page, "/profile");
  await profileLoaded(page, NAMES.player);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText("Your account", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Community", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Extra features", { exact: true })).toHaveCount(0);
  // Practice mode is every player's: the one switch a player sees.
  await expect(page.getByRole("switch")).toHaveCount(1);
  await expect(page.getByRole("switch", { name: "Practice mode" })).toBeVisible();
  await expect(page.getByText("All communities")).toHaveCount(0);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/settings-player.png`, fullPage: true });
  await open(page, "/community");
  await expect(page).toHaveURL(/\/settings$/);
});

test("a player on a series page with Series off has a way back to Home", async ({ page }) => {
  // The first community has players. Its admin turns Series off for this test only.
  const { token } = await signIn("organiser");
  const boot = await client().query(api.auth.bootstrap, { token });
  const orgA = boot.memberships.find((m: { orgName: string }) => m.orgName === ORG_A).orgId;
  try {
    await setFeature(token, orgA, "series", false);
    await loginAs(page, "player", ORG_A);
    await open(page, "/tournaments/new");
    await expect(page.getByText("Series is off")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Settings" })).toHaveCount(0);
    await page.getByRole("link", { name: "Go to Home" }).click();
    await expect(page).toHaveURL(/\/home$/);
  } finally {
    await setFeature(token, orgA, "series", true);
  }
});

async function orgAAdmin() {
  const { token } = await signIn("organiser");
  const boot = await client().query(api.auth.bootstrap, { token });
  const orgId = boot.memberships.find((m: { orgName: string }) => m.orgName === ORG_A).orgId;
  const players = await client().query(api.players.listOrgPlayers, { token, orgId });
  const id = (n: string) => players.find((p: { displayName: string }) => p.displayName === n).userId;
  return { token, orgId, id };
}

test("players show full names; an admin tags in 2 taps from a sheet", async ({ page }, info) => {
  const { token, orgId, id } = await orgAAdmin();
  await loginAs(page, "organiser", ORG_A);
  try {
    await open(page, "/players");
    const row = page.getByRole("button", { name: /^E2E Player/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("+ Tag")).toBeVisible();
    await expect(page.getByRole("button", { name: /^E2E Junior/ }).getByText("Junior", { exact: true })).toBeVisible();
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/players-list.png` });
    await noSidewaysScroll(page);

    await row.click();
    const sheet = page.getByRole("dialog", { name: "E2E Player" });
    await sheet.getByRole("switch", { name: "Junior" }).click();
    await expect(sheet.getByRole("switch", { name: "Junior" })).toBeChecked();
    await expect(sheet.getByRole("switch", { name: "Admin" })).toBeDisabled();
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/player-sheet.png` });
    await sheet.getByRole("switch", { name: "Junior" }).click();
    await expect(sheet.getByRole("switch", { name: "Admin" })).toBeEnabled();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(row.getByText("+ Tag")).toBeVisible();

    // A guest has no Admin switch.
    await page.getByRole("button", { name: /^E2E Added Nophone/ }).click();
    await expect(page.getByRole("dialog").getByRole("switch", { name: "Admin" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename guest" })).toBeVisible();
  } finally {
    const players = await client().query(api.players.listOrgPlayers, { token, orgId });
    const me = players.find((p: { userId: string }) => p.userId === id("E2E Player"));
    if (me.playerTags.includes("junior")) {
      await client().mutation(api.players.togglePlayerTag, { token, orgId, userId: me.userId, tag: "junior" });
    }
  }
});

test("Admins in Settings lists admins and offers only regulars with an account", async ({ page }, info) => {
  const { token, orgId, id } = await orgAAdmin();
  await loginAs(page, "organiser", ORG_A);
  try {
    await open(page, "/settings");
    await page.getByRole("button", { name: /^Admins/ }).click();
    const sheet = page.getByRole("dialog", { name: "Admins" });
    await expect(sheet.getByText("E2E Organiser")).toBeVisible();
    await sheet.getByRole("button", { name: "Add admin" }).click();
    await expect(sheet.getByText("E2E Junior")).toHaveCount(0);
    await expect(sheet.getByText("E2E Visitor")).toHaveCount(0);
    await expect(sheet.getByText("E2E Added Nophone")).toHaveCount(0);
    await page.screenshot({ path: `e2e/out/shots/${info.project.name}/admins-add.png` });
    await sheet.getByRole("button", { name: /^E2E Player/ }).click();
    await expect(sheet.getByText("E2E Player")).toBeVisible();
    // You cannot take your own admin off here, so only the new admin has the button.
    await expect(sheet.getByRole("button", { name: "Remove admin" })).toHaveCount(1);
  } finally {
    await client().mutation(api.orgs.setRoles, { token, orgId, userId: id("E2E Player"), roles: ["player"] });
  }
});

import { expect, test, type Page } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { api, client, convexRun, ORG_B } from "./lib/env.mjs";

type Membership = { orgId: string; orgName: string; features?: Record<string, boolean> };

async function forgetNew(token: string) {
  const boot = await client().query(api.auth.bootstrap, { token });
  for (const m of boot.memberships.filter((x: Membership) => x.orgName.startsWith("E2E Rule"))) {
    convexRun("e2e:forgetOrg", { orgId: m.orgId });
  }
}

/** Profile, then Community Settings, inside the app so the new community stays active. */
async function toSettings(page: Page) {
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("link", { name: "Community Settings" }).click();
  await expect(page).toHaveURL(/\/community$/);
}

test("the create step offers two rules, Scorecard only selected", async ({ page }, info) => {
  const { token } = await loginAs(page, "owner");
  await forgetNew(token);
  await open(page, "/org/new");
  const scorecard = page.getByRole("radio", { name: /Scorecard only/ });
  const everywhere = page.getByRole("radio", { name: /Count everywhere/ });
  await expect(scorecard).toHaveAttribute("aria-checked", "true");
  await expect(everywhere).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Seniors' runs, wickets and catches against juniors")).toBeVisible();
  await expect(page.getByText("Juniors' own numbers always count.")).toBeVisible();
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/create-rule.png`, fullPage: true });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);

  const name = `E2E Rule ${Date.now().toString(36)}`;
  await page.getByLabel(/name/i).first().fill(name);
  await everywhere.click();
  await expect(everywhere).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL("**/home");
  await page.getByRole("button", { name: "Close" }).click();

  const boot = await client().query(api.auth.bootstrap, { token });
  const made = boot.memberships.find((m: Membership) => m.orgName === name);
  expect(made.features.juniorRule).toBe(false);

  await toSettings(page);
  await expect(page.getByText("Count everywhere")).toBeVisible();
  // No junior board when everything counts: there is nothing off juniors.
  await expect(page.getByRole("switch", { name: "Junior board" })).toHaveCount(0);
  const change = page.getByRole("link", { name: "Change" });
  const href = (await change.getAttribute("href"))!;
  expect(href.startsWith("mailto:krishna@thelaunch.space?subject=")).toBe(true);
  expect(decodeURIComponent(href)).toContain(`${name}: change Seniors against juniors to Scorecard only`);
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/community-rule.png`, fullPage: true });
  convexRun("e2e:forgetOrg", { orgId: made.orgId });
});

test("an existing community reads Scorecard only, with the junior board row", async ({ page }) => {
  await loginAs(page, "otherOrganiser", ORG_B);
  await open(page, "/community");
  await expect(page.getByText("Seniors against juniors")).toBeVisible();
  await expect(page.getByText("Scorecard only")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Junior board" })).toBeVisible();
  const href = (await page.getByRole("link", { name: "Change" }).getAttribute("href"))!;
  expect(decodeURIComponent(href)).toContain("change Seniors against juniors to Count everywhere");
});

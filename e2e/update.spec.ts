import { expect, test } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { convexRun, ORG_A } from "./lib/env.mjs";

// The bar runs only in a production build, so this runs on staging. It sets
// the live version on Convex dev, so it runs alone (staging runs use 1 worker).
test.skip(!process.env.E2E_BASE_URL, "needs a production build (staging)");
test.describe.configure({ mode: "serial" });
test.afterAll(() => convexRun("appVersion:set", { version: "" }));

const bar = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /Gully has an update/ });

test("no live version set: no bar", async ({ page }) => {
  convexRun("appVersion:set", { version: "" });
  await loginAs(page, "organiser", ORG_A);
  await open(page, "/home");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(bar(page)).toHaveCount(0);
});

test("a newer version pushed while the app is open shows the bar at once", async ({ page }, info) => {
  convexRun("appVersion:set", { version: "" });
  await loginAs(page, "organiser", ORG_A);
  await open(page, "/home");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  convexRun("appVersion:set", { version: "a-newer-build" });
  await expect(bar(page)).toBeVisible();
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/update-bar.png` });
  convexRun("appVersion:set", { version: "" });
  await expect(bar(page)).toHaveCount(0);
});

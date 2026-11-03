import { expect, test } from "@playwright/test";
import { loginAs, open } from "./lib/auth.mjs";
import { ORG_A } from "./lib/env.mjs";

// The bar runs only in a production build, so this runs on staging.
test.skip(!process.env.E2E_BASE_URL, "needs a production build (staging)");
// The fake version below is a test route. Safari's engine lets the service
// worker take the request first, so the route never sees it.
test.use({ serviceWorkers: "block" });

test("a newer live version shows the update bar; tapping it reloads", async ({ page }, info) => {
  await loginAs(page, "organiser", ORG_A);
  await page.route("**/api/version*", (r) => r.fulfill({ json: { v: "a-newer-build" } }));
  await open(page, "/home");
  const bar = page.getByRole("button", { name: /Gully has an update/ });
  await expect(bar).toBeVisible();
  await page.screenshot({ path: `e2e/out/shots/${info.project.name}/update-bar.png` });
  await page.unroute("**/api/version*");
  await bar.click();
  await page.waitForLoadState("load");
  await expect(page.getByRole("button", { name: /Gully has an update/ })).toHaveCount(0);
});

test("the same version shows no bar", async ({ page }) => {
  await loginAs(page, "organiser", ORG_A);
  await open(page, "/home");
  await page.waitForTimeout(1500);
  await expect(page.getByRole("button", { name: /Gully has an update/ })).toHaveCount(0);
});

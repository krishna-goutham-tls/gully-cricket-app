import { defineConfig, devices } from "@playwright/test";
import "./e2e/lib/env.mjs";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3111";
for (const live of ["gullycricket.space", "main--boundary-os", "//boundary-os"]) {
  if (baseURL.includes(live)) throw new Error("Tests do not run on the live site");
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "e2e/out/results",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "small-phone", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 640 } } },
    { name: "iphone", use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3111", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});

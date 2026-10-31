// Loads .env.local and refuses any database except Convex dev.
import nextEnv from "@next/env";
import { execFileSync } from "node:child_process";
import { anyApi } from "convex/server";
import { ConvexHttpClient } from "convex/browser";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });

export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
if (!CONVEX_URL.includes("posh-mastiff-400")) {
  throw new Error("Tests run only against Convex dev");
}
const prefix = process.env.E2E_PHONE_PREFIX;
export const PIN = process.env.E2E_PIN;
if (!prefix || !PIN) throw new Error("E2E_PHONE_PREFIX and E2E_PIN must be in .env.local");

export const api = anyApi;
export const client = () => new ConvexHttpClient(CONVEX_URL);

/** Each role has a fixed fake number, so the seed can run again safely. */
const suffix = {
  owner: "01",
  organiser: "02",
  admin2: "03",
  player: "04",
  junior: "05",
  visitor: "06",
  addedWithPhone: "07",
  otherOrganiser: "10",
  unknown: "99",
};
export const phone = (role) => {
  if (!suffix[role]) throw new Error(`No test role ${role}`);
  return `${prefix}${suffix[role]}`;
};
export const NAMES = {
  owner: "E2E Owner",
  organiser: "E2E Organiser",
  admin2: "E2E Admin Two",
  player: "E2E Player",
  junior: "E2E Junior",
  visitor: "E2E Visitor",
  otherOrganiser: "E2E Other Organiser",
};
export const ORG_A = "E2E Alpha";
export const ORG_B = "E2E Beta";

export function convexRun(fn, args = {}) {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.trim() ? JSON.parse(out) : null;
}

export async function signIn(role) {
  const res = await client().mutation(api.auth.signIn, { phone: phone(role), pin: PIN });
  return res;
}

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as hero from "../hero.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_contribution from "../lib/contribution.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_matches from "../lib/matches.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_playerLabel from "../lib/playerLabel.js";
import type * as lib_points from "../lib/points.js";
import type * as lib_rules from "../lib/rules.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_teams from "../lib/teams.js";
import type * as maintenance from "../maintenance.js";
import type * as matches from "../matches.js";
import type * as orgs from "../orgs.js";
import type * as players from "../players.js";
import type * as scoring from "../scoring.js";
import type * as stats from "../stats.js";
import type * as story from "../story.js";
import type * as tournaments from "../tournaments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  auth: typeof auth;
  hero: typeof hero;
  "lib/access": typeof lib_access;
  "lib/contribution": typeof lib_contribution;
  "lib/crypto": typeof lib_crypto;
  "lib/matches": typeof lib_matches;
  "lib/phone": typeof lib_phone;
  "lib/playerLabel": typeof lib_playerLabel;
  "lib/points": typeof lib_points;
  "lib/rules": typeof lib_rules;
  "lib/scoring": typeof lib_scoring;
  "lib/session": typeof lib_session;
  "lib/teams": typeof lib_teams;
  maintenance: typeof maintenance;
  matches: typeof matches;
  orgs: typeof orgs;
  players: typeof players;
  scoring: typeof scoring;
  stats: typeof stats;
  story: typeof story;
  tournaments: typeof tournaments;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

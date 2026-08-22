# Gully Cricket (app repo)

Mobile-first **gully cricket scoring app**. Public name **Gully Cricket**;
repo/package still `cricket-scoring`. The product is the scoring UX — score
an over with one thumb: tap ball outcome → instant register → next ball.
Everything else (leaderboards, player profiles, match stories) is read-model
on top of the ball log.

Any active org member can create matches and score; **admin** only approves join
requests and PIN resets.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Convex · Netlify
**Live:** https://gullycricket.space
**GitHub:** `krishna-goutham-tls/gully-cricket-app` (public, MIT). `main`
requires a pull request — do not push it directly.

---

## This repo is public

Treat every file as if a stranger will read it tomorrow. That is the rule.

**Never commit**

- `.env.local`, Convex deploy keys, `PIN_PEPPER`
- Phone numbers, PINs, player dumps, `backups/`
- Anything copied from the live Convex or Netlify dashboards

**If you are not sure it is a secret, it is.** Leave it out. Say so in the PR.
A warning in chat is better than a key on GitHub.

Forks start empty. Do **not** point a fork at the live Convex deployments
(`posh-mastiff-400`, `dusty-jellyfish-63`) unless you maintain
gullycricket.space. Those names in this file are for *this* product, not
for your copy.

Git line for *this* product (Krishna / agents):

`dev` (local) → `origin/dev` → `staging` → `main`

- All work lands on local **`dev`**. No extra feature branches unless he asks.
- Commit locally. Do **not** `git push` until he says the batch is ready.
- First push is **`dev`** (remote). Then promote **`dev` → `staging`**, then
  **`staging` → `main`**. `main` is live; Netlify builds it. `main` requires
  a PR.
- Strangers fork and open a PR. We do not invent a new branch per tiny fix.

A GitHub push can fire Netlify and burn credits. Wait until he is convinced
there is enough to go out.

---

## Router — where to look

Read the file for what you're doing. Don't read them all.

| Need | File |
|------|------|
| Scoring engine, rules, schema | `convex/lib/scoring.ts`, `convex/lib/rules.ts`, `convex/schema.ts`, `convex/scoring.ts` |
| Convex + Netlify deploy wiring | the Convex rules below |
| How to run a copy | `README.md` |
| Colour, type, buttons, PWA spacing | `design-bible.md` — **read it before any UI change** |

---

## Commands

```bash
npm run dev             # Dev server on :3000 (uses .env.local)
npm run build           # Production build
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit
npx convex dev --once   # Push convex/ to DEV (posh-mastiff-400)
npx convex deploy --yes # Push convex/ to PROD — see the rules below
```

---

## Convex deploys — the rules

**One Convex project: `cricket-scoring-app`.** Two deployments inside it. The
values are NOT interchangeable. **Netlify does not push Convex.** A push to
`main` only rebuilds the Next.js app.

| | Deployment | How to push |
|---|---|---|
| **Dev** | `posh-mastiff-400` | `npx convex dev --once` (uses `.env.local`) |
| **Prod** | `dusty-jellyfish-63` | `npx convex deploy --yes` with the **prod** key |

1. After any `convex/` change, push DEV first (`npx convex dev --once`).
2. When the work is ready to go live, push PROD **yourself**, then merge a
   PR to `main` so Netlify rebuilds the app against the new functions.
   Tournament start/bin allows walk-ons; each XI must still include a player
   from that series team. Missing cores warn in the UI and do not block.
3. **`npx convex deploy` always means prod.** Never run it to "sync dev".
4. Local `.env.local` has `CONVEX_DEPLOYMENT=dev:posh-mastiff-400` and a **dev**
   `CONVEX_DEPLOY_KEY`. That key would send `npx convex deploy` to the wrong
   place. For prod, prefix the **prod** key (the commented `prod:dusty-jellyfish-63`
   line in `.env.local`) and do not write it back into the file:
   `CONVEX_DEPLOY_KEY='prod:…' npx convex deploy --yes`
5. **Never put a prod deploy key in `.env.local` as the active key.**
6. **Never run `npx convex dev` without `--once` to "get set up"** — that is how
   two orphan Convex projects got created.
7. If the dashboard and these docs disagree, believe the dashboard and fix
   the docs. Do not invent a third project.

Netlify `NEXT_PUBLIC_CONVEX_URL` is set in `netlify.toml` to the prod deployment
so the live bundle talks to `dusty-jellyfish-63`. Do not set
`CONVEX_DEPLOY_KEY` on Netlify for the build — it is unused now.

---

## Non-negotiables

- **The ball log is append-only.** Everything replays from it; undo depends on
  it. A fix that rewrites history is the wrong fix.
- **Nothing gets added to the score pad**, except Catch Drop (CD), which
  Krishna explicitly put there. New inputs otherwise go to post-match
  surfaces, never mid-over.
- **`recomputeAndPersist` (`convex/scoring.ts`) changes with extreme care.**
- **You cannot log into this app** (phone + 4-digit PIN). Say "not
  browser-verified" and name what Krishna should eyeball — never claim a UI
  change works because it compiled.

---

## UI and UX — how to decide where something goes

**Read `design-bible.md` first.** Tokens, type, control sizes, and PWA
padding live there. Do not invent a new height, radius, or colour. If
the bible and this section disagree, the bible wins on look; this
section still wins on *where* a number goes.

This app is used one-handed, on a phone, often in sun, between overs. New
numbers do not get a new tab by default.

- **Few clicks.** If the player is already on a screen, the fact belongs
  there. Do not add a filter, a settings page, or a second hop to reveal
  one number.
- **Breathable, not rushed.** Empty space is doing work. Do not fill a
  gap because a stat exists. One new fact per surface, with air around it.
- **Mobile real estate decides the home.** The profile header is four
  numbers today (matches, innings, runs, wickets). If a new fact fits as
  a line under one of those, it lives there. The Leaders tab is already a
  two-level board — a new discipline tab is a last resort, not a first
  home for a career stat.
- **Prefer reading over configuring.** Defaults should match how the group
  already argues. Toggles are for the exception (Everyone on Leaders),
  not for the main number.
- **Copy names the thing people say.** Win–loss, not "attribution rate".
  Visitor, not "uncredited walk-on".

If a proposed UI needs a legend to be understood, it is the wrong UI.

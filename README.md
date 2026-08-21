# Gully Cricket

Scorebook for gully cricket. Tap what happened, ball by ball.

Live product: [gullycricket.space](https://gullycricket.space) — **invite-only**. An organiser registers on the landing page; access is vetted before a community is provisioned. Forking this repo does not get you into that site, or its data.

The user-facing word for a group is **Community**. The database still says `orgs` / `orgId` — do not rename those.

Home-screen label: **Gully**. Package/repo may still say `cricket-scoring`.

## Stack

Next.js 14 · TypeScript · Tailwind · Convex · Netlify

## Run a copy

You need your own Convex project. This repo does not include anyone else's database, players, or matches.

1. Create a Convex project and copy its deployment URL.
2. Copy `.env.local.example` to `.env.local` and fill in **your** URLs.
3. Set `PIN_PEPPER` in **your** Convex dashboard (a long random string). Do not put it in git.
4. From this folder:

```bash
npm install
npx convex dev --once    # push functions to your Convex
npm run dev
```

App: `http://localhost:3000`.

```bash
npm run build
npm run lint
npm run typecheck
```

After any `convex/` change: `npx convex dev --once`. Production Convex is `npx convex deploy --yes` with **your** prod key, never a key from someone else's project.

## Contributions

Open a **pull request**. Do not push to `main`.

## License

MIT. See [LICENSE](LICENSE).

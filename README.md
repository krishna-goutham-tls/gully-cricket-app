# Gully Cricket

Tap what happened. The scoreboard keeps up.

You are at the crease with one free thumb. Four, six, wide, out — tap it, it is in the book. Sit-outs see the live score. When the match ends, the story, the leaderboard, and the roast are already there.

**[Play it live](https://gullycricket.space)** · **[Read the rules](https://gullycricket.space/gully-rules)**

The live site is invite-only (a community organiser registers, then gets vetted). Forking this repo does **not** log you into that site or its data. It gives you the scorebook, empty, for your own group.

## Why this exists

Most cricket apps assume a scorer at a desk. Gully cricket does not have a desk. This one is built so whoever has the phone can score an over without looking down for long.

- One-thumb score pad
- Last man stands (toggle it off if you play proper cricket)
- Common players (same person on both sides)
- Live watch link for whoever is sitting out
- Community leaderboards, records, match stories

In the app, a group is a **Community**. The database still says `orgs` — leave that name alone.

## Run it yourself

You need your **own** [Convex](https://convex.dev) project. This repo is the recipe, not someone else's club.

```bash
cp .env.local.example .env.local   # paste YOUR Convex URLs
# Set PIN_PEPPER in your Convex dashboard (long random string). Never git it.
npm install
npx convex dev --once
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). After any change under `convex/`, run `npx convex dev --once` again.

If you fork, point `netlify.toml` at **your** Convex URL too. The one in this repo is for [gullycricket.space](https://gullycricket.space).

```bash
npm run lint
npm run typecheck
npm run build
```

## Contribute

PRs welcome. `main` is protected — open a pull request, do not push it directly.

Good places to help: scoring edge cases, mobile UI, copy, and making the pad even faster. Read [AGENTS.md](AGENTS.md) before you touch `convex/` (the ball log is append-only; the score pad stays thin).

If a change might leak a secret, a phone number, or live-player data — stop and say so in the PR. We would rather you ask.

## License

[MIT](LICENSE). Take it, run a community, send a PR back.

# Gully Cricket — design bible

Locked tokens for the PWA. The app is used **one-handed, on a phone, often in sun, between overs.** If a new control does not match this file, it is wrong.

Landing (`components/landing/`, `/gully-rules`, `/privacy`, `/support`) may use gold fills and larger type. The installed app may not.

Do not invent a new size because a number exists. Do not add a component package. Use `components/ui/` and these classes.

---

## Colour

From the logo: charcoal field, cream stumps, gold bails. Defined in `tailwind.config.ts`.

| Token | Hex | Use |
|-------|-----|-----|
| `bg` | `#faf8f4` | Page paper. Status bar. Manifest `theme_color`. |
| `surface` | `#ffffff` | Cards, sheets, nav. |
| `ink` | `#18181b` | Headings, primary fills, dark screens. |
| `muted` | `#6f6a63` | Body copy. |
| `faint` | `#767066` | Micro labels only. Never thin it (`/70`). Never use as a hairline. |
| `line` | `#eae4d9` | Hairlines, borders. |
| `accent` | `#f0b429` | Fills and marks **on ink**. Never as text on paper. |
| `accent-soft` | `#fdf4de` | Gold wash. |
| `accent-deep` | `#8a5a0b` | Gold **text** on paper or white. |
| `danger` | `#c0392b` | Destructive. |
| `danger-soft` | `#fdf1ef` | Destructive wash. |

On ink, cream copy is `text-bg/70` or stronger. Never `text-bg/35`–`/50`.

No `zinc`, `gray`, `slate`, raw `#f7f7f5`, or `bg-black` (use `bg-ink`). Canvas/SVG hex is allowed only when it equals a token.

`themeColor` in `app/layout.tsx` must equal `bg`.

---

## Type

Font: **Poppins** (`--font-sans`). Weight for UI: `font-semibold`. Body: default (400). `font-bold` only for LIVE.

| Size | Class | Role |
|------|--------|------|
| 11px | `text-[11px] font-semibold uppercase tracking-wide text-faint` | Micro labels |
| 13px | `text-[13px]` | Dense secondary lines, chips |
| 15px | `text-[15px] font-semibold` | Buttons, names, card titles |
| 16px | `text-[16px]` | **Text inputs only** (stops iOS zoom) |
| 20px | `text-xl font-semibold tracking-tight` | Sticky header titles |
| 13px | `text-[13px] font-semibold text-muted` | Header subtitle / scope (`Season-01`) |
| 24px | `text-2xl font-semibold tracking-tight text-ink` | Full-screen titles |
| 24px | `text-2xl font-semibold tabular` | Stat numbers |

Header subtitles that are short labels (`Season-01`, `All time`) do not truncate. The title cluster is `flex-1 min-w-0` so they have room.

No `text-xs` (12px) or `text-sm` (14px) in the installed app — those are not on this scale. Use 11 / 13 / 15.

Live score on the pad/watch may be larger. That is the one exception.

No half-pixels (`11.5`, `12.5`). No `tracking-[0.14em]` on labels — use `tracking-wide`. Headings use `tracking-tight`.

---

## Controls

| Kind | Height | Radius | Type |
|------|--------|--------|------|
| Primary / secondary **Button** | `min-h-12` | `rounded-xl` | `text-[15px] font-semibold` |
| Page-footer primary (one per screen) | `min-h-14` | `rounded-xl` | same — `Button size="lg"` |
| Icon / back | `h-11 w-11` | `rounded-lg` | icon 20px |
| Segment / chip / tab | `min-h-11` | track `rounded-xl`, thumb `rounded-lg`, filter chip `rounded-lg` | `text-[13px] font-semibold` |
| List row (tappable) | `min-h-12` | inside a `rounded-2xl` card | name `text-[15px] font-semibold` |
| Score **pad key** | `min-h-16` | `rounded-2xl` | own type. Do not use `Button`. |
| PIN key | `h-14` | `rounded-2xl` | PinPad only |

Never `min-h-8`, `min-h-9`, or `h-10` on something you tap.

Press: `active:scale-[0.98]` on buttons. `active:bg-bg` (or `active:bg-white/10` on ink) on rows. Hover is optional extra, never the only feedback.

Disabled: `disabled:opacity-40 disabled:cursor-not-allowed`.

Use `components/ui/Button.tsx` for every full-width or pair CTA (Start, Next, Approve, Add, Toss, Resume, Sign in). Pass `href` when it navigates.

Use `components/ui/Input.tsx` for labelled text fields. Search-with-clear may stay custom but must keep `min-h-12 rounded-xl text-[16px]`.

Buttons are `rounded-xl`, not pills. `rounded-full` is for dots, bars, and tiny status marks — not for a tap target with a label.

## Truncation

A cut name must still be a name. Use `components/ui/TruncText.tsx`.

- Always set `title` to the full string.
- Player and team names: two lines (`lines={2}`) before ellipsis.
- Do not truncate `Season-01` or other short scope labels.
- One-line headers may stay one line.
- Do not put a truncated name in `text-faint`.

---

## Layout (PWA)

- Column: `.phone-shell` (28rem). Portrait.
- Screen gutter: `px-5`.
- Top: `pt-[calc(var(--safe-top)+1rem)]`.
- Bottom, **no tab bar**: `pb-[calc(2rem+env(safe-area-inset-bottom))]`.
- Bottom, **with tab bar**: layout padding `pb-[calc(5.5rem+env(safe-area-inset-bottom))]`. Do not also set `min-h-dvh` on the page.
- Sticky footers: outer `.safe-bottom`, inner `pb-3` (do not put `py-3` on the same node as `.safe-bottom`).
- Sheets / confirms that sit on the home bar: same safe bottom.

Cards: `rounded-2xl border border-line bg-surface shadow-card`.

---

## Surfaces that are allowed to look different

1. **Score pad** — `PadKey`, over chips, live total. One-thumb scoring. Do not shrink it to Button.
2. **PIN pad**
3. **Coin toss** — the coin is the control. Bat / Bowl stay large and **equal**.
4. **Landing / rules / legal** — gold fills, bigger type, DemoPad miniature keys.
5. **Trophy Shelf** (`/records`, the Cabinet on a profile, the trophy share
   card) — the app's only "trophy shelf": the twelve photographed trophies.
   The chips on a player profile are `FeatChips`, not this. `/shelf` is gone,
   redirected in `next.config.mjs`. On `/records` the top-level split is tone —
   **Honours** on paper, **The Roast** on an ink band — and each holds its
   trophies first, then its record rows. Section headings are plain nouns with
   no explainer line under them, and a roast is never "earned".
   The photograph is the surface. It **may**: run the trophy renders full-bleed
   and opaque, edge to edge, with their own baked backgrounds; flip a whole
   band to `bg-ink` for the roasts; use `accent-soft` washes and gold rings on
   ink. It **may not**: leave the tokens, add a type size that is not on the
   scale, or drop a tap under 44px. The renders carry a watermark in the
   bottom-right — every window that shows one is `512 / 472` with the image
   pinned to the top, which crops it. Square one off and the watermark is back.

---

## Copy in the UI

Name the thing people say. Active, short. Errors say what happened.

---

## Checklist before a PR

- [ ] New tap is at least 44px (`min-h-11`).
- [ ] Primary CTA is `Button` (or `Button href`).
- [ ] Text field is 16px.
- [ ] Gold text on paper is `accent-deep`.
- [ ] Cream text on ink is `/70` or stronger.
- [ ] Home-bar padding is real `env(safe-area-inset-bottom)`, not only `pb-8`.
- [ ] No hover-only press state.
- [ ] You did not add a size that is not in this file.

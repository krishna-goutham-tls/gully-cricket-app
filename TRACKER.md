# Gully Cricket - Tracker

Open tasks. Decisions go in `../context-system/LOG.md`, not here. IDs (B = bug, G = gap, I = improvement) are from the 13 Sep product review, `../brainstorming/reviews/code-review-2026-09-13.md`, which has the file and line for each one.

Status checked against the code on 2026-10-11 only where it says "checked". The rest is open per the review and needs a look before work starts.

## Done
- [x] B1, B2, B4, B5, G1, G3 from the 13 Sep review (2026-09-19, PR #25)
- [x] Roadmap after the UX audit (2026-09-24): offline chip, wake lock, haptics, mid-match add and remove, per-match stat stamps, grounds and the Who's in? poll, public `/m` and `/p` links
- [x] No leaderboard points off juniors (2026-09-25)
- [x] Records is Honours and The Roast (2026-09-26)
- [x] B12: support page says community (checked)
- [x] G2, partly: wide and no-ball open a runs sheet (`9b52b16`, `886f351`). Runs on a wicket not checked

## Next
- [ ] UX, community and sign-up build. Phase 1 and 1b live (2026-10-31). Phases 2 to 7 not started. Phases and results: `../implementation/ux-community-signup-2026-10-31.md`
- [ ] B7: Orange and Purple Caps on raw most runs and wickets. Named as next in the LOG on 2026-09-19
- [ ] B8: one tie-break for Player of the Season on Leaders, the end stamp and the wrap
- [ ] B3: catch-drop tags the retire marker after a retire
- [ ] B6: Test clock overtime text on paper uses logo gold, unreadable in sun
- [ ] B9: a match finished after a season ends still joins that season's boards
- [ ] B10: profile rank is career, Leaders is this season
- [ ] B11: match share image says "Limited overs" instead of ODI (checked, still open)
- [ ] B13: `mustChangePin` not enforced in mutations
- [ ] B14: PIN reset and change do not end other sessions
- [ ] B15: header switcher can save the sandbox as the preferred community
- [ ] G4: "End without result" on the End confirm
- [ ] G5: reuse-last-teams does not copy last man; series start has no last-man control
- [ ] G6: sit a no-show out of the squad
- [ ] G7, G8: season folder count and wrap duck count
- [ ] G9: demote Resume scoring on Watch
- [ ] G10: hide the tab bar on Watch (checked, still open)
- [ ] G11: show who dropped the last ball on Watch (checked, still open)
- [ ] G12: Watch copy "Waiting for who bats"
- [ ] G13: admin can remove a member (checked, still open)
- [ ] G14: redirect non-owners away from `/admin/requests`
- [ ] G15: common-player rule card says "in an ODI"
- [ ] G16: remove the New chip on Last man stands (checked, still open)
- [ ] I1 to I22: improvements in the review. I17 (Register your community lands far above the form) and I21 (PIN pepper fallback) are marked High
- [ ] Releases tab and match stories on the landing page, from `../brainstorming/copy-drafts/`. Drafted 2026-08-22, not built

## Waiting on someone else
- [ ] Sandbox check of the 2026-09-19 live-play fixes. Needs Krishna on a phone
- [ ] iOS: plan only. `/privacy` and `/support` must stay live before any submission

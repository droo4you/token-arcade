# Cartridge sprint integration review

This branch combines the six separate draft PRs for integration verification. It is not a production deployment or a replacement for reviewing each game PR.

| Slice | Draft PR | Included head |
| --- | --- | --- |
| Mood Swings rescope and save hydration | [#29](https://github.com/droo4you/token-arcade/pull/29) | `3d4789c` |
| Skrumpey Frenzy boost and browser save hook | [#30](https://github.com/droo4you/token-arcade/pull/30) | `a11950d` |
| Coindle raid pool | [#31](https://github.com/droo4you/token-arcade/pull/31) | `ed636db` |
| Skip to 10K four boards | [#32](https://github.com/droo4you/token-arcade/pull/32) | `ff7cc8d` |
| Two Places level boards | [#33](https://github.com/droo4you/token-arcade/pull/33) | `bd884ec` |
| Shared account saves and browser merge | [#34](https://github.com/droo4you/token-arcade/pull/34) | `7f660a2` |

## Combined verification

- Base: `06b38628b1e35699bb2f79c6176c4f5608601602`, after the PR #28 cleanup.
- `npm test`: 148 tests passed at `faa5d41` after merging all six slices.
- `npx tsc --noEmit`: passed at the same integration revision.
- `npm run build`: passed at `36f51ac`, which adds only the final Mood save-guidance copy change. This builds both Coindle release bundles, type-checks the workspace, and builds the arcade frontend.
- `git diff --check`: passed.
- Vite emits non-failing bundle-size, module-directive and config-loader warnings.

Overlapping edits in cartridge routes, SDK manifests, API sessions, leaderboards, raid defaults, goals, Passport best-score keys and host UI were resolved together. Versioned legacy assets and verifiers remain available. Mood retains its guarded migration after existing sessions and raids drain; the other game drafts retain their legacy-version guards. Account saves remain separate from verified scores, rankings and rewards.

The merge commits on `codex/sprint-integration-check` preserve these resolutions for review. The draft PRs remain independent; their shared-file conflicts must be resolved when they are integrated into main.

## Queued checks and remaining scope

Per the user's sprint direction, human playtests, demos and live raid exercises are parked. The game-specific review documents contain their tuning and acceptance notes. In particular, cross-device sign-in/save recovery, phone controls, ranked/raid flows, Skip's Mid loadout and multiplier tuning, and Two Places' raid duration still need hands-on review.

Mood gameplay feel has user approval. Further icon, power-up and visual polish is lower priority. This sprint's Skrumpey slice adds the Frenzy boost and casual persistence; a nuts-funded cosmetic unlock shop and the wider Skrumpey raid-policy work remain separate follow-ups. Coindle streak badges and share-card themes also remain follow-ups. These are not claimed complete by the integration checks.

No new production deployment, main-branch merge or live raid was performed during this integration pass.

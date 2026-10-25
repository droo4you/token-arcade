# Account-saved casual progress

## Behavior

Signing in hydrates the account save before a cartridge mounts. The browser's guest save merges into the account; guest keys remain intact so signing out returns to the guest save. Each account uses a separate browser cache. Opening the game on another device restores the latest saved account progress.

The host authenticates requests; credentials never enter the cartridge. Only the game's explicit save keys and bounded fields are synchronized. These casual records are stored separately from verified scores, run sessions, raid standings and rewards. Sync does not make browser-earned upgrades authoritative competitive proof.

Writes use a durable browser outbox and idempotent server operations. Reloading after a lost acknowledgement recovers the pending operation and any later local changes. Concurrent device changes merge against their own base snapshots. A Web Lock permits one writer per account/game/browser; another tab falls back to guest browser play. Offline/API/storage failures show a save-status message and retain browser data for a later retry.

## Merge policies

- Two Places: highest unlocked level, fastest time and most apples per level. Browser saves with the old juice field remain readable.
- Skip to 10K: best distance/price, upgrade maxima, union of missions/rocks/flags, and currency deltas after the initial import. A repeated guest import does not restore spent gwei.
- Mood Swings: best Mood, earned Good Vibes, owned cosmetics and selected appearance. Initial overlapping balances use the higher total; unlocks are preserved. The cartridge hydration hook is included in the Mood Swings draft.
- Skrumpey Slide: best score, earned nuts, run count and selected character. The Frenzy draft adds the browser persistence hook. This does not add a cosmetic shop or change which characters are playable.
- Coindle: latest daily puzzle state and streak, maximum recorded totals/distribution/max streak. Old saves have no dated history, so overlapping totals are not added. Exact reconstruction of two independent historical stat ledgers is not possible from that old format.

Initial imports conservatively keep the higher overlapping balance/counter rather than adding entire histories. Later currency/counter writes use deltas; retrying the same operation cannot apply them twice. These are casual saves, not a purchase or reward ledger.

## Validation and queued review

123 tests pass and the production build passes. New tests exercise authenticated isolation, wrong-account rejection, database restart, allowed-key validation, repeated import after spending, concurrent deltas, lost acknowledgements, browser namespace isolation, writer locking, hydration before mount, and late responses after navigation.

This shared PR is intended to follow the game drafts. The small Mood Swings and Skrumpey hooks live in their respective game PRs; Coindle, Skip and Two Places already read their save when mounted/started. Human cross-device playtesting remains queued under the user's instruction to keep implementation moving. No production account data or deployment was changed.

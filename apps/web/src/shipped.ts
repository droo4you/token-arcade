// Keep the submission snapshot fixed. Append releases only after deployment verification.
// Times are America/Los_Angeles. Post-deadline items must come from commits on main
// after the Monad Metropolis deadline (2026-10-13 20:59 PT = 2026-10-14T03:59Z).

export const REPO_URL = "https://github.com/droo4you/token-arcade";
export const EXPLORER = "https://testnet.monadscan.com";
export const DEADLINE_LABEL = "Oct 13, 2026, 8:59 PM PT";

export type ShippedLink = { label: string; href: string };
export type ShippedItem = { title: string; detail: string; when?: string; links?: ShippedLink[] };
export type ShippedSection = { id: string; kicker: string; title: string; intro: string; items: ShippedItem[]; empty?: string };

const commit = (sha: string, label = sha.slice(0, 7)): ShippedLink => ({ label: `Commit ${label}`, href: `${REPO_URL}/commit/${sha}` });

export const shippedSections: ShippedSection[] = [
  {
    id: "at-submission",
    kicker: "Deadline snapshot",
    title: `Shipped at submission (${DEADLINE_LABEL})`,
    intro: "This fixed record describes the submission version, separating website features from the testnet contract demonstration. Later releases appear below and do not become part of this snapshot.",
    items: [
      { title: "Preserved submission source", detail: "Commit a20c704 was committed Oct 13 at 7:58 PM PT and is labeled metropolis-submission. This fixed commit link preserves the source version as the app evolves.", links: [commit("a20c704513c4772d6d0af6dada623b162698029f"), { label: "Browse submission source", href: `${REPO_URL}/tree/a20c704513c4772d6d0af6dada623b162698029f` }] },
      { title: "Free Play", detail: "Every cabinet opens instantly with no account and no wallet." },
      { title: "Passport Play", detail: "Privy sign-in gives each player a Passport. Runs are replayed and verified on the server before a record counts." },
      { title: "Leaderboards and profiles", detail: "Per-game leaderboards show verified runs only. Passports carry a username, avatar and run history.", links: [{ label: "Passport", href: "/passport" }] },
      { title: "Creator launch flow", detail: "Creators submit a browser game at /launch, an arcade admin reviews and approves it in /admin-tools, and the creator deploys it to the public arcade.", when: "Final piece committed Oct 13, 7:15 PM PT", links: [{ label: "Launch Console", href: "/launch" }, commit("38c4c95")] },
      { title: "Live cabinets", detail: "Skrumpey Slide, Mood Swings, Two Places at Once, Skip to 10K and Coindle.", links: [{ label: "Browse the arcade", href: "/" }] },
      { title: "MiniCoin economy on Monad testnet", detail: "An operator-run Skrumpey Slide demo bought SLIDE, distributed trading fees, funded a raid, settled to the operator wallet using a demo result hash, and claimed WMON. This demonstrated the contracts; it did not connect a real player's website score to a payout.", links: [
        { label: "SLIDE MiniCoin", href: `${EXPLORER}/address/0x85043f5C86Fe1CC5a0dFECf8803Ba2d7C7406760` },
        { label: "Prize claim tx", href: `${EXPLORER}/tx/0x061ff1bb51c4b4396eea2d59c9a3d3d1a56f4ce14318b8aa2aad7188e1580d1a` },
      ] },
      { title: "Envio indexer source", detail: "HyperIndex source and configuration for raids, claims and fees were included in the submission. Hosted indexing and sync status are not established by the source snapshot alone.", when: "Start-block fix committed Oct 13, 7:21 PM PT", links: [
        { label: "GraphQL endpoint", href: "https://indexer.dev.hyperindex.xyz/0712619/v1/graphql" }, commit("cdcd79e"),
      ] },
    ],
  },
  {
    id: "after-deadline",
    kicker: "Post-deadline",
    title: "Shipped after the deadline",
    intro: "Confirmed live updates appear here with release dates and source evidence. Open PRs and development branches are not shipped releases.",
    items: [
      { title: "Free Play analytics and start/exit tracking", when: "Both services verified live Oct 22, 2026", detail: "Curators can inspect guest and account run summaries, observed starts and exits, and unresolved runs. New Skip runs include starting upgrades and Two Places runs include level context. Missing uploads are not counted as confirmed quits.", links: [commit("c170ce84447e795bc50a34a03b02161a6d9225ef")] },
      { title: "Skrumpey Slide 1.2", detail: "Reviewed momentum and control improvements are deployed with a matching verifier and preserved older releases.", links: [{ label: "Release PR #16", href: `${REPO_URL}/pull/16` }] },
      { title: "Real player testnet prize delivered", detail: "The funded Skrumpey pilot paid Guy 0.0000609375 test WMON. This used a manual gas top-up and player claim; automatic delivery is a separate acceptance test.", links: [{ label: "Prize receipt", href: `${EXPLORER}/tx/0xebbfe7c8551f9da0e8d8dbf41572bad15100d4e30a839f41d6e6d86e763170e6` }] },
      { title: "Free raid final results and recovery", when: "Live deployment verified Oct 15, 2026", detail: "Finished free, no-prize raids save final standings and a winner, award one Passport win, and recover accepted submissions after a lost response. The lobby refreshes and shows your place.", links: [commit("921bc979f251284fde6f293564c1f60f9bd93d58"), { label: "Release PR #2", href: `${REPO_URL}/pull/2` }] },
      { title: "Three-player Skrumpey Slide pilot", when: "Finalized Oct 19, 2026, 12:13 AM PT", detail: "playhouse, droober and willllliam completed verified runs. The raid closed with frozen standings: playhouse won with 51,538 points. This was a free, no-prize gameplay test.", links: [{ label: "Final raid results", href: "/raids/1089c46e-2b8b-41d6-b4ae-b355467d06a0" }] },
      { title: "Funded testnet raid integration and Free Play summaries", when: "Both services verified live Oct 19, 2026", detail: "Website raids can bind to a funded Monad testnet vault, preserve entrants' prize wallets and prepare settlement from verified final standings. A Privy claim button is deployed; a real player payout still needs live testing. Guests and signed-in players now send unverified Free Play summaries for balancing, including Skip earnings and progression. Device saves are not yet synced to Passports.", links: [commit("d02f99a7a048c044dec114bab49c60feaa3cc6f4"), { label: "Release PR #8", href: `${REPO_URL}/pull/8` }] },
    ],
  },
  {
    id: "next",
    kicker: "Roadmap",
    title: "Up next",
    intro: "Planned work, not shipped features or promised dates. Priorities can change; completed items move into the release log with evidence.",
    items: [
      { title: "Next: automatic testnet raid rewards", detail: "Run a real funded event where the winner receives the prize without a claim signature or gas balance. Automatic payout code has passed an isolated testnet rehearsal; real player delivery and indexing of the new vault still need verification." },
      { title: "Power Play", detail: "Design stage: MiniCoin entry, verified ticket-orb draw entries and community-asset rewards. Randomness, prices, payout limits and launch requirements remain unresolved." },
      { title: "Mainnet", detail: "Target a paired Mood Swings/eMONAD and Skrumpey Slide/Skrumpeys launch after the reward flow is proven. Deployment, funding and asset-specific reward handling remain to be completed." },
      { title: "After Power Play: friend 1v1s", detail: "Challenge a friend using MiniCoins, with community-asset rewards. Funding and match rules still need design." },
      { title: "More cartridges", detail: "Bring more community games into the arcade through the cartridge integration kit. Canyon Jump is in development and needs more gameplay tuning before release." },
      { title: "Creator onboarding", detail: "Help people build the game they have always imagined, then bring it to Token Arcade with a community behind it." },
    ],
  },
];

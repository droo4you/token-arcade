// Public "Shipped" log. Edit this file to update /shipped; the page renders it as-is.
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
    kicker: "Live at the deadline",
    title: `Shipped at submission (${DEADLINE_LABEL})`,
    intro: "Everything here was on main and running before the Monad Metropolis deadline. The last commit before submission landed at 7:58 PM PT.",
    items: [
      { title: "Free Play", detail: "Every cabinet opens instantly with no account and no wallet." },
      { title: "Passport Play", detail: "Privy sign-in gives each player a Passport. Runs are replayed and verified on the server before a record counts." },
      { title: "Leaderboards and profiles", detail: "Per-game leaderboards show verified runs only. Passports carry a username, avatar and run history.", links: [{ label: "Passport", href: "/passport" }] },
      { title: "Creator launch flow", detail: "Creators submit a browser game at /launch, an arcade admin reviews and approves it in /admin-tools, and the creator deploys it to the public arcade.", when: "Final piece committed Oct 13, 7:15 PM PT", links: [{ label: "Launch Console", href: "/launch" }, commit("38c4c95")] },
      { title: "Live cabinets", detail: "Skrumpey Slide, Uppers, Two Places at Once, Skip to 10K and Coindle.", links: [{ label: "Browse the arcade", href: "/" }] },
      { title: "MiniCoin economy on Monad testnet", detail: "Skrumpey Slide's SLIDE MiniCoin was bought, trading fees accrued to the prize vault, a raid was funded and settled, and the winner claimed onchain.", links: [
        { label: "SLIDE MiniCoin", href: `${EXPLORER}/address/0x85043f5C86Fe1CC5a0dFECf8803Ba2d7C7406760` },
        { label: "Prize claim tx", href: `${EXPLORER}/tx/0x061ff1bb51c4b4396eea2d59c9a3d3d1a56f4ce14318b8aa2aad7188e1580d1a` },
      ] },
      { title: "Envio indexer", detail: "A hosted HyperIndex deployment indexes raids, claims and fee accruals. The testnet raid shows as CLAIMED.", when: "Start-block fix committed Oct 13, 7:21 PM PT", links: [
        { label: "GraphQL endpoint", href: "https://indexer.dev.hyperindex.xyz/0712619/v1/graphql" }, commit("cdcd79e"),
      ] },
    ],
  },
  {
    id: "after-deadline",
    kicker: "Post-deadline",
    title: "Shipped after the deadline",
    intro: "Anything merged to main after the deadline is listed here with its time and commit, so it is never mistaken for part of the submission.",
    items: [],
    empty: "Nothing yet. No commits have landed on main since the deadline.",
  },
  {
    id: "next",
    kicker: "Roadmap",
    title: "Up next",
    intro: "Not live yet. This is what we are building toward.",
    items: [
      { title: "Power Play", detail: "Pay MiniCoin per run. Each run earns ticket orbs that act as draw entries, and payouts are made in the community's own asset." },
      { title: "Mainnet", detail: "Move the MiniCoin, prize vault and raid contracts from Monad testnet to mainnet." },
      { title: "More cartridges", detail: "Bring more community games into the arcade through the cartridge integration kit." },
      { title: "Creator onboarding", detail: "Help people build the game they have always imagined, then bring it to Token Arcade with a community behind it." },
    ],
  },
];

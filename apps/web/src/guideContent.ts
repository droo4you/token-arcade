export type GuideTopicId = "arcade" | "cabinets" | "raids" | "passport" | "console";

export type GuideStep = {
  title: string;
  body: string;
  tip?: string;
  href?: string;
  actionLabel?: string;
};

export type GuideTopic = {
  id: GuideTopicId;
  eyebrow: string;
  title: string;
  summary: string;
  durationLabel: string;
  theme: "cyan" | "lime" | "pink" | "violet" | "orange";
  steps: GuideStep[];
};

export const guideTopics: GuideTopic[] = [
  {
    id: "arcade",
    eyebrow: "START HERE",
    title: "Find your way around",
    summary: "A quick lap through the game shelf, play modes, and places to return to.",
    durationLabel: "About 2 minutes",
    theme: "cyan",
    steps: [
      {
        title: "Start at the game shelf",
        body: "The home page shows every cabinet and its current status. Open a card to see what its game does and which play modes are available.",
        href: "/",
        actionLabel: "Open arcade home",
      },
      {
        title: "Play as a guest",
        body: "Free Play needs no account. Pick a published cabinet and start playing; no wallet is needed.",
        tip: "Its score is for fun; a guest run does not enter verified standings.",
        href: "/",
        actionLabel: "Choose a game",
      },
      {
        title: "Choose a path when you are ready",
        body: "Ranked Runs use a player account and server-verified results. Community Raids add a shared challenge with its own rules and attempt limit. Only ready modes can be started.",
        href: "/raids",
        actionLabel: "See community raids",
      },
      {
        title: "Discover the cabinets",
        body: "The shelf comes from published Registry entries. New approved games appear after their developer deploys them, each with its own leaderboard and history.",
        href: "/",
        actionLabel: "Return to arcade home",
      },
    ],
  },
  {
    id: "cabinets",
    eyebrow: "HOW TO PLAY",
    title: "Open a cabinet",
    summary: "Understand a game's page, start Free Play, and see when scores count.",
    durationLabel: "About 2 minutes",
    theme: "lime",
    steps: [
      {
        title: "Check the cabinet page",
        body: "Each game page describes the game, its play modes, and its ranked board. An unavailable mode is labeled until the game and its checks are ready.",
        href: "/",
        actionLabel: "Open a cabinet",
      },
      {
        title: "Try Free Play first",
        body: "Free Play launches a ready cartridge without sign-in or a wallet. You can replay it as often as you like, and its score stays in this browser session.",
        href: "/",
        actionLabel: "Choose Free Play",
      },
      {
        title: "Go for a verified score",
        body: "A Ranked Run needs a player account and a game-specific verifier. The arcade checks the run before it enters the leaderboard and your Passport.",
        tip: "A score reported by the browser alone does not qualify for the board.",
        href: "/passport",
        actionLabel: "See Player Passport",
      },
    ],
  },
  {
    id: "raids",
    eyebrow: "PLAY TOGETHER",
    title: "Join a community raid",
    summary: "Learn the lobby, the rules, and what a valid attempt means.",
    durationLabel: "About 2 minutes",
    theme: "pink",
    steps: [
      {
        title: "Find an open challenge",
        body: "The raids page lists community challenges. A lobby shows its game, objective, schedule, entry terms, prize, and standings.",
        href: "/raids",
        actionLabel: "Browse raids",
      },
      {
        title: "Read the rules before playing",
        body: "Each raid sets a time window and an attempt limit. Sign in to start an attempt; the game must have a working competitive verifier.",
        tip: "The lobby tells you how many attempts remain when you are signed in.",
        href: "/passport",
        actionLabel: "Set up your Passport",
      },
      {
        title: "Watch for a verified result",
        body: "The arcade checks a finished attempt against its issued session and game proof. Only accepted attempts appear in raid standings.",
        href: "/raids",
        actionLabel: "Browse raid lobbies",
      },
      {
        title: "Know what is live",
        body: "The current test flow supports free raids with no prize. Paid entry, NFT prizes, custody, and fee settlement need further setup before they can open.",
      },
    ],
  },
  {
    id: "passport",
    eyebrow: "YOUR IDENTITY",
    title: "Set up your Passport",
    summary: "Keep verified runs together and learn how wallet linking works.",
    durationLabel: "About 2 minutes",
    theme: "violet",
    steps: [
      {
        title: "Create a player account",
        body: "Browse and Free Play as a guest, then sign in when you want to try available Ranked Runs or Community Raids. Your Passport is your player record.",
        href: "/passport",
        actionLabel: "Open Passport",
      },
      {
        title: "Make it yours",
        body: "Choose a display name and optional avatar. The Passport collects verified best scores, ranked runs, raid entries, and wins.",
        href: "/passport",
        actionLabel: "View your record",
      },
      {
        title: "Link an ownership wallet if needed",
        body: "A separate ownership wallet can be associated by signing a message. Linking requests no asset transfer, and you can unlink the wallet later.",
        tip: "Holder eligibility also needs a configured community asset and Monad connection; a linked address alone does not grant it.",
        href: "/passport",
        actionLabel: "See wallet options",
      },
    ],
  },
  {
    id: "console",
    eyebrow: "FOR CREATORS",
    title: "Prepare a launch",
    summary: "Submit a cartridge, follow its review, then deploy your approved cabinet.",
    durationLabel: "About 3 minutes",
    theme: "orange",
    steps: [
      {
        title: "Enter as a creator",
        body: "Sign in to the Creator Portal to submit your game and track review. Allowlisted admins have a separate review view.",
        href: "/launch",
        actionLabel: "Open Launch Console",
      },
      {
        title: "Submit your cartridge",
        body: "Provide the versioned game build, manifest and launch details. Submitted games are visible to their creator and admins, and stay off the public shelf.",
        href: "/launch",
        actionLabel: "See game drafts",
      },
      {
        title: "Pass the play checks",
        body: "An admin reviews the source, build, lifecycle, controls and results before approving. Competitive modes also need an installed game-specific verifier.",
        tip: "Approval is a separate state. It does not make a cabinet public.",
        href: "/launch",
        actionLabel: "Review readiness",
      },
      {
        title: "Deploy your approved game",
        body: "Return to your creator account and choose Deploy. The approved cabinet becomes published and appears on the arcade shelf automatically. An economy can be enabled later under the same game ID.",
        href: "/launch",
        actionLabel: "See deployment status",
      },
    ],
  },
];

export function getGuideTopic(id: string): GuideTopic | undefined {
  return guideTopics.find((topic) => topic.id === id);
}

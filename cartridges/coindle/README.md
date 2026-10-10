# Coindle

A daily cryptocurrency guessing game powered by **Pyth Network** price feeds. Guess the mystery coin in 6 tries.

Built for the **Pyth Community Hackathon 2026** (March 5 – April 1).

## How It Works

1. A mystery coin is selected each day (or randomly in Free Play mode)
2. You have **6 guesses** to identify it
3. Each guess reveals clues across **6 categories**:

| Category | Green | Yellow | Red |
|----------|-------|--------|-----|
| **Type** | Exact match | Same family (e.g. L1/L2) | Different family |
| **Color** | Exact match | Adjacent on color wheel | Not adjacent |
| **Launch Year** | Exact | Within 1 year | 2+ years off |
| **Ticker Length** | Exact | Within 1 letter | 2+ letters off |
| **Price Range** | Same tier | Adjacent tier | 2+ tiers off |
| **FDV Range** | Same bucket | Adjacent bucket | 2+ buckets off |

Numeric categories show directional arrows (↑/↓) to help narrow down the answer.

## Features

- **Daily Mode** — Same coin for everyone, resets at midnight UTC
- **Free Play Mode** — Random coins, unlimited rounds
- **Easy/Hard Difficulty** — Easy mode shows a 90-day Pyth sparkline chart as a hint
- **Live Prices** — Real-time Pyth Hermes prices refreshed every 30s with green dot indicator
- **24h Price Change** — Daily % change calculated from historical Pyth data
- **Hint System** — Reveal secret coin categories (shown as purple on share cards)
- **Share Results** — Copy emoji grid to clipboard, supports Web Share API
- **Statistics** — Track daily win streak, guess distribution, and win rate
- **Pyth Feed Transparency** — Post-game card showing exact Pyth feed ID, price tier mapping, and link to verify on Hermes
- **Dark/Light Theme** — Beige/green light mode, charcoal/blue dark mode
- **140+ Verified Coins** — All confirmed to have active Pyth price feeds
- **Flip Card Animations** — Staggered horizontal card flip reveals
- **Countdown Timer** — Shows time until next daily puzzle

## Pyth Integration

Coindle uses the **Pyth Hermes API** as its sole price data source — no other oracles or APIs:

1. **Live Prices** — Polls `/v2/updates/price/latest` every 30 seconds for real-time prices displayed next to each guess with a green dot indicator
2. **24h Change** — Fetches historical price from `/v2/updates/price/{timestamp}` (24h ago) to calculate daily percentage change
3. **Game Logic** — Price tiers and FDV comparisons are derived from cached Pyth price snapshots, ensuring fair daily puzzles for all players
4. **Easy Mode Sparkline** — Samples 30 data points over 90 days from `/v2/updates/price/{timestamp}` to render the price hint chart
5. **Feed Transparency** — After each game, players can inspect the exact Pyth feed ID, cached vs live price, tier mapping, and verify directly on Hermes

All 140+ coins in the pool have verified Pyth feed IDs. Every price displayed in the game traces back to Pyth.

## Tech Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** with PostCSS
- **Pyth Hermes API** for real-time and historical price data
- **Remotion** for promo video generation
- **Vercel** for hosting + cron jobs

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Optionally add your Pyth API key for higher rate limits

# Run development server
npm run dev

# Open http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PYTH_API_KEY` | No | Pyth Pro API key for higher rate limits |
| `CRON_SECRET` | No | Secret to protect the daily cron endpoint |

## Project Structure

```
src/
  app/
    page.tsx                # Main game page
    globals.css             # Theme system (light/dark), animations
    api/
      prices/route.ts       # GET /api/prices — batch price tiers
      history/route.ts      # GET /api/history?ticker=X — 90-day sparkline
      cron/daily/route.ts   # Daily price cache refresh
  components/
    Header.tsx              # Logo, mode/difficulty toggles, stats, info, theme
    GameBoard.tsx           # Main game area — compact result or active play
    GuessRow.tsx            # Row of 6 category cells + live price
    CategoryCell.tsx        # Flip card with green/yellow/red/purple result
    CoinAutocomplete.tsx    # Search input with dropdown
    RevealCard.tsx          # Post-game result card with live price
    AnswerRow.tsx           # Answer categories on game over
    PythFeedCard.tsx        # Pyth feed transparency card
    Sparkline.tsx           # 90-day price chart (Easy mode hint)
    StatsModal.tsx          # Statistics modal (daily mode)
    CountdownTimer.tsx      # Countdown to next daily puzzle
    InfoModal.tsx           # How to play + Pyth integration explainer
  hooks/
    useGame.ts              # Core game logic + state management
    useLivePrices.ts        # Client-side Pyth Hermes polling (30s)
    useTheme.ts             # Dark/light theme toggle
    useLocalStorage.ts      # SSR-safe localStorage hook
  lib/
    types.ts                # TypeScript types
    constants.ts            # Game constants, price tiers, color wheel
    coins.ts                # 140+ coins with Pyth feed IDs
    compare.ts              # 6-category comparison engine
    daily.ts                # Daily coin selection + puzzle numbering
    pyth.ts                 # Pyth Hermes API client
    cache.ts                # In-memory cache layer
remotion/
  CoindlePromo.tsx          # Promotional video composition
  Root.tsx                  # Remotion root
  index.ts                  # Remotion entry point
```

## Deployment

Deploy to Vercel with one click. The `vercel.json` configures a daily cron job at midnight UTC to refresh price caches.

Set `PYTH_API_KEY` and `CRON_SECRET` in your Vercel environment variables.

## Music Attribution

Background music in the promo video: "Wholesome" by Kevin MacLeod (incompetech.com), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

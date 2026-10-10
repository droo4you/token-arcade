import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Easing,
} from "remotion";

/* ──────────────────────────────────────────────────────────────
 * COINDLE PROMO v3 — 35s vertical video (1080×1920 @ 30fps = 1050 frames)
 *
 * Matches the actual game's dark-mode aesthetic:
 *   Charcoal backgrounds, blue accent, warm off-white text,
 *   bento cards with subtle borders, no glow/particle effects.
 *
 * Scene breakdown:
 *   0-120     Intro
 *   120-360   Gameplay — typing + guess rows + celebration (8s)
 *   360-510   Live Prices — scrolling 140+ coin list
 *   510-660   Chart — 90-day sparkline
 *   660-810   Free Play + Hints
 *   810-930   Share
 *   930-1050  CTA
 * ────────────────────────────────────────────────────────────── */

// ── Actual game dark-mode palette ────────────────────────────
const BG = "#1A1D23";
const SURFACE = "#22262E";
const SURFACE2 = "#2A2F38";
const SURFACE3 = "#343A45";
const ACCENT = "#5B8DEF";
const ACCENT_SOFT = "#1E2A42";
const CELL_GREEN = "#4ADE80";
const CELL_YELLOW = "#FACC15";
const CELL_RED = "#F87171";
const CELL_PURPLE = "#A78BFA";
const LIVE_GREEN = "#22c55e";
const TEXT = "#E8E6E1";
const TEXT_MUTED = "#9B97A0";
const TEXT_DIM = "#6B6774";
const BORDER = "#3A3F4A";
const BORDER_LIGHT = "#2E333C";

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// ── Shared Helpers ─────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  duration = 14,
  y = 30,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{ opacity: progress, transform: `translateY(${(1 - progress) * y}px)` }}>
      {children}
    </div>
  );
}

function ScaleIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 120, mass: 0.8 } });
  return <div style={{ transform: `scale(${scale})` }}>{children}</div>;
}

/** Bento card matching the game's .bento-card class */
function BentoCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER_LIGHT}`,
        borderRadius: 16,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Category cell matching the game's 72px cells with 12px radius */
function CategoryCell({
  value,
  color,
  delay = 0,
}: {
  value: string;
  color: string;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 160, mass: 0.6 },
  });
  return (
    <div
      style={{
        background: color,
        borderRadius: 12,
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${progress})`,
        padding: "6px 4px",
      }}
    >
      <span
        style={{
          color: "white",
          fontSize: 15,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.2,
          fontFamily: FONT,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Simple green dot — no glow, just a clean indicator */
function LiveDot({ size = 8 }: { size?: number }) {
  const frame = useCurrentFrame();
  const pulse = 0.85 + Math.sin(frame * 0.12) * 0.15;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: LIVE_GREEN,
        opacity: pulse,
      }}
    />
  );
}

/** Sparkline SVG */
function SparklineChart({ delay = 0 }: { delay?: number }) {
  const frame = useCurrentFrame();
  const points = [
    88, 87, 88, 87, 90, 93, 90, 91, 95, 93, 89, 89, 89, 84, 78, 62, 70, 67,
    69, 67, 67, 64, 67, 65, 72, 67, 69, 70, 74, 69, 67,
  ];
  const maxP = Math.max(...points);
  const minP = Math.min(...points);
  const w = 880;
  const h = 260;
  const pad = 20;

  const drawProgress = interpolate(frame - delay, [0, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const visiblePts = Math.floor(drawProgress * points.length);

  const pathD = points
    .slice(0, visiblePts)
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p - minP) / (maxP - minP)) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const fillD =
    visiblePts > 0
      ? `${pathD} L ${pad + ((visiblePts - 1) / (points.length - 1)) * (w - pad * 2)} ${h} L ${pad} ${h} Z`
      : "";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.2" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fillD && <path d={fillD} fill="url(#sparkFill)" />}
      {pathD && (
        <path d={pathD} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {visiblePts > 0 && (
        <circle
          cx={pad + ((visiblePts - 1) / (points.length - 1)) * (w - pad * 2)}
          cy={pad + (1 - (points[visiblePts - 1] - minP) / (maxP - minP)) * (h - pad * 2)}
          r={5}
          fill={ACCENT}
        />
      )}
    </svg>
  );
}

// ── Scenes ─────────────────────────────────────────────────────

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  const tagOpacity = interpolate(frame, [35, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subtitleOpacity = interpolate(frame, [55, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle grid pattern dots
  const gridDots = Array.from({ length: 80 }).map((_, i) => {
    const col = i % 10;
    const row = Math.floor(i / 10);
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: 60 + col * 100,
          top: 400 + row * 100,
          width: 3,
          height: 3,
          borderRadius: "50%",
          background: BORDER,
          opacity: 0.5,
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      {gridDots}

      {/* Logo */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${logoScale})`,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 120,
            fontWeight: 900,
            margin: 0,
            letterSpacing: -3,
            fontFamily: FONT,
          }}
        >
          <span style={{ color: ACCENT }}>Coin</span>
          <span style={{ color: TEXT }}>dle</span>
        </h1>
      </div>

      {/* Tagline */}
      <div
        style={{
          position: "absolute",
          top: "54%",
          width: "100%",
          textAlign: "center",
          opacity: tagOpacity,
        }}
      >
        <p style={{ fontSize: 36, color: TEXT_MUTED, margin: 0, fontWeight: 500, fontFamily: FONT }}>
          The daily crypto guessing game
        </p>
      </div>

      {/* Pyth badge */}
      <div
        style={{
          position: "absolute",
          top: "63%",
          width: "100%",
          textAlign: "center",
          opacity: subtitleOpacity,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: ACCENT_SOFT,
            border: `1px solid ${ACCENT}33`,
            borderRadius: 10,
            padding: "10px 24px",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600, color: ACCENT, fontFamily: FONT }}>
            Powered by Pyth Network
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function GameplayScene() {
  const frame = useCurrentFrame();

  const GUESSES = [
    {
      typingText: "Bit",
      dropdownOptions: [
        { ticker: "BTC", name: "Bitcoin", highlight: true },
        { ticker: "BCH", name: "Bitcoin Cash", highlight: false },
      ],
      coin: { ticker: "BTC", name: "Bitcoin", price: "$68,439", change: "+2.4%" },
      cells: [
        { value: "L1", color: CELL_GREEN },
        { value: "Orange", color: CELL_RED },
        { value: "2009\n↑", color: CELL_RED },
        { value: "3 ltrs", color: CELL_GREEN },
        { value: ">$10K\n↓", color: CELL_RED },
        { value: ">100B\n↓", color: CELL_RED },
      ],
      startFrame: 15,
    },
    {
      typingText: "Sol",
      dropdownOptions: [
        { ticker: "SOL", name: "Solana", highlight: true },
        { ticker: "SLAYER", name: "Solayer", highlight: false },
      ],
      coin: { ticker: "SOL", name: "Solana", price: "$86.47", change: "+5.1%" },
      cells: [
        { value: "L1", color: CELL_GREEN },
        { value: "Purple", color: CELL_YELLOW },
        { value: "2020\n↑", color: CELL_YELLOW },
        { value: "3 ltrs", color: CELL_GREEN },
        { value: "$10-\n$100↓", color: CELL_YELLOW },
        { value: "10B-\n100B↓", color: CELL_YELLOW },
      ],
      startFrame: 80,
    },
    {
      typingText: "Apt",
      dropdownOptions: [{ ticker: "APT", name: "Aptos", highlight: true }],
      coin: { ticker: "APT", name: "Aptos", price: "$0.94", change: "-1.2%" },
      cells: [
        { value: "L1", color: CELL_GREEN },
        { value: "Green", color: CELL_GREEN },
        { value: "2022", color: CELL_GREEN },
        { value: "3 ltrs", color: CELL_GREEN },
        { value: "$0.1-$1", color: CELL_GREEN },
        { value: "1B-\n10B", color: CELL_GREEN },
      ],
      startFrame: 145,
    },
  ];

  const activeGuessIdx = GUESSES.findIndex(
    (g) => frame >= g.startFrame && frame < g.startFrame + 60
  );

  let searchText = "";
  let showDropdown = false;
  let dropdownItems: { ticker: string; name: string; highlight: boolean }[] = [];
  let highlightActive = false;
  let showCursor = true;

  if (activeGuessIdx >= 0) {
    const g = GUESSES[activeGuessIdx];
    const lf = frame - g.startFrame;
    if (lf < 20) {
      const chars = Math.floor(interpolate(lf, [0, 18], [0, g.typingText.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
      searchText = g.typingText.slice(0, chars);
      showCursor = Math.floor(lf * 1.5) % 2 === 0;
    } else if (lf < 30) {
      searchText = g.typingText;
      showDropdown = true;
      dropdownItems = g.dropdownOptions;
      showCursor = false;
    } else if (lf < 35) {
      searchText = g.typingText;
      showDropdown = true;
      dropdownItems = g.dropdownOptions;
      highlightActive = true;
      showCursor = false;
    } else {
      searchText = "";
      showCursor = false;
    }
  } else {
    showCursor = false;
  }

  const completedGuesses = GUESSES.filter((g) => frame >= g.startFrame + 40);

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <div style={{ padding: "60px 40px" }}>
        {/* Mini header */}
        <FadeIn delay={0}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: TEXT, margin: 0, fontFamily: FONT }}>
              <span style={{ color: ACCENT }}>Coin</span>dle
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ background: ACCENT, color: "white", padding: "6px 18px", borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: FONT }}>
                Daily
              </div>
              <div style={{ background: SURFACE2, color: TEXT_MUTED, padding: "6px 14px", borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: FONT }}>
                Hard
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Search bar */}
        {frame < GUESSES[GUESSES.length - 1].startFrame + 55 && (
          <FadeIn delay={5}>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <BentoCard style={{ padding: "14px 20px", borderRadius: 12 }}>
                <span style={{ fontSize: 20, color: searchText ? TEXT : TEXT_DIM, fontFamily: FONT }}>
                  {searchText || "Search coin name or ticker..."}
                  {showCursor && (
                    <span style={{ display: "inline-block", width: 2, height: 20, background: ACCENT, marginLeft: 2, verticalAlign: "middle" }} />
                  )}
                </span>
              </BentoCard>

              {showDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: SURFACE,
                    borderRadius: 12,
                    border: `1px solid ${BORDER}`,
                    overflow: "hidden",
                    zIndex: 10,
                  }}
                >
                  {dropdownItems.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: item.highlight && highlightActive ? ACCENT_SOFT : "transparent",
                        borderLeft: item.highlight && highlightActive ? `3px solid ${ACCENT}` : "3px solid transparent",
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{item.ticker}</span>
                      <span style={{ fontSize: 16, color: TEXT_MUTED, fontFamily: FONT }}>{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FadeIn>
        )}

        {/* Remaining guesses */}
        {frame < GUESSES[GUESSES.length - 1].startFrame + 55 && (
          <FadeIn delay={8}>
            <p style={{ textAlign: "center", fontSize: 14, color: TEXT_DIM, margin: "0 0 12px", fontFamily: FONT }}>
              {6 - completedGuesses.length} guess{6 - completedGuesses.length !== 1 ? "es" : ""} remaining
            </p>
          </FadeIn>
        )}

        {/* Column headers */}
        <FadeIn delay={5}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 6, padding: "0 2px" }}>
            {["TYPE", "COLOR", "YEAR", "TICKER", "PRICE", "FDV"].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textAlign: "center", letterSpacing: 1.5, fontFamily: FONT }}>
                {h}
              </span>
            ))}
          </div>
        </FadeIn>

        {/* Guess rows */}
        {GUESSES.map((g, rowIdx) => {
          const rowAppearFrame = g.startFrame + 38;
          const rowOpacity = interpolate(frame - rowAppearFrame, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (frame < rowAppearFrame) return null;

          return (
            <div key={rowIdx} style={{ opacity: rowOpacity, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, paddingLeft: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: FONT }}>{g.coin.ticker}</span>
                <span style={{ fontSize: 14, color: TEXT_MUTED, fontFamily: FONT }}>{g.coin.name}</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <LiveDot size={6} />
                  <span style={{ fontSize: 14, color: TEXT_MUTED, fontWeight: 500, fontFamily: FONT }}>{g.coin.price}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: g.coin.change.startsWith("+") ? LIVE_GREEN : CELL_RED, fontFamily: FONT }}>{g.coin.change}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                {g.cells.map((c, i) => (
                  <CategoryCell key={i} value={c.value} color={c.color} delay={rowAppearFrame + i * 3} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Empty slots */}
        {completedGuesses.length < 3 && (
          <FadeIn delay={10}>
            <div>
              {Array.from({ length: Math.max(0, 3 - completedGuesses.length) }).map((_, i) => (
                <div key={`e-${i}`} style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 8 }}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} style={{ height: 72, borderRadius: 12, background: SURFACE, border: `1px dashed ${BORDER}` }} />
                  ))}
                </div>
              ))}
            </div>
          </FadeIn>
        )}

        {/* Correct! */}
        {frame >= 200 && (
          <ScaleIn delay={200}>
            <div style={{ textAlign: "center", marginTop: 16, padding: "14px 0", background: ACCENT_SOFT, borderRadius: 16, border: `1px solid ${ACCENT}33` }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: CELL_GREEN, fontFamily: FONT }}>
                ✓ Correct!
              </span>
              <div style={{ marginTop: 4, fontSize: 16, color: TEXT_MUTED, fontFamily: FONT }}>
                Guessed in 3/6
              </div>
            </div>
          </ScaleIn>
        )}
      </div>
    </AbsoluteFill>
  );
}

function LivePriceScene() {
  const frame = useCurrentFrame();

  const ALL_COINS: { ticker: string; name: string; price: number }[] = [
    { ticker: "BTC", name: "Bitcoin", price: 68439 },
    { ticker: "ETH", name: "Ethereum", price: 2054 },
    { ticker: "SOL", name: "Solana", price: 86.47 },
    { ticker: "BNB", name: "BNB", price: 312.5 },
    { ticker: "XRP", name: "Ripple", price: 0.5214 },
    { ticker: "ADA", name: "Cardano", price: 0.4512 },
    { ticker: "AVAX", name: "Avalanche", price: 35.22 },
    { ticker: "DOT", name: "Polkadot", price: 7.34 },
    { ticker: "NEAR", name: "NEAR Protocol", price: 5.18 },
    { ticker: "APT", name: "Aptos", price: 0.94 },
    { ticker: "SUI", name: "Sui", price: 1.32 },
    { ticker: "TRX", name: "TRON", price: 0.1082 },
    { ticker: "TON", name: "Toncoin", price: 5.67 },
    { ticker: "ICP", name: "Internet Computer", price: 12.45 },
    { ticker: "S", name: "Sonic", price: 0.82 },
    { ticker: "ATOM", name: "Cosmos", price: 8.91 },
    { ticker: "SEI", name: "Sei", price: 0.42 },
    { ticker: "INJ", name: "Injective", price: 24.56 },
    { ticker: "ALGO", name: "Algorand", price: 0.18 },
    { ticker: "HBAR", name: "Hedera", price: 0.075 },
    { ticker: "XLM", name: "Stellar", price: 0.112 },
    { ticker: "EGLD", name: "MultiversX", price: 38.9 },
    { ticker: "CELO", name: "Celo", price: 0.72 },
    { ticker: "KAS", name: "Kaspa", price: 0.145 },
    { ticker: "MON", name: "Monad", price: 2.34 },
    { ticker: "BERA", name: "Berachain", price: 4.56 },
    { ticker: "POL", name: "Polygon", price: 0.58 },
    { ticker: "OP", name: "Optimism", price: 2.14 },
    { ticker: "ARB", name: "Arbitrum", price: 1.12 },
    { ticker: "STRK", name: "Starknet", price: 1.78 },
    { ticker: "ZK", name: "zkSync", price: 0.22 },
    { ticker: "MOVE", name: "Movement", price: 0.89 },
    { ticker: "HYPE", name: "Hyperliquid", price: 12.34 },
    { ticker: "UNI", name: "Uniswap", price: 7.82 },
    { ticker: "AAVE", name: "Aave", price: 92.4 },
    { ticker: "CRV", name: "Curve", price: 0.56 },
    { ticker: "SNX", name: "Synthetix", price: 2.89 },
    { ticker: "LDO", name: "Lido DAO", price: 2.12 },
    { ticker: "GMX", name: "GMX", price: 34.5 },
    { ticker: "DYDX", name: "dYdX", price: 1.98 },
    { ticker: "COMP", name: "Compound", price: 52.3 },
    { ticker: "YFI", name: "Yearn", price: 7845 },
    { ticker: "PENDLE", name: "Pendle", price: 4.56 },
    { ticker: "JUP", name: "Jupiter", price: 0.82 },
    { ticker: "RAY", name: "Raydium", price: 1.67 },
    { ticker: "SUSHI", name: "SushiSwap", price: 0.94 },
    { ticker: "ENA", name: "Ethena", price: 0.45 },
    { ticker: "RPL", name: "Rocket Pool", price: 22.1 },
    { ticker: "JTO", name: "Jito", price: 2.78 },
    { ticker: "BLUR", name: "Blur", price: 0.32 },
    { ticker: "LINK", name: "Chainlink", price: 14.23 },
    { ticker: "GRT", name: "The Graph", price: 0.22 },
    { ticker: "PYTH", name: "Pyth Network", price: 0.1823 },
    { ticker: "HNT", name: "Helium", price: 5.67 },
    { ticker: "AR", name: "Arweave", price: 8.9 },
    { ticker: "FIL", name: "Filecoin", price: 5.34 },
    { ticker: "ONDO", name: "Ondo Finance", price: 0.78 },
    { ticker: "EIGEN", name: "EigenLayer", price: 1.56 },
    { ticker: "VET", name: "VeChain", price: 0.032 },
    { ticker: "STX", name: "Stacks", price: 1.89 },
    { ticker: "TIA", name: "Celestia", price: 6.78 },
    { ticker: "ORDI", name: "ORDI", price: 34.5 },
    { ticker: "ENS", name: "ENS", price: 12.3 },
    { ticker: "RENDER", name: "Render", price: 3.45 },
    { ticker: "TAO", name: "Bittensor", price: 312 },
    { ticker: "FET", name: "Fetch.ai", price: 0.56 },
    { ticker: "DOGE", name: "Dogecoin", price: 0.082 },
    { ticker: "SHIB", name: "Shiba Inu", price: 0.0000089 },
    { ticker: "PEPE", name: "Pepe", price: 0.0000012 },
    { ticker: "WIF", name: "dogwifhat", price: 1.67 },
    { ticker: "BONK", name: "Bonk", price: 0.000018 },
    { ticker: "FLOKI", name: "Floki", price: 0.00016 },
    { ticker: "TRUMP", name: "TRUMP", price: 4.56 },
    { ticker: "MOODENG", name: "Moo Deng", price: 0.012 },
    { ticker: "GOAT", name: "Goatseus", price: 0.45 },
    { ticker: "PENGU", name: "Pudgy Penguins", price: 0.012 },
    { ticker: "LTC", name: "Litecoin", price: 72.3 },
    { ticker: "BCH", name: "Bitcoin Cash", price: 245 },
    { ticker: "ETC", name: "Ethereum Classic", price: 18.9 },
    { ticker: "USDT", name: "Tether", price: 1.0 },
    { ticker: "USDC", name: "USD Coin", price: 1.0 },
    { ticker: "DAI", name: "Dai", price: 1.0 },
    { ticker: "PAXG", name: "PAX Gold", price: 2345 },
    { ticker: "WBTC", name: "Wrapped BTC", price: 68420 },
    { ticker: "STETH", name: "Lido stETH", price: 2051 },
    { ticker: "ETHFI", name: "Ether.fi", price: 1.89 },
    { ticker: "ZETA", name: "ZetaChain", price: 0.78 },
    { ticker: "ALT", name: "AltLayer", price: 0.34 },
    { ticker: "CAKE", name: "PancakeSwap", price: 2.56 },
    { ticker: "RUNE", name: "THORChain", price: 4.12 },
    { ticker: "IMX", name: "ImmutableX", price: 1.56 },
    { ticker: "GALA", name: "Gala", price: 0.028 },
    { ticker: "SAND", name: "Sandbox", price: 0.42 },
    { ticker: "AXS", name: "Axie Infinity", price: 6.78 },
    { ticker: "GRASS", name: "Grass", price: 1.78 },
    { ticker: "PRIME", name: "Echelon Prime", price: 8.9 },
    { ticker: "MANA", name: "Decentraland", price: 0.45 },
  ];

  const formatPrice = (p: number) => {
    if (p >= 1000) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return "$" + p.toFixed(2);
    if (p >= 0.001) return "$" + p.toFixed(4);
    return "$" + p.toPrecision(3);
  };

  const ROW_H = 62;
  const totalH = ALL_COINS.length * ROW_H;
  const viewH = 1920 - 260;
  const scrollY = interpolate(frame, [15, 140], [0, totalH - viewH], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          padding: "55px 50px 20px",
          background: `linear-gradient(to bottom, ${BG} 60%, ${BG}00)`,
        }}
      >
        <FadeIn delay={0}>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 6 }}>
              <LiveDot size={14} />
              <h2 style={{ fontSize: 46, fontWeight: 800, color: TEXT, margin: 0, fontFamily: FONT }}>
                Live Prices
              </h2>
            </div>
            <p style={{ fontSize: 24, color: ACCENT, margin: 0, fontWeight: 600, fontFamily: FONT }}>
              140+ Coins · Powered by Pyth
            </p>
            <p style={{ fontSize: 16, color: TEXT_DIM, margin: "4px 0 0", fontFamily: FONT }}>
              Real-time feeds refreshed every 30 seconds
            </p>
          </div>
        </FadeIn>
      </div>

      {/* Scrolling list */}
      <div
        style={{
          position: "absolute",
          top: 210,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 2%, black 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 2%, black 90%, transparent 100%)",
        }}
      >
        <div style={{ transform: `translateY(-${scrollY}px)`, padding: "0 36px" }}>
          {ALL_COINS.map((coin, i) => {
            const tick = Math.sin((frame + i * 37) * 0.08) * coin.price * 0.002;
            const currentPrice = coin.price + tick;
            const changeVal = Math.sin((frame * 0.05) + i * 2.1) * 5;
            const isUp = changeVal >= 0;

            return (
              <div
                key={i}
                style={{
                  height: ROW_H - 6,
                  marginBottom: 6,
                  background: SURFACE,
                  borderRadius: 12,
                  padding: "0 20px",
                  display: "flex",
                  alignItems: "center",
                  border: `1px solid ${BORDER_LIGHT}`,
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 700, color: TEXT, minWidth: 80, fontFamily: FONT }}>
                  {coin.ticker}
                </span>
                <span style={{ fontSize: 14, color: TEXT_DIM, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontFamily: FONT }}>
                  {coin.name}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <LiveDot size={5} />
                  <span style={{ fontSize: 17, fontWeight: 600, color: TEXT, fontVariantNumeric: "tabular-nums", minWidth: 100, textAlign: "right", fontFamily: FONT }}>
                    {formatPrice(currentPrice)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isUp ? LIVE_GREEN : CELL_RED, minWidth: 50, textAlign: "right", fontFamily: FONT }}>
                    {isUp ? "+" : ""}{changeVal.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom count badge */}
      <div style={{ position: "absolute", bottom: 50, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 2 }}>
        <FadeIn delay={60}>
          <div
            style={{
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "10px 28px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <LiveDot size={8} />
            <span style={{ fontSize: 18, fontWeight: 600, color: TEXT_MUTED, fontFamily: FONT }}>
              All fed by Pyth Hermes
            </span>
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
}

function ChartScene() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <div style={{ padding: "80px 50px", display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
        <FadeIn delay={0}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div
              style={{
                display: "inline-block",
                background: ACCENT_SOFT,
                border: `1px solid ${ACCENT}33`,
                borderRadius: 10,
                padding: "6px 16px",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: ACCENT, letterSpacing: 2, fontFamily: FONT }}>
                EASY MODE
              </span>
            </div>
            <h2 style={{ fontSize: 46, fontWeight: 800, color: TEXT, margin: 0, fontFamily: FONT }}>
              90-Day Sparkline
            </h2>
            <p style={{ fontSize: 22, color: TEXT_MUTED, margin: "8px 0 0", fontFamily: FONT }}>
              Use the price shape as a hint
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={15}>
          <BentoCard style={{ padding: "28px 20px", borderRadius: 20, marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "0 8px" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_DIM, letterSpacing: 2, fontFamily: FONT }}>
                90-DAY PRICE HINT
              </span>
              <span style={{ fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}>
                Powered by Pyth
              </span>
            </div>
            <SparklineChart delay={20} />
          </BentoCard>
        </FadeIn>

        <FadeIn delay={50}>
          <BentoCard style={{ padding: 24, borderRadius: 16, textAlign: "center" }}>
            <div style={{ fontSize: 50, marginBottom: 6 }}>🤔</div>
            <p style={{ fontSize: 26, color: TEXT, margin: 0, fontWeight: 600, fontFamily: FONT }}>
              Can you guess the coin?
            </p>
            <p style={{ fontSize: 18, color: TEXT_DIM, margin: "6px 0 0", fontFamily: FONT }}>
              Historical Pyth price data reveals the shape
            </p>
          </BentoCard>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
}

function FreePlayScene() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <div style={{ padding: "80px 50px", display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
        <FadeIn delay={0}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: TEXT, margin: 0, fontFamily: FONT }}>
              Free Play
            </h2>
            <p style={{ fontSize: 24, color: TEXT_MUTED, margin: "8px 0 0", fontFamily: FONT }}>
              Unlimited random coins
            </p>
          </div>
        </FadeIn>

        {/* Mode toggle */}
        <FadeIn delay={10}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
            <div style={{ display: "flex", background: SURFACE, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER_LIGHT}` }}>
              <div style={{ padding: "12px 36px", fontSize: 20, fontWeight: 600, color: TEXT_DIM, fontFamily: FONT }}>
                Daily
              </div>
              <div style={{ padding: "12px 36px", fontSize: 20, fontWeight: 700, color: "white", background: ACCENT, fontFamily: FONT }}>
                Free Play
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Hint system */}
        <FadeIn delay={25}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 32, fontWeight: 700, color: TEXT, margin: "0 0 16px", fontFamily: FONT }}>
              Hint System
            </h3>
          </div>
        </FadeIn>

        <FadeIn delay={35}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 12 }}>
            {["TYPE", "COLOR", "YEAR", "TICKER", "PRICE", "FDV"].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textAlign: "center", letterSpacing: 1, fontFamily: FONT }}>
                {h}
              </span>
            ))}
          </div>
        </FadeIn>

        {/* Purple hint cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 30 }}>
          {[
            { value: "L1", revealed: true },
            { value: "?", revealed: false },
            { value: "2022", revealed: true },
            { value: "?", revealed: false },
            { value: "?", revealed: false },
            { value: "1B-10B", revealed: true },
          ].map((cell, i) => (
            <ScaleIn key={i} delay={45 + i * 8}>
              <div
                style={{
                  background: cell.revealed ? CELL_PURPLE : SURFACE2,
                  borderRadius: 12,
                  height: 72,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 4px",
                  border: cell.revealed ? "none" : `1px dashed ${BORDER}`,
                }}
              >
                <span style={{ color: cell.revealed ? "white" : TEXT_DIM, fontSize: 16, fontWeight: 700, textAlign: "center", lineHeight: 1.2, fontFamily: FONT }}>
                  {cell.value}
                </span>
              </div>
            </ScaleIn>
          ))}
        </div>

        {/* Hint button */}
        <FadeIn delay={90}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ background: CELL_PURPLE, color: "white", padding: "12px 32px", borderRadius: 12, fontSize: 20, fontWeight: 700, fontFamily: FONT }}>
              Hint (3/6)
            </div>
          </div>
        </FadeIn>

        {/* Share preview */}
        <FadeIn delay={105}>
          <BentoCard style={{ marginTop: 32, padding: 22, borderRadius: 16, textAlign: "center" }}>
            <p style={{ fontSize: 16, color: TEXT_DIM, margin: "0 0 8px", fontFamily: FONT }}>
              Hints show on your share card
            </p>
            <p style={{ fontSize: 28, margin: 0, lineHeight: 1.6, fontFamily: FONT }}>
              🟪🟥🟪🟩🟨🟪
            </p>
          </BentoCard>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
}

function ShareScene() {
  const SHARE_TEXT = `Coindle #2 3/6\n\n🟩🟥🟥🟩🟥🟥\n🟩🟨🟨🟩🟨🟨\n🟩🟩🟩🟩🟩🟩`;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "80px 60px" }}>
        <FadeIn delay={0}>
          <h2 style={{ fontSize: 46, fontWeight: 800, color: TEXT, textAlign: "center", margin: "0 0 36px", fontFamily: FONT }}>
            Share Results
          </h2>
        </FadeIn>

        <ScaleIn delay={10}>
          <BentoCard style={{ padding: "40px 48px", borderRadius: 20 }}>
            <pre style={{ fontSize: 30, lineHeight: 1.7, color: TEXT, fontFamily: FONT, margin: 0, whiteSpace: "pre-wrap", textAlign: "center" }}>
              {SHARE_TEXT}
            </pre>
            <p style={{ fontSize: 18, color: ACCENT, textAlign: "center", margin: "14px 0 0", fontFamily: FONT }}>
              Play at coindle.xyz
            </p>
          </BentoCard>
        </ScaleIn>

        <FadeIn delay={35}>
          <div style={{ marginTop: 24, background: ACCENT, color: "white", padding: "12px 40px", borderRadius: 12, fontSize: 22, fontWeight: 700, fontFamily: FONT }}>
            📋 Copied!
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
}

function CTAScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ transform: `scale(${logoScale})` }}>
          <h1 style={{ fontSize: 110, fontWeight: 900, margin: 0, letterSpacing: -3, fontFamily: FONT }}>
            <span style={{ color: ACCENT }}>Coin</span>
            <span style={{ color: TEXT }}>dle</span>
          </h1>
        </div>

        <FadeIn delay={15}>
          <div style={{ marginTop: 36 }}>
            <div style={{ background: ACCENT, color: "white", padding: "20px 72px", borderRadius: 16, fontSize: 36, fontWeight: 800, fontFamily: FONT }}>
              Play Now
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={30}>
          <p style={{ fontSize: 32, color: TEXT_MUTED, marginTop: 18, fontWeight: 500, fontFamily: FONT }}>
            coindle.xyz
          </p>
        </FadeIn>

        <FadeIn delay={50}>
          <div style={{ marginTop: 50, display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                background: ACCENT_SOFT,
                border: `1px solid ${ACCENT}33`,
                borderRadius: 10,
                padding: "10px 22px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 600, color: ACCENT, fontFamily: FONT }}>
                Powered by Pyth Network
              </span>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={65}>
          <p style={{ fontSize: 16, color: TEXT_DIM, marginTop: 14, fontFamily: FONT }}>
            Built for the Pyth Community Hackathon 2026
          </p>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
}

// ── Main Composition ───────────────────────────────────────────

export const CoindlePromo: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <Audio
        src={staticFile("audio/bgm.mp3")}
        volume={(f) => {
          const fadeIn = interpolate(f, [0, 30], [0, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const fadeOut = interpolate(f, [durationInFrames - 60, durationInFrames], [0.35, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return Math.min(fadeIn, fadeOut);
        }}
      />

      <Sequence from={0} durationInFrames={120}>
        <IntroScene />
      </Sequence>

      <Sequence from={120} durationInFrames={240}>
        <GameplayScene />
      </Sequence>

      <Sequence from={360} durationInFrames={150}>
        <LivePriceScene />
      </Sequence>

      <Sequence from={510} durationInFrames={150}>
        <ChartScene />
      </Sequence>

      <Sequence from={660} durationInFrames={150}>
        <FreePlayScene />
      </Sequence>

      <Sequence from={810} durationInFrames={120}>
        <ShareScene />
      </Sequence>

      <Sequence from={930} durationInFrames={120}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};

/** Server-rendered Open Graph video cards for the arcade shell and cartridge pages. */

export const SHARE_WIDTH = 1280;
export const SHARE_HEIGHT = 720;
export const CANONICAL_ORIGIN = "https://token-arcade.onrender.com";

export type ShareCard = {
  title: string;
  description: string;
  videoPath: string;
  imagePath: string;
  pagePath: string;
};

type ShareCopy = Omit<ShareCard, "pagePath">;

export const homeCard: ShareCopy = {
  title: "Token Arcade — The Internet Is Fun",
  description: "Token Arcade is a little corner of the internet made for playing.",
  videoPath: "/share/arcade.mp4",
  imagePath: "/share/arcade.png",
};

/** Known playable cabinets. A published game without its own clip uses the arcade promo. */
export const gameCards: Record<string, ShareCopy> = {
  coindle: {
    title: "Coindle",
    description: "A daily deduction game. Play now; its optional MiniCoin economy is coming soon.",
    videoPath: "/share/coindle.mp4",
    imagePath: "/share/coindle.png",
  },
  "emonad-cabinet": {
    title: "Uppers",
    description: "Catch the falling chart and keep the bounce alive. Paired community: eMONAD.",
    videoPath: "/share/uppers.mp4",
    imagePath: "/share/uppers.png",
  },
  "skip-to-10k": {
    title: "Skip to 10K",
    description: "Skip your way to 10K. The ETH / WETH concept stays separate from play.",
    videoPath: "/share/skip-to-10k.mp4",
    imagePath: "/share/skip-to-10k.png",
  },
  "skrumpey-slide": {
    title: "Skrumpey Slide",
    description: "Slide through four worlds, rescue Skrumpeys, and grow your train before nightfall.",
    videoPath: "/share/skrumpey-slide.mp4",
    imagePath: "/share/skrumpey-slide.png",
  },
  "two-places": {
    title: "Two Places at Once",
    description: "Guide two characters through a shared puzzle platformer. Associated with the Skrumpeys community.",
    videoPath: "/share/two-places.mp4",
    imagePath: "/share/two-places.png",
  },
};

export type HeaderBag = {
  host?: string | string[];
  "x-forwarded-host"?: string | string[];
  "x-forwarded-proto"?: string | string[];
};

const SHARE_START = "<!-- share-meta:start -->";
const SHARE_END = "<!-- share-meta:end -->";

function firstHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").split(",")[0].trim();
}

function isLocalHost(host: string): boolean {
  const bare = host.replace(/:\d+$/, "");
  const name = bare.startsWith("[") ? bare.slice(1, bare.indexOf("]")) : bare;
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

function safeHost(value: string): string {
  return /^[A-Za-z0-9.:[\]-]+$/.test(value) ? value : "";
}

/** Absolute origin for the page a crawler fetched. Non-local hosts are always HTTPS. */
export function publicOrigin(headers: HeaderBag): string {
  const forwarded = safeHost(firstHeader(headers["x-forwarded-host"]));
  const host = safeHost(firstHeader(headers.host));
  const chosen = forwarded || host;
  if (!chosen) return CANONICAL_ORIGIN;
  if (isLocalHost(chosen)) {
    const proto = firstHeader(headers["x-forwarded-proto"]) === "https" ? "https" : "http";
    return `${proto}://${chosen}`;
  }
  return `https://${chosen}`;
}

/** Where /share/*.mp4 lives. Cartridge pages are a different origin, so they point here. */
export function arcadeAssetOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ARCADE_PUBLIC_ORIGIN?.trim();
  if (explicit && /^https?:\/\//.test(explicit)) return explicit.replace(/\/$/, "");
  const httpsHost = (env.ARCADE_HOST_ORIGINS ?? "").split(",").map((item) => item.trim()).find((item) => item.startsWith("https://"));
  if (httpsHost) return new URL(httpsHost).origin;
  return CANONICAL_ORIGIN;
}

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

export function cabinetId(pathname: string): string | null {
  const match = normalizePath(pathname).match(/^\/(?:games|play)\/([^/]+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function cardForPath(pathname: string, published?: { name: string; description: string } | null): ShareCard | null {
  const path = normalizePath(pathname);
  if (path === "/" || path === "/index.html") return { ...homeCard, pagePath: "/" };
  const id = cabinetId(path);
  if (!id) return null;
  const known = gameCards[id];
  if (!known && !published?.name) return null;
  return {
    title: published?.name || known!.title,
    description: published?.description || known!.description,
    videoPath: known?.videoPath ?? homeCard.videoPath,
    imagePath: known?.imagePath ?? homeCard.imagePath,
    pagePath: path,
  };
}

export function cardForCartridge(pathname: string): ShareCard | null {
  const id = pathname.split("/").filter(Boolean)[0];
  const known = id ? gameCards[id] : undefined;
  if (!known) return null;
  return { ...known, pagePath: pathname.split("?")[0] || "/" };
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function absolute(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function meta(property: string, content: string): string {
  return `<meta property="${property}" content="${esc(content)}" />`;
}

function mediaTags(image: string, video: string): string[] {
  const lines = [meta("og:image", image)];
  if (image.startsWith("https://")) lines.push(meta("og:image:secure_url", image));
  lines.push(
    meta("og:image:type", "image/png"),
    meta("og:image:width", String(SHARE_WIDTH)),
    meta("og:image:height", String(SHARE_HEIGHT)),
    meta("og:video", video),
    meta("og:video:url", video),
  );
  if (video.startsWith("https://")) lines.push(meta("og:video:secure_url", video));
  lines.push(
    meta("og:video:type", "video/mp4"),
    meta("og:video:width", String(SHARE_WIDTH)),
    meta("og:video:height", String(SHARE_HEIGHT)),
  );
  return lines;
}

export function renderShareTags(card: ShareCard, pageOrigin: string, assetOrigin = pageOrigin): string {
  const image = absolute(assetOrigin, card.imagePath);
  const video = absolute(assetOrigin, card.videoPath);
  return [
    meta("og:title", card.title),
    meta("og:description", card.description),
    meta("og:type", "video.other"),
    meta("og:url", absolute(pageOrigin, card.pagePath)),
    meta("og:site_name", "Token Arcade"),
    ...mediaTags(image, video),
  ].join("\n");
}

/** Inject or replace the arcade shell's share block, title, and description. */
export function applyShareDocument(html: string, card: ShareCard, origin: string): string {
  const block = `${SHARE_START}\n${renderShareTags(card, origin)}\n${SHARE_END}`;
  let next = html.replace(/<!-- share-meta:start -->[\s\S]*?<!-- share-meta:end -->/, block);
  if (!next.includes(SHARE_START)) {
    next = next.includes("</head>") ? next.replace("</head>", `${block}\n</head>`) : `${block}\n${next}`;
  }
  const title = esc(card.title);
  const description = esc(card.description);
  if (/<title>[\s\S]*?<\/title>/i.test(next)) next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  if (/<meta\s+name=["']description["'][^>]*>/i.test(next)) {
    next = next.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}" />`);
  }
  return next;
}

/**
 * Add video tags to a cartridge document. Existing og:title and og:description stay,
 * matching the tags already written on cabinets such as Uppers.
 */
export function applyCartridgeShare(html: string, card: ShareCard, pageOrigin: string, assetOrigin: string): string {
  if (/property=["']og:video["']/i.test(html)) return html;
  const image = absolute(assetOrigin, card.imagePath);
  const video = absolute(assetOrigin, card.videoPath);
  const hasTitle = /property=["']og:title["']/i.test(html);
  if (!hasTitle) {
    const block = renderShareTags(card, pageOrigin, assetOrigin);
    return html.includes("</head>") ? html.replace("</head>", `${block}\n</head>`) : `${block}\n${html}`;
  }
  let next = html.replace(/(<meta\b[^>]*property=["']og:type["'][^>]*content=["'])[^"']*(["'])/i, "$1video.other$2");
  const extra = [meta("og:url", absolute(pageOrigin, card.pagePath)), meta("og:site_name", "Token Arcade"), ...mediaTags(image, video)].join("\n");
  return next.includes("</head>") ? next.replace("</head>", `${extra}\n</head>`) : `${next}\n${extra}`;
}

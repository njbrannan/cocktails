export const COCKTAIL_PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

function hasFileExtension(value: string) {
  // rough but good enough for our use (e.g. ".svg", ".png", ".jpg", ".webp")
  return /\.[a-z0-9]{2,5}$/i.test(value);
}

// Photo overrides (used when no explicit `image_url` is provided, or when Supabase still points to an svg).
// For now we only enable the cocktails we have fast, optimized `.webp` assets for.
const PHOTO_OVERRIDES_BY_SLUG: Record<string, "png" | "jpg" | "webp"> = {
  daiquiri: "webp",
  "espresso-martini": "webp",
  "last-word": "webp",
  margarita: "webp",
  "moscow-mule": "webp",
  negroni: "webp",
  "old-fashioned": "webp",
  "pornstar-martini": "webp",
  "whiskey-sour": "webp",
};

export function normalizeCocktailDisplayName(name: string) {
  const raw = String(name || "").trim();
  if (!raw) return raw;

  const lower = raw.toLowerCase();
  const map: Record<string, string> = {
    daquiri: "Daiquiri",
    daiquiri: "Daiquiri",
  };
  return map[lower] ?? raw;
}

function normalizeImageSlug(slug: string) {
  const alias: Record<string, string> = {
    // "&" replacement safety (older slugs)
    "gin-tonic": "gin-and-tonic",
    // common misspelling
    daquiri: "daiquiri",
  };
  return alias[slug] ?? slug;
}

export function slugifyCocktailName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    // Common cocktail naming: "Gin & Tonic" should map to "gin-and-tonic"
    .replace(/&/g, " and ")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveCocktailImageSrc(
  imageUrl: string | null | undefined,
  recipeName: string,
) {
  const raw = String(imageUrl || "").trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/")) return raw;
    if (raw.startsWith("cocktails/")) return `/${raw}`;

    // If a filename is provided, still apply our alias rules (e.g. "daquiri.svg" -> "daiquiri.svg").
    const extMatch = raw.match(/\.([a-z0-9]{2,5})$/i);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
    const base = ext ? raw.slice(0, -ext.length) : raw;
    const slug = normalizeImageSlug(slugifyCocktailName(base));
    const preferred = PHOTO_OVERRIDES_BY_SLUG[slug];
    // If we have a photo override for this cocktail, prefer it even if the DB still points at an svg.
    if (preferred && (!ext || ext === ".svg")) return `/cocktails/${slug}.${preferred}`;
    return ext ? `/cocktails/${slug}${ext}` : `/cocktails/${slug}.svg`;
  }

  const slug = normalizeImageSlug(slugifyCocktailName(recipeName));
  if (!slug) return COCKTAIL_PLACEHOLDER_IMAGE;
  const preferred = PHOTO_OVERRIDES_BY_SLUG[slug];
  if (preferred) return `/cocktails/${slug}.${preferred}`;
  return `/cocktails/${slug}.svg`;
}

function stripQueryAndHash(src: string) {
  return src.split("#")[0]!.split("?")[0]!;
}

export function resolveNextCocktailImageSrc(src: string) {
  const raw = String(src || "").trim();
  if (!raw.startsWith("/cocktails/")) return COCKTAIL_PLACEHOLDER_IMAGE;

  const clean = stripQueryAndHash(raw);
  const suffix = raw.slice(clean.length); // includes ? or # parts

  if (clean.match(/\.webp$/i)) {
    // Prefer png as a secondary fallback (useful if a browser blocks webp for some reason).
    return clean.replace(/\.webp$/i, ".png") + suffix;
  }
  if (clean.match(/\.png$/i) || clean.match(/\.jpe?g$/i)) {
    return clean.replace(/\.(png|jpe?g)$/i, ".svg") + suffix;
  }
  if (clean.match(/\.svg$/i)) return COCKTAIL_PLACEHOLDER_IMAGE;
  return COCKTAIL_PLACEHOLDER_IMAGE;
}

// Back-compat name (used by earlier UI code paths)
export function resolveSvgFallbackForImageSrc(src: string) {
  const next = resolveNextCocktailImageSrc(src);
  // If next is a png (webp->png), take one more step to svg (we only want an svg fallback here).
  if (next.endsWith(".png")) return resolveNextCocktailImageSrc(next);
  return next;
}

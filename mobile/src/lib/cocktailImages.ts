export const COCKTAIL_PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

const PHOTO_OVERRIDES_BY_SLUG: Record<string, "png" | "jpg" | "webp"> = {
  "aperol-spritz": "webp",
  daiquiri: "webp",
  "dirty-martini": "webp",
  "espresso-martini": "webp",
  "gin-and-tonic": "webp",
  "last-word": "webp",
  margarita: "webp",
  martini: "webp",
  mojito: "webp",
  "moscow-mule": "webp",
  negroni: "webp",
  "old-fashioned": "webp",
  "pornstar-martini": "webp",
  "whiskey-sour": "webp",
};

function normalizeImageSlug(slug: string) {
  const alias: Record<string, string> = {
    "gin-tonic": "gin-and-tonic",
    daquiri: "daiquiri",
  };
  return alias[slug] ?? slug;
}

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

export function slugifyCocktailName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
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

    const extMatch = raw.match(/\.([a-z0-9]{2,5})$/i);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
    const base = ext ? raw.slice(0, -ext.length) : raw;
    const slug = normalizeImageSlug(slugifyCocktailName(base));
    const preferred = PHOTO_OVERRIDES_BY_SLUG[slug];
    if (preferred && (!ext || ext === ".svg")) return `/cocktails/${slug}.${preferred}`;
    return ext ? `/cocktails/${slug}${ext}` : `/cocktails/${slug}.svg`;
  }

  const slug = normalizeImageSlug(slugifyCocktailName(recipeName));
  if (!slug) return COCKTAIL_PLACEHOLDER_IMAGE;
  const preferred = PHOTO_OVERRIDES_BY_SLUG[slug];
  if (preferred) return `/cocktails/${slug}.${preferred}`;
  return `/cocktails/${slug}.svg`;
}


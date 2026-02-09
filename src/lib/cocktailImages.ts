export const COCKTAIL_PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

function hasFileExtension(value: string) {
  // rough but good enough for our use (e.g. ".svg", ".png", ".jpg", ".webp")
  return /\.[a-z0-9]{2,5}$/i.test(value);
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
    return ext ? `/cocktails/${slug}${ext}` : `/cocktails/${slug}.svg`;
  }

  const slug = normalizeImageSlug(slugifyCocktailName(recipeName));
  if (!slug) return COCKTAIL_PLACEHOLDER_IMAGE;
  return `/cocktails/${slug}.svg`;
}

export const COCKTAIL_PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

function hasFileExtension(value: string) {
  // rough but good enough for our use (e.g. ".svg", ".png", ".jpg", ".webp")
  return /\.[a-z0-9]{2,5}$/i.test(value);
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
    return hasFileExtension(raw) ? `/cocktails/${raw}` : `/cocktails/${raw}.svg`;
  }

  const slug = slugifyCocktailName(recipeName);
  if (!slug) return COCKTAIL_PLACEHOLDER_IMAGE;

  // A few friendly aliases to reduce "question mark" images caused by
  // common variations/misspellings in recipe names.
  const alias: Record<string, string> = {
    // "&" replacement safety (older slugs)
    "gin-tonic": "gin-and-tonic",
    // common misspelling
    daquiri: "daiquiri",
  };

  const finalSlug = alias[slug] ?? slug;
  return `/cocktails/${finalSlug}.svg`;
}

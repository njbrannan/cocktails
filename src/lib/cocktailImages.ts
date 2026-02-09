export const COCKTAIL_PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

function hasFileExtension(value: string) {
  // rough but good enough for our use (e.g. ".svg", ".png", ".jpg", ".webp")
  return /\.[a-z0-9]{2,5}$/i.test(value);
}

export function slugifyCocktailName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
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
  return `/cocktails/${slug}.svg`;
}


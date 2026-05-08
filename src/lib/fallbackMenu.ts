type IngredientType =
  | "liquor"
  | "mixer"
  | "juice"
  | "syrup"
  | "garnish"
  | "ice"
  | "glassware"
  | "bar";

type FallbackIngredient = {
  id: string;
  name: string;
  type: IngredientType;
  bottle_size_ml: number | null;
  unit: string | null;
  purchase_url?: string | null;
  price?: number | null;
  ingredient_packs?: any[];
};

const ingredient = (
  id: string,
  name: string,
  type: IngredientType,
  unit = "ml",
  bottleSize: number | null = type === "liquor" ? 700 : null,
): FallbackIngredient => ({
  id,
  name,
  type,
  unit,
  bottle_size_ml: bottleSize,
  purchase_url: null,
  price: null,
  ingredient_packs: [],
});

const i = {
  vodka: ingredient("fallback-vodka", "Vodka", "liquor"),
  gin: ingredient("fallback-gin", "Gin", "liquor"),
  tequila: ingredient("fallback-tequila", "Tequila Blanco", "liquor"),
  tripleSec: ingredient("fallback-triple-sec", "Triple Sec", "liquor"),
  rum: ingredient("fallback-rum", "Rum", "liquor"),
  bourbon: ingredient("fallback-bourbon", "Bourbon", "liquor"),
  whiskey: ingredient("fallback-whiskey", "Whiskey", "liquor"),
  aperol: ingredient("fallback-aperol", "Aperol", "liquor"),
  prosecco: ingredient("fallback-prosecco", "Prosecco", "liquor", "ml", 750),
  campari: ingredient("fallback-campari", "Campari", "liquor"),
  vermouthSweet: ingredient("fallback-sweet-vermouth", "Sweet Vermouth", "liquor"),
  vermouthDry: ingredient("fallback-dry-vermouth", "Dry Vermouth", "liquor"),
  coffeeLiqueur: ingredient("fallback-coffee-liqueur", "Coffee Liqueur", "liquor"),
  maraschino: ingredient("fallback-maraschino", "Maraschino Liqueur", "liquor"),
  greenChartreuse: ingredient("fallback-green-chartreuse", "Green Chartreuse", "liquor"),
  lime: ingredient("fallback-lime-juice", "Lime Juice", "juice"),
  lemon: ingredient("fallback-lemon-juice", "Lemon Juice", "juice"),
  sugar: ingredient("fallback-simple-syrup", "Simple Syrup", "syrup"),
  agave: ingredient("fallback-agave", "Agave Syrup", "syrup"),
  gingerBeer: ingredient("fallback-ginger-beer", "Ginger Beer", "mixer"),
  soda: ingredient("fallback-soda", "Soda Water", "mixer"),
  tonic: ingredient("fallback-tonic", "Tonic Water", "mixer"),
  coffee: ingredient("fallback-espresso", "Espresso", "mixer"),
  passionfruit: ingredient("fallback-passionfruit", "Passionfruit", "juice"),
  mint: ingredient("fallback-mint", "Mint Leaves", "garnish", "g", null),
  limes: ingredient("fallback-limes", "Limes", "garnish", "pcs", 1),
  oranges: ingredient("fallback-oranges", "Oranges", "garnish", "pcs", 1),
  olives: ingredient("fallback-olives", "Olives", "garnish", "pcs", 1),
  glass: ingredient("fallback-glassware", "Cocktail Glassware", "glassware", "pcs", 24),
  ice: ingredient("fallback-ice", "Ice", "ice", "g", 5000),
};

const recipe = (
  id: string,
  name: string,
  description: string,
  imageUrl: string,
  ingredients: Array<[FallbackIngredient, number]>,
) => ({
  id,
  name,
  description,
  image_url: imageUrl,
  recipe_packs: [],
  recipe_ingredients: [
    ...ingredients.map(([ing, amount]) => ({
      ml_per_serving: amount,
      ingredients: ing,
    })),
    { ml_per_serving: 1, ingredients: i.glass },
    { ml_per_serving: 180, ingredients: i.ice },
  ],
});

export const fallbackRecipes = [
  recipe("fallback-aperol-spritz", "Aperol Spritz", "Bright, bittersweet and sparkling with orange.", "/cocktails/aperol-spritz.webp", [
    [i.aperol, 60],
    [i.prosecco, 90],
    [i.soda, 30],
    [i.oranges, 0.25],
  ]),
  recipe("fallback-daiquiri", "Daiquiri", "Clean rum, fresh lime and sugar, shaken crisp.", "/cocktails/daiquiri.webp", [
    [i.rum, 60],
    [i.lime, 30],
    [i.sugar, 20],
    [i.limes, 0.25],
  ]),
  recipe("fallback-dirty-martini", "Dirty Martini", "A savoury martini with olive brine and a clean finish.", "/cocktails/dirty-martini.webp", [
    [i.gin, 60],
    [i.vermouthDry, 10],
    [i.olives, 2],
  ]),
  recipe("fallback-espresso-martini", "Espresso Martini", "Vodka, coffee liqueur and espresso with a silky crema.", "/cocktails/espresso-martini.webp", [
    [i.vodka, 45],
    [i.coffeeLiqueur, 25],
    [i.coffee, 30],
    [i.sugar, 10],
  ]),
  recipe("fallback-gin-and-tonic", "Gin and Tonic", "A crisp highball with gin, tonic and fresh citrus.", "/cocktails/gin-and-tonic.webp", [
    [i.gin, 45],
    [i.tonic, 120],
    [i.limes, 0.25],
  ]),
  recipe("fallback-last-word", "Last Word", "Equal parts gin, green herbal liqueur, maraschino and lime.", "/cocktails/last-word.webp", [
    [i.gin, 25],
    [i.greenChartreuse, 25],
    [i.maraschino, 25],
    [i.lime, 25],
  ]),
  recipe("fallback-manhattan", "Manhattan", "Whiskey, sweet vermouth and bitters-style depth.", "/cocktails/manhattan.svg", [
    [i.whiskey, 60],
    [i.vermouthSweet, 30],
    [i.oranges, 0.2],
  ]),
  recipe("fallback-margarita", "Margarita", "Tequila, lime and orange liqueur with a sharp citrus finish.", "/cocktails/margarita.webp", [
    [i.tequila, 50],
    [i.tripleSec, 20],
    [i.lime, 25],
    [i.sugar, 10],
    [i.limes, 0.25],
  ]),
  recipe("fallback-martini", "Martini", "A classic dry gin martini with a clean citrus lift.", "/cocktails/martini.webp", [
    [i.gin, 60],
    [i.vermouthDry, 10],
    [i.limes, 0.2],
  ]),
  recipe("fallback-mojito", "Mojito", "Rum, lime, mint and soda served long and refreshing.", "/cocktails/mojito.webp", [
    [i.rum, 50],
    [i.lime, 30],
    [i.sugar, 20],
    [i.soda, 90],
    [i.mint, 3],
    [i.limes, 0.25],
  ]),
  recipe("fallback-moscow-mule", "Moscow Mule", "Vodka, lime and ginger beer over ice.", "/cocktails/moscow-mule.webp", [
    [i.vodka, 45],
    [i.lime, 20],
    [i.gingerBeer, 120],
    [i.limes, 0.25],
  ]),
  recipe("fallback-negroni", "Negroni", "Gin, Campari and sweet vermouth with orange.", "/cocktails/negroni.webp", [
    [i.gin, 30],
    [i.campari, 30],
    [i.vermouthSweet, 30],
    [i.oranges, 0.25],
  ]),
  recipe("fallback-old-fashioned", "Old Fashioned", "Bourbon, sugar and orange in a short rocks glass.", "/cocktails/old-fashioned.webp", [
    [i.bourbon, 60],
    [i.sugar, 10],
    [i.oranges, 0.25],
  ]),
  recipe("fallback-pornstar-martini", "Pornstar Martini", "Vanilla-style vodka, passionfruit and a sparkling sidecar.", "/cocktails/pornstar-martini.webp", [
    [i.vodka, 45],
    [i.passionfruit, 45],
    [i.lime, 15],
    [i.prosecco, 45],
  ]),
  recipe("fallback-tommys-margarita", "Tommy's Margarita", "Tequila, lime and agave served fresh over ice.", "/cocktails/tommys-margarita.webp", [
    [i.tequila, 60],
    [i.lime, 30],
    [i.agave, 15],
    [i.limes, 0.25],
  ]),
  recipe("fallback-whiskey-sour", "Whiskey Sour", "Whiskey, lemon and sugar with a bright sour finish.", "/cocktails/whiskey-sour.webp", [
    [i.whiskey, 60],
    [i.lemon, 30],
    [i.sugar, 20],
    [i.oranges, 0.2],
  ]),
] as const;

export function filterFallbackRecipes(ids: string[]) {
  if (!ids.length) return fallbackRecipes;
  const wanted = new Set(ids);
  return fallbackRecipes.filter((recipe) => wanted.has(recipe.id));
}

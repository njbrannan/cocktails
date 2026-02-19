export type IngredientType =
  | "liquor"
  | "mixer"
  | "juice"
  | "syrup"
  | "garnish"
  | "ice"
  | "glassware";

export type Ingredient = {
  id: string;
  name: string;
  type: IngredientType;
  bottle_size_ml: number | null;
  unit: string | null;
  price?: number | null;
  ingredient_packs?: Array<{
    pack_size: number;
    pack_price: number;
    is_active: boolean;
    purchase_url?: string | null;
    tier?: "budget" | "premium" | null;
  }> | null;
};

export type RecipeIngredient = {
  ml_per_serving: number;
  ingredients: Ingredient | Ingredient[] | null;
};

export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  image_url?: string | null;
  recipe_ingredients: RecipeIngredient[];
};

export type RecipesPayload = { recipes: Recipe[] };

export type IngredientType = "liquor" | "mixer" | "juice" | "syrup" | "garnish";

export type IngredientTotal = {
  ingredientId: string;
  name: string;
  type: IngredientType;
  totalMl: number;
  bottleSizeMl?: number;
  bottlesNeeded?: number;
};

const BUFFER_RATE = 0.1;
const DEFAULT_BOTTLE_SIZE = 700;

export function applyBuffer(totalMl: number) {
  return Math.ceil(totalMl * (1 + BUFFER_RATE));
}

export function calculateBottleCount(totalMl: number, bottleSize = DEFAULT_BOTTLE_SIZE) {
  return Math.ceil(totalMl / bottleSize);
}

export function buildIngredientTotals(
  items: Array<{
    ingredientId: string;
    name: string;
    type: IngredientType;
    mlPerServing: number;
    servings: number;
    bottleSizeMl?: number | null;
  }>,
) {
  const totals = new Map<string, IngredientTotal>();

  for (const item of items) {
    const previous = totals.get(item.ingredientId);
    const added = item.mlPerServing * item.servings;

    const base: IngredientTotal = previous ?? {
      ingredientId: item.ingredientId,
      name: item.name,
      type: item.type,
      totalMl: 0,
    };

    base.totalMl += added;
    if (item.type === "liquor") {
      base.bottleSizeMl = item.bottleSizeMl ?? DEFAULT_BOTTLE_SIZE;
    }

    totals.set(item.ingredientId, base);
  }

  return Array.from(totals.values()).map((total) => {
    const buffered = applyBuffer(total.totalMl);
    if (total.type === "liquor") {
      const bottleSize = total.bottleSizeMl ?? DEFAULT_BOTTLE_SIZE;
      return {
        ...total,
        totalMl: buffered,
        bottleSizeMl: bottleSize,
        bottlesNeeded: calculateBottleCount(buffered, bottleSize),
      };
    }

    return {
      ...total,
      totalMl: buffered,
    };
  });
}

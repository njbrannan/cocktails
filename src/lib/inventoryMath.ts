export type IngredientType =
  | "liquor"
  | "mixer"
  | "juice"
  | "syrup"
  | "garnish"
  | "ice"
  | "glassware";

export type IngredientTotal = {
  ingredientId: string;
  name: string;
  type: IngredientType;
  total: number;
  unit: string;
  bottleSizeMl?: number;
  bottlesNeeded?: number;
};

const BUFFER_RATE = 0.1;
const DEFAULT_BOTTLE_SIZE = 700;

export function applyBuffer(amount: number) {
  return amount * (1 + BUFFER_RATE);
}

export function calculateBottleCount(totalMl: number, bottleSize = DEFAULT_BOTTLE_SIZE) {
  return Math.ceil(totalMl / bottleSize);
}

function roundUpToIncrement(value: number, increment: number) {
  if (increment <= 0) return Math.ceil(value);
  return Math.ceil(value / increment) * increment;
}

function normalizeUnit(unit: string | null | undefined) {
  return (unit || "ml").trim().toLowerCase();
}

function roundByUnitAndType(amountWithBuffer: number, unit: string, type: IngredientType) {
  const u = normalizeUnit(unit);

  // Fruit pieces, etc.
  if (u === "pc" || u === "pcs" || u === "piece" || u === "pieces") {
    return Math.ceil(amountWithBuffer);
  }

  // Herbs like mint: round up to nearest 15g.
  if ((u === "g" || u === "gram" || u === "grams") && type === "garnish") {
    return roundUpToIncrement(amountWithBuffer, 15);
  }

  // Default: keep it whole-numbered.
  return Math.ceil(amountWithBuffer);
}

export function buildIngredientTotals(
  items: Array<{
    ingredientId: string;
    name: string;
    type: IngredientType;
    amountPerServing: number;
    servings: number;
    unit?: string | null;
    bottleSizeMl?: number | null;
  }>,
) {
  const totals = new Map<string, IngredientTotal>();

  for (const item of items) {
    const previous = totals.get(item.ingredientId);
    const added = item.amountPerServing * item.servings;

    const base: IngredientTotal = previous ?? {
      ingredientId: item.ingredientId,
      name: item.name,
      type: item.type,
      total: 0,
      unit: normalizeUnit(item.unit),
    };

    base.total += added;
    if (item.type === "liquor") {
      base.bottleSizeMl = item.bottleSizeMl ?? DEFAULT_BOTTLE_SIZE;
    }

    totals.set(item.ingredientId, base);
  }

  return Array.from(totals.values()).map((total) => {
    const buffered = applyBuffer(total.total);
    const rounded = roundByUnitAndType(buffered, total.unit, total.type);
    if (total.type === "liquor") {
      const bottleSize = total.bottleSizeMl ?? DEFAULT_BOTTLE_SIZE;
      return {
        ...total,
        unit: "ml",
        total: Math.ceil(buffered),
        bottleSizeMl: bottleSize,
        bottlesNeeded: calculateBottleCount(Math.ceil(buffered), bottleSize),
      };
    }

    return {
      ...total,
      total: rounded,
    };
  });
}

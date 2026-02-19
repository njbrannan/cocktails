export type IngredientType =
  | "liquor"
  | "mixer"
  | "juice"
  | "syrup"
  | "garnish"
  | "ice"
  | "glassware";

export type PackOption = {
  packSize: number;
  packPrice: number;
  purchaseUrl?: string | null;
  tier?: "budget" | "premium" | null;
};

export type PackPlanLine = {
  packSize: number;
  count: number;
  purchaseUrl?: string;
};

export type IngredientTotal = {
  ingredientId: string;
  name: string;
  type: IngredientType;
  total: number;
  unit: string;
  bottleSizeMl?: number;
  bottlesNeeded?: number;
  packPlan?: PackPlanLine[];
  purchaseUrl?: string;
  price?: number;
  totalCost?: number;
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

function normalizePackOptions(
  options: Array<PackOption | null | undefined> | null | undefined,
): PackOption[] {
  if (!options?.length) return [];
  const out: PackOption[] = [];
  for (const opt of options) {
    if (!opt) continue;
    const size = Number(opt.packSize);
    const price = Number(opt.packPrice);
    if (!Number.isFinite(size) || size <= 0) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    out.push({
      packSize: size,
      packPrice: price,
      purchaseUrl: opt.purchaseUrl || null,
      tier: (opt.tier as any) || null,
    });
  }

  // If there are multiple entries for the same pack size (within the same tier),
  // keep the cheapest. If tied, prefer one that has a purchase URL.
  const bestByKey = new Map<string, PackOption>();
  for (const opt of out) {
    const key = `${opt.tier || ""}:${opt.packSize}`;
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, opt);
      continue;
    }
    if (opt.packPrice < prev.packPrice) {
      bestByKey.set(key, opt);
      continue;
    }
    if (opt.packPrice > prev.packPrice) continue;
    if (!prev.purchaseUrl && opt.purchaseUrl) {
      bestByKey.set(key, opt);
    }
  }

  return Array.from(bestByKey.values());
}

function cheapestPackPlan(
  requiredAmount: number,
  packOptions: PackOption[],
  preferredPackSize = 700,
): { plan: PackPlanLine[]; totalCost: number; coveredAmount: number } | null {
  const required = Math.max(0, Math.ceil(requiredAmount));
  const packs = normalizePackOptions(packOptions);
  if (required <= 0 || packs.length === 0) return null;

  const maxPackSize = Math.max(...packs.map((p) => p.packSize));
  const maxAmount = required + maxPackSize * 2;

  const INF = Number.POSITIVE_INFINITY;
  const dpCost = new Array<number>(maxAmount + 1).fill(INF);
  const dpPrev = new Array<number>(maxAmount + 1).fill(-1);
  const dpPackIdx = new Array<number>(maxAmount + 1).fill(-1);
  dpCost[0] = 0;

  for (let amount = 1; amount <= maxAmount; amount++) {
    for (let i = 0; i < packs.length; i++) {
      const size = packs[i]!.packSize;
      const prev = amount - size;
      if (prev < 0) continue;
      const prevCost = dpCost[prev]!;
      if (!Number.isFinite(prevCost)) continue;
      const nextCost = prevCost + packs[i]!.packPrice;
      if (nextCost < dpCost[amount]!) {
        dpCost[amount] = nextCost;
        dpPrev[amount] = prev;
        dpPackIdx[amount] = i;
      }
    }
  }

  const backtrack = (amount: number) => {
    const counts = new Map<number, number>();
    const purchaseUrlBySize = new Map<number, string | undefined>();
    let a = amount;
    let guard = 0;
    while (a > 0 && guard++ < 10000) {
      const idx = dpPackIdx[a]!;
      const prev = dpPrev[a]!;
      if (idx < 0 || prev < 0) break;
      const size = packs[idx]!.packSize;
      counts.set(size, (counts.get(size) || 0) + 1);
      if (!purchaseUrlBySize.has(size)) {
        purchaseUrlBySize.set(size, packs[idx]!.purchaseUrl || undefined);
      }
      a = prev;
    }
    const plan: PackPlanLine[] = Array.from(counts.entries())
      .map(([packSize, count]) => ({
        packSize,
        count,
        purchaseUrl: purchaseUrlBySize.get(packSize),
      }))
      .sort((a, b) => b.packSize - a.packSize);
    const preferredCount = plan.find((p) => p.packSize === preferredPackSize)?.count || 0;
    const totalPacks = plan.reduce((s, p) => s + p.count, 0);
    return { plan, preferredCount, totalPacks };
  };

  let best:
    | {
        amount: number;
        cost: number;
        plan: PackPlanLine[];
        preferredCount: number;
        totalPacks: number;
      }
    | null = null;

  for (let amount = required; amount <= maxAmount; amount++) {
    const cost = dpCost[amount]!;
    if (!Number.isFinite(cost)) continue;
    const { plan, preferredCount, totalPacks } = backtrack(amount);
    if (plan.length === 0) continue;

    if (!best || cost < best.cost) {
      best = { amount, cost, plan, preferredCount, totalPacks };
      continue;
    }
    if (cost > best.cost) continue;

    // Tie: prefer more 700ml packs if cost is the same.
    if (preferredCount > best.preferredCount) {
      best = { amount, cost, plan, preferredCount, totalPacks };
      continue;
    }
    if (preferredCount < best.preferredCount) continue;

    // Then prefer less waste.
    if (amount < best.amount) {
      best = { amount, cost, plan, preferredCount, totalPacks };
      continue;
    }
    if (amount > best.amount) continue;

    // Then fewer packs.
    if (totalPacks < best.totalPacks) {
      best = { amount, cost, plan, preferredCount, totalPacks };
    }
  }

  if (!best) return null;
  return { plan: best.plan, totalCost: best.cost, coveredAmount: best.amount };
}

function roundByUnitAndType(amountWithBuffer: number, unit: string, type: IngredientType) {
  const u = normalizeUnit(unit);

  // Glassware is typically ordered by the dozen, with a sensible minimum.
  if (type === "glassware") {
    return Math.max(24, roundUpToIncrement(amountWithBuffer, 12));
  }

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
    purchaseUrl?: string | null;
    price?: number | null;
    packOptions?: Array<PackOption> | null;
  }>,
) {
  const totals = new Map<string, IngredientTotal>();
  const packOptionsByIngredientId = new Map<string, PackOption[]>();

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
    base.purchaseUrl = base.purchaseUrl || (item.purchaseUrl || undefined);
    if (item.price != null && Number.isFinite(item.price)) {
      base.price = base.price ?? item.price;
    }
    // bottleSizeMl is treated as a generic "pack size" in the ingredient's unit (e.g. 700 ml, 1000 g, 1 pc).
    if (item.bottleSizeMl != null) {
      base.bottleSizeMl = item.bottleSizeMl;
    } else if (item.type === "liquor" && base.bottleSizeMl == null) {
      base.bottleSizeMl = DEFAULT_BOTTLE_SIZE;
    }

    totals.set(item.ingredientId, base);

    if (item.packOptions?.length) {
      const prev = packOptionsByIngredientId.get(item.ingredientId) ?? [];
      packOptionsByIngredientId.set(item.ingredientId, [
        ...prev,
        ...normalizePackOptions(item.packOptions),
      ]);
    }
  }

  return Array.from(totals.values()).map((total) => {
    const buffered = applyBuffer(total.total);
    const rounded = roundByUnitAndType(buffered, total.unit, total.type);

    const dynamicPackOptions = packOptionsByIngredientId.get(total.ingredientId) ?? [];

    const packSize = total.bottleSizeMl ?? null;
    const packsNeeded =
      packSize && packSize > 0 ? Math.ceil(rounded / packSize) : undefined;
    const totalCost =
      total.price != null
        ? packsNeeded != null
          ? packsNeeded * total.price
          : rounded * total.price
        : undefined;

    if (total.type === "liquor") {
      const bottleSize = total.bottleSizeMl ?? DEFAULT_BOTTLE_SIZE;
      const mlTotal = Math.ceil(buffered);

      const plan =
        dynamicPackOptions.length > 0
          ? cheapestPackPlan(mlTotal, dynamicPackOptions, 700)
          : null;

      if (plan) {
        const single = plan.plan.length === 1 ? plan.plan[0] : null;
        return {
          ...total,
          unit: "ml",
          total: mlTotal,
          bottleSizeMl: single?.packSize ?? total.bottleSizeMl ?? bottleSize,
          bottlesNeeded: single?.count,
          packPlan: plan.plan,
          totalCost: plan.totalCost,
        };
      }

      return {
        ...total,
        unit: "ml",
        total: mlTotal,
        bottleSizeMl: bottleSize,
        bottlesNeeded: calculateBottleCount(mlTotal, bottleSize),
        totalCost:
          total.price != null
            ? calculateBottleCount(mlTotal, bottleSize) * total.price
            : undefined,
      };
    }

    const nonLiquorPlan =
      dynamicPackOptions.length > 0
        ? cheapestPackPlan(rounded, dynamicPackOptions, 700)
        : null;

    if (nonLiquorPlan) {
      const single = nonLiquorPlan.plan.length === 1 ? nonLiquorPlan.plan[0] : null;
      return {
        ...total,
        total: rounded,
        bottleSizeMl: single?.packSize ?? total.bottleSizeMl ?? undefined,
        bottlesNeeded: single?.count,
        packPlan: nonLiquorPlan.plan,
        totalCost: nonLiquorPlan.totalCost,
      };
    }

    return {
      ...total,
      total: rounded,
      bottlesNeeded: packsNeeded,
      totalCost,
    };
  });
}

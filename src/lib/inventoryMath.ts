export type IngredientType =
  | "liquor"
  | "mixer"
  | "juice"
  | "syrup"
  | "garnish"
  | "ice"
  | "glassware"
  | "bar";

export type PackOption = {
  packSize: number;
  packPrice: number;
  purchaseUrl?: string | null;
  searchUrl?: string | null;
  searchQuery?: string | null;
  variantSku?: string | null;
  retailer?: "danmurphys" | "woolworths" | "getinvolved" | null;
  tier?: "economy" | "business" | "first_class" | null;
};

export type PackPlanLine = {
  packSize: number;
  count: number;
  purchaseUrl?: string;
  searchUrl?: string;
  variantSku?: string;
  retailer?: "danmurphys" | "woolworths" | "getinvolved";
};

export type IngredientTotal = {
  ingredientId: string;
  name: string;
  type: IngredientType;
  total: number;
  // For some items (notably glassware), we round totals up to practical order quantities.
  // `exactTotal` captures the buffered-but-unrounded amount so we can display both.
  exactTotal?: number;
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
      searchUrl: opt.searchUrl || null,
      searchQuery: opt.searchQuery || null,
      variantSku: opt.variantSku || null,
      retailer: (opt.retailer as any) || null,
      tier: (opt.tier as any) || null,
    });
  }

  // If there are multiple entries for the same pack size (within the same tier),
  // keep the cheapest. If tied, prefer one that has a purchase URL.
  const bestByKey = new Map<string, PackOption>();
  for (const opt of out) {
    const key = `${opt.tier || ""}:${opt.retailer || ""}:${opt.packSize}`;
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
      continue;
    }
    if (!prev.searchUrl && opt.searchUrl) {
      bestByKey.set(key, opt);
      continue;
    }
    if (!prev.variantSku && opt.variantSku) {
      bestByKey.set(key, opt);
    }
  }

  return Array.from(bestByKey.values());
}

function cheapestPackPlan(
  requiredAmount: number,
  packOptions: PackOption[],
  preferredPackSize?: number | null,
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
    const searchUrlBySize = new Map<number, string | undefined>();
    const variantSkuBySize = new Map<number, string | undefined>();
    const retailerBySize = new Map<number, PackOption["retailer"]>();
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
      if (!searchUrlBySize.has(size)) {
        searchUrlBySize.set(size, packs[idx]!.searchUrl || undefined);
      }
      if (!variantSkuBySize.has(size)) {
        variantSkuBySize.set(size, packs[idx]!.variantSku || undefined);
      }
      if (!retailerBySize.has(size)) {
        retailerBySize.set(size, packs[idx]!.retailer || null);
      }
      a = prev;
    }
    const plan: PackPlanLine[] = Array.from(counts.entries())
      .map(([packSize, count]) => ({
        packSize,
        count,
        purchaseUrl: purchaseUrlBySize.get(packSize),
        searchUrl: searchUrlBySize.get(packSize),
        variantSku: variantSkuBySize.get(packSize),
        retailer: retailerBySize.get(packSize) || undefined,
      }))
      .sort((a, b) => b.packSize - a.packSize);
    const preferredCount =
      preferredPackSize && preferredPackSize > 0
        ? plan.find((p) => p.packSize === preferredPackSize)?.count || 0
        : 0;
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

    // Tie: optionally prefer a specific pack size (e.g. 700ml liquor bottles).
    if (preferredPackSize && preferredPackSize > 0) {
      if (preferredCount > best.preferredCount) {
        best = { amount, cost, plan, preferredCount, totalPacks };
        continue;
      }
      if (preferredCount < best.preferredCount) continue;
    }

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

export function buildCheapestPackPlan(
  requiredAmount: number,
  packOptions: PackOption[],
  preferredPackSize?: number | null,
) {
  return cheapestPackPlan(requiredAmount, packOptions, preferredPackSize);
}

function glasswarePackPlan(
  requiredAmount: number,
  packOptions: PackOption[],
): { plan: PackPlanLine[]; totalCost: number; coveredAmount: number } | null {
  const required = Math.max(0, Math.ceil(requiredAmount));
  const packs = normalizePackOptions(packOptions);
  if (required <= 0 || packs.length === 0) return null;

  // For glassware, prioritize simplicity: if an exact-size pack exists, prefer it
  // even if a split pack combination would be slightly cheaper.
  const candidates = packs
    .filter((p) => p.packSize > 0)
    .map((p) => {
      const count = Math.ceil(required / p.packSize);
      const covered = count * p.packSize;
      return {
        plan: [
          {
            packSize: p.packSize,
            count,
            purchaseUrl: p.purchaseUrl || undefined,
            searchUrl: p.searchUrl || undefined,
            variantSku: p.variantSku || undefined,
            retailer: p.retailer || undefined,
          },
        ],
        totalCost: count * p.packPrice,
        coveredAmount: covered,
        waste: covered - required,
        totalPacks: count,
      };
    });

  candidates.sort((a, b) => {
    // 1) Less waste first (exact match wins)
    if (a.waste !== b.waste) return a.waste - b.waste;
    // 2) Fewer packs next (prefer 1 × 72 over 2 × 36 when both match exactly)
    if (a.totalPacks !== b.totalPacks) return a.totalPacks - b.totalPacks;
    // 3) Then cheaper cost
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
    // 4) Then prefer larger pack size (simpler)
    return b.plan[0]!.packSize - a.plan[0]!.packSize;
  });

  return candidates[0] ?? null;
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
    // Not every line should get a buffer. For example, mobile bars are equipment:
    // we want the exact recommended count, not +10% rounded up.
    const buffered = total.type === "bar" ? total.total : applyBuffer(total.total);
    const exactTotal = Math.ceil(buffered);
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
        ? total.type === "glassware"
          ? glasswarePackPlan(rounded, dynamicPackOptions)
          : cheapestPackPlan(rounded, dynamicPackOptions, 700)
        : null;

    if (nonLiquorPlan) {
      const single = nonLiquorPlan.plan.length === 1 ? nonLiquorPlan.plan[0] : null;
      return {
        ...total,
        exactTotal: total.type === "glassware" ? exactTotal : undefined,
        total: rounded,
        bottleSizeMl: single?.packSize ?? total.bottleSizeMl ?? undefined,
        bottlesNeeded: single?.count,
        packPlan: nonLiquorPlan.plan,
        totalCost: nonLiquorPlan.totalCost,
      };
    }

    return {
      ...total,
      exactTotal: total.type === "glassware" ? exactTotal : undefined,
      total: rounded,
      bottlesNeeded: packsNeeded,
      totalCost,
    };
  });
}

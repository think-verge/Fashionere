export interface CostInput {
  category: string;
  quantity: number;
  fabricType: string;
  complexity: "simple" | "moderate" | "complex";
  market: "budget" | "mid" | "premium" | "luxury";
}

export interface CostEstimate {
  fabricCostPerUnit: number;
  laborCostPerUnit: number;
  overheadPerUnit: number;
  totalPerUnit: number;
  totalForQuantity: number;
  currency: string;
  breakdown: {
    fabric: number;
    labor: number;
    overhead: number;
    packaging: number;
  };
}

const BASE_COSTS: Record<string, number> = {
  dresses: 15,
  denim: 12,
  "t-shirts": 5,
  swimwear: 10,
  default: 8,
};

const MARKET_MULTIPLIER: Record<string, number> = {
  budget: 1,
  mid: 1.5,
  premium: 2.5,
  luxury: 5,
};

const COMPLEXITY_MULTIPLIER: Record<string, number> = {
  simple: 1,
  moderate: 1.4,
  complex: 2,
};

export function estimateCost(input: CostInput): CostEstimate {
  const base = BASE_COSTS[input.category] ?? BASE_COSTS.default;
  const marketMul = MARKET_MULTIPLIER[input.market];
  const complexityMul = COMPLEXITY_MULTIPLIER[input.complexity];

  const fabricCostPerUnit = base * marketMul * 0.4;
  const laborCostPerUnit = base * complexityMul * marketMul * 0.35;
  const overheadPerUnit = base * marketMul * 0.15;
  const packagingPerUnit = base * marketMul * 0.1;
  const totalPerUnit = fabricCostPerUnit + laborCostPerUnit + overheadPerUnit + packagingPerUnit;

  return {
    fabricCostPerUnit: round(fabricCostPerUnit),
    laborCostPerUnit: round(laborCostPerUnit),
    overheadPerUnit: round(overheadPerUnit),
    totalPerUnit: round(totalPerUnit),
    totalForQuantity: round(totalPerUnit * input.quantity),
    currency: "USD",
    breakdown: {
      fabric: round(fabricCostPerUnit),
      labor: round(laborCostPerUnit),
      overhead: round(overheadPerUnit),
      packaging: round(packagingPerUnit),
    },
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

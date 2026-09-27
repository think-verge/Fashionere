import type { ICoherence, IComboRef } from "../models/GenerationJob.js";

const FABRIC_FAMILIES: Record<string, string[]> = {
  knit:     ["knit", "cable knit", "jersey", "rib knit", "bouclé", "terry", "fleece", "sweater knit"],
  woven:    ["twill", "canvas", "denim", "poplin", "broadcloth", "chambray", "gabardine", "chino", "wool", "wool blend", "cashmere", "flannel", "felt", "tweed", "linen", "cotton", "silk"],
  jacquard: ["jacquard", "brocade", "damask", "tapestry"],
  leather:  ["leather", "faux leather", "suede", "nubuck"],
  sheer:    ["chiffon", "organza", "tulle", "mesh", "lace", "voile"],
  satin:    ["satin", "charmeuse", "silk satin", "duchess satin"],
  technical: ["nylon", "ripstop", "gore-tex", "neoprene", "scuba", "performance", "polyester"],
};

function classifyFabric(fabricLabel: string): string {
  const lower = fabricLabel.toLowerCase();
  for (const [family, keywords] of Object.entries(FABRIC_FAMILIES)) {
    if (keywords.some((kw) => lower.includes(kw))) return family;
  }
  return "unknown";
}

interface GarmentRule {
  compatible_families: string[];
  requires_structure: boolean;
  defining_features: string;
}

const GARMENT_RULES: Record<string, GarmentRule> = {
  cardigan: {
    compatible_families: ["knit"],
    requires_structure: false,
    defining_features: "ribbed edges, button band stretch, knit drape, crew/V-neckline",
  },
  sweater: {
    compatible_families: ["knit"],
    requires_structure: false,
    defining_features: "knit construction, stretch body, ribbed cuffs and hem",
  },
  pullover: {
    compatible_families: ["knit"],
    requires_structure: false,
    defining_features: "overhead knit, no front opening, stretch body",
  },
  hoodie: {
    compatible_families: ["knit", "technical"],
    requires_structure: false,
    defining_features: "hood, kangaroo pocket, knit or fleece body",
  },
  t_shirt: {
    compatible_families: ["knit"],
    requires_structure: false,
    defining_features: "jersey knit, crew or V neck, no structure",
  },
  polo: {
    compatible_families: ["knit"],
    requires_structure: false,
    defining_features: "piqué knit, collar, button placket",
  },
  blazer: {
    compatible_families: ["woven", "jacquard", "knit", "leather"],
    requires_structure: true,
    defining_features: "structured lapels, button front, lined body, tailored shoulders",
  },
  jacket: {
    compatible_families: ["woven", "jacquard", "leather", "technical", "knit"],
    requires_structure: true,
    defining_features: "outerwear, collar, front closure, structured or semi-structured",
  },
  utility_jacket: {
    compatible_families: ["woven", "jacquard", "technical", "leather"],
    requires_structure: true,
    defining_features: "snap/zip closure, patch pockets, boxy form, durable fabric",
  },
  field_jacket: {
    compatible_families: ["woven", "technical"],
    requires_structure: true,
    defining_features: "multi-pocket, cinched waist, military-inspired",
  },
  coat: {
    compatible_families: ["woven", "jacquard", "leather", "knit"],
    requires_structure: true,
    defining_features: "long outerwear, button or wrap closure, heavy weight",
  },
  trench: {
    compatible_families: ["woven"],
    requires_structure: true,
    defining_features: "double-breasted, belted, shoulder epaulettes, storm flap",
  },
  shirt: {
    compatible_families: ["woven", "jacquard", "sheer", "satin"],
    requires_structure: false,
    defining_features: "button front, collar, cuffs, woven body",
  },
  blouse: {
    compatible_families: ["woven", "sheer", "satin", "jacquard"],
    requires_structure: false,
    defining_features: "loose fit, light fabric, feminine cut",
  },
  dress: {
    compatible_families: ["woven", "knit", "jacquard", "sheer", "satin", "leather"],
    requires_structure: false,
    defining_features: "one-piece garment, bodice + skirt",
  },
  skirt: {
    compatible_families: ["woven", "knit", "jacquard", "leather", "satin", "sheer"],
    requires_structure: false,
    defining_features: "lower body, waistband, various lengths",
  },
  trousers: {
    compatible_families: ["woven", "knit", "leather", "technical"],
    requires_structure: false,
    defining_features: "two legs, waistband, zip/button fly",
  },
  jeans: {
    compatible_families: ["woven"],
    requires_structure: false,
    defining_features: "denim, five pockets, rivets",
  },
  vest: {
    compatible_families: ["woven", "knit", "jacquard", "leather", "technical"],
    requires_structure: false,
    defining_features: "sleeveless, front closure",
  },
};

const PATTERN_TECHNIQUE_FAMILIES: Record<string, string[]> = {
  knit:    ["cable", "cable knit", "rib", "fair isle", "intarsia", "pointelle", "waffle"],
  woven:   ["jacquard", "brocade", "damask", "tweed", "herringbone", "houndstooth", "plaid", "check", "stripe"],
  surface: ["floral", "botanical", "geometric", "abstract", "animal", "paisley", "dot", "camo", "toile"],
};

function classifyPatternTechnique(patternLabel: string): string {
  const lower = patternLabel.toLowerCase();
  for (const [technique, keywords] of Object.entries(PATTERN_TECHNIQUE_FAMILIES)) {
    if (keywords.some((kw) => lower.includes(kw))) return technique;
  }
  return "surface";
}

function isPatternCompatibleWithFabric(patternLabel: string, fabricFamily: string): { compatible: boolean; reason: string } {
  const technique = classifyPatternTechnique(patternLabel);

  if (technique === "knit" && fabricFamily !== "knit") {
    return { compatible: false, reason: `${patternLabel} is a knitting technique that cannot be applied to ${fabricFamily} fabric` };
  }

  if (technique === "woven" && fabricFamily === "knit") {
    const lower = patternLabel.toLowerCase();
    if (lower.includes("jacquard") || lower.includes("brocade") || lower.includes("damask")) {
      return { compatible: true, reason: `${patternLabel} can be interpreted as jacquard knitting (intarsia) on knit fabric` };
    }
    return { compatible: true, reason: `${patternLabel} can be interpreted as a knit pattern variation` };
  }

  return { compatible: true, reason: `${patternLabel} is compatible with ${fabricFamily} fabric as a surface pattern or native technique` };
}

export interface CoherenceResult {
  combo: IComboRef;
  coherence: ICoherence;
}

export function evaluateCombo(combo: IComboRef): CoherenceResult {
  const garmentType = combo.silhouette_garment_type.toLowerCase().replace(/[\s-]/g, "_");
  const fromLabel = classifyFabric(combo.fabric_label);
  const fromMaterial = classifyFabric(combo.fabric_family || "");
  const fabricFamily = fromLabel !== "unknown" ? fromLabel : fromMaterial;
  const factors: string[] = [];
  let verdict: ICoherence["verdict"] = "pass";
  let score = 1.0;
  const reasons: string[] = [];

  const rule = GARMENT_RULES[garmentType] ?? GARMENT_RULES["jacket"];
  const isDefault = !GARMENT_RULES[garmentType];

  if (isDefault) {
    factors.push(`no specific rules for garment_type:${garmentType}, using jacket rules`);
    score -= 0.1;
  }

  if (!rule.compatible_families.includes(fabricFamily) && fabricFamily !== "unknown") {
    verdict = "kill";
    score = 0;
    factors.push(`${garmentType} requires fabric_family:${rule.compatible_families.join("|")}`);
    factors.push(`${combo.fabric_label} is fabric_family:${fabricFamily} — incompatible`);
    reasons.push(
      `A ${combo.silhouette_label} requires ${rule.compatible_families.join(" or ")} construction for its defining characteristics: ${rule.defining_features}. ` +
      `${combo.fabric_label} is a ${fabricFamily} fabric — it cannot provide the structural properties this silhouette needs. ` +
      `Constructing this silhouette in ${fabricFamily} would fundamentally change the garment type.`,
    );
  } else {
    factors.push(`${garmentType} accepts fabric_family:${fabricFamily}`);
    reasons.push(
      `${combo.silhouette_label} silhouette is compatible with ${combo.fabric_label} (${fabricFamily} family). ` +
      `The fabric provides ${rule.requires_structure ? "the structural body needed for" : "suitable properties for"} ${rule.defining_features}.`,
    );
  }

  if (combo.pattern_label && verdict !== "kill") {
    const patternCheck = isPatternCompatibleWithFabric(combo.pattern_label, fabricFamily);
    if (!patternCheck.compatible) {
      verdict = "kill";
      score = 0;
      factors.push(patternCheck.reason);
      reasons.push(patternCheck.reason + ". This is a structural impossibility — the pattern technique is physically bound to a different textile method.");
    } else {
      factors.push(`${combo.pattern_label} compatible with ${fabricFamily}: ${patternCheck.reason}`);
      reasons.push(patternCheck.reason + ".");
    }
  }

  if (verdict !== "kill") {
    const isCrossBrand =
      combo.silhouette_brand !== combo.fabric_brand ||
      (combo.pattern_brand && combo.pattern_brand !== combo.silhouette_brand);
    if (isCrossBrand) {
      const brands = [combo.silhouette_brand, combo.fabric_brand, combo.pattern_brand].filter(Boolean);
      factors.push(`cross-brand: ${brands.join(" × ")}`);
      reasons.push(
        `Cross-brand combination: ${combo.silhouette_brand}'s ${combo.silhouette_label} silhouette with ` +
        `${combo.fabric_brand}'s ${combo.fabric_label}` +
        (combo.pattern_label ? ` and ${combo.pattern_brand}'s ${combo.pattern_label} pattern` : "") +
        ".",
      );
    }

    const isSameOrigin =
      combo.silhouette_brand === combo.fabric_brand &&
      (!combo.pattern_brand || combo.pattern_brand === combo.silhouette_brand);
    if (isSameOrigin) {
      score -= 0.15;
      factors.push("same-brand combo — lower novelty score");
    }

    if (fabricFamily === "unknown") {
      verdict = "stretch";
      score = Math.min(score, 0.5);
      factors.push("fabric family unknown — flagged for review");
    }

    if (verdict === "pass" && score < 0.6) {
      verdict = "stretch";
    }
  }

  const rationale = reasons.join(" ");

  return {
    combo: { ...combo, fabric_family: fabricFamily },
    coherence: {
      score: Math.max(0, Math.min(1, score)),
      verdict,
      rationale,
      rule_source: "rules",
      factors,
    },
  };
}

export function evaluateCombos(combos: IComboRef[]): { passed: CoherenceResult[]; killed: CoherenceResult[] } {
  const passed: CoherenceResult[] = [];
  const killed: CoherenceResult[] = [];

  for (const combo of combos) {
    const result = evaluateCombo(combo);
    if (result.coherence.verdict === "kill") {
      killed.push(result);
    } else {
      passed.push(result);
    }
  }

  passed.sort((a, b) => b.coherence.score - a.coherence.score);

  return { passed, killed };
}

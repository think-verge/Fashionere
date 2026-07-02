import { useState } from "react";
import { Box, Typography, Button, Fade } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";

// ── Types ────────────────────────────────────────────────────────────────────

interface Option {
  value: string;
  label: string;
  sub?: string;
}

interface Step {
  id: string;
  question: string;
  hint: string;
  type: "single" | "multi";
  options: Option[];
}

export interface WizardSelections {
  ageGroup: string;
  category: string;
  season: string;
  occasion: string[];
  aesthetic: string[];
}

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: "ageGroup",
    question: "Who are you designing for?",
    hint: "Women's fashion — select the target customer",
    type: "single",
    options: [
      { value: "gen-z", label: "Gen Z", sub: "16 – 24" },
      { value: "millennial", label: "Millennial", sub: "25 – 34" },
      { value: "gen-x", label: "Gen X", sub: "35 – 44" },
      { value: "mature", label: "Mature", sub: "45 +" },
    ],
  },
  {
    id: "category",
    question: "What is the style direction?",
    hint: "Pick one category",
    type: "single",
    options: [
      { value: "luxury", label: "Luxury" },
      { value: "contemporary", label: "Contemporary" },
      { value: "fast-fashion", label: "Fast Fashion" },
      { value: "casual", label: "Casual Wear" },
      { value: "sportswear", label: "Sportswear" },
      { value: "beachwear", label: "Beachwear" },
      { value: "streetwear", label: "Streetwear" },
      { value: "workwear", label: "Workwear" },
    ],
  },
  {
    id: "season",
    question: "Which collection season?",
    hint: "Target delivery window",
    type: "single",
    options: [
      { value: "ss26", label: "SS26", sub: "Spring / Summer 2026" },
      { value: "aw26", label: "AW26", sub: "Autumn / Winter 2026" },
      { value: "resort26", label: "Resort 26", sub: "Cruise Collection" },
      { value: "pf26", label: "Pre-Fall 26", sub: "Transitional" },
    ],
  },
  {
    id: "occasion",
    question: "What occasions?",
    hint: "Select all that apply",
    type: "multi",
    options: [
      { value: "everyday", label: "Everyday" },
      { value: "work", label: "Work / Office" },
      { value: "weekend", label: "Weekend" },
      { value: "evening", label: "Evening / Party" },
      { value: "beach", label: "Beach / Holiday" },
      { value: "active", label: "Active / Sport" },
      { value: "formal", label: "Formal / Gala" },
    ],
  },
  {
    id: "aesthetic",
    question: "What visual aesthetic?",
    hint: "Define the mood — pick multiple",
    type: "multi",
    options: [
      { value: "minimalist", label: "Minimalist" },
      { value: "maximalist", label: "Maximalist" },
      { value: "bohemian", label: "Bohemian" },
      { value: "romantic", label: "Romantic" },
      { value: "classic", label: "Classic" },
      { value: "edgy", label: "Edgy" },
      { value: "preppy", label: "Preppy" },
      { value: "eclectic", label: "Eclectic" },
    ],
  },
];

// ── Prompt builder ────────────────────────────────────────────────────────────
// The agent's QUERY_PARSE_SYSTEM LLM call needs to extract a "category" (garment type).
// Keep prompts short and lead with an identifiable garment noun.

const GARMENT_CATEGORY: Record<string, string> = {
  "luxury": "luxury ready-to-wear",
  "contemporary": "contemporary womenswear",
  "fast-fashion": "casual womenswear",
  "casual": "casual knitwear and dresses",
  "sportswear": "activewear",
  "beachwear": "swimwear and resort wear",
  "streetwear": "streetwear",
  "workwear": "tailoring and officewear",
};

// Occasion overrides that produce a more specific garment category
const OCCASION_GARMENT_OVERRIDE: Partial<Record<string, Record<string, string>>> = {
  "luxury": { "evening": "eveningwear and cocktail dresses", "formal": "couture gowns and formalwear" },
  "contemporary": { "evening": "cocktail dresses and partywear", "active": "athleisure" },
  "workwear": { "formal": "tailoring and suiting" },
};

const SEASON_SHORT: Record<string, string> = {
  "ss26": "SS26",
  "aw26": "AW26",
  "resort26": "Resort 2026",
  "pf26": "Pre-Fall 2026",
};

const AGE_SHORT: Record<string, string> = {
  "gen-z": "Gen Z",
  "millennial": "millennial",
  "gen-x": "Gen X",
  "mature": "mature",
};

export function buildMoodboardPrompt(s: WizardSelections): string {
  // Pick the most specific garment category, considering primary occasion override
  const primaryOccasion = s.occasion[0] ?? "";
  const garment =
    OCCASION_GARMENT_OVERRIDE[s.category]?.[primaryOccasion] ??
    GARMENT_CATEGORY[s.category] ??
    "womenswear";

  const season = SEASON_SHORT[s.season] ?? "2026";
  const age = AGE_SHORT[s.ageGroup] ?? "women";
  const occasions = s.occasion.slice(0, 3).join(", ");
  const aesthetics = s.aesthetic.slice(0, 3).join(", ");

  // Short, natural-language brief the agent's LLM can parse into a category + attributes
  return `${season} ${garment} for ${age} women. ${occasions} wear, ${aesthetics} aesthetic.`;
}

// ── Summary chip strip ────────────────────────────────────────────────────────

const DISPLAY_LABELS: Record<string, Record<string, string>> = {
  ageGroup: { "gen-z": "Gen Z", "millennial": "Millennial", "gen-x": "Gen X", "mature": "Mature 45+" },
  category: {
    "luxury": "Luxury", "contemporary": "Contemporary", "fast-fashion": "Fast Fashion",
    "casual": "Casual", "sportswear": "Sportswear", "beachwear": "Beachwear",
    "streetwear": "Streetwear", "workwear": "Workwear",
  },
  season: { "ss26": "SS26", "aw26": "AW26", "resort26": "Resort 26", "pf26": "Pre-Fall 26" },
  occasion: {
    "everyday": "Everyday", "work": "Office", "weekend": "Weekend",
    "evening": "Evening", "beach": "Beach", "active": "Active", "formal": "Formal",
  },
  aesthetic: {
    "minimalist": "Minimalist", "maximalist": "Maximalist", "bohemian": "Bohemian",
    "romantic": "Romantic", "classic": "Classic", "edgy": "Edgy", "preppy": "Preppy", "eclectic": "Eclectic",
  },
};

function getLabel(stepId: string, value: string): string {
  return DISPLAY_LABELS[stepId]?.[value] ?? value;
}

// ── Option pill ───────────────────────────────────────────────────────────────

function OptionPill({
  opt,
  selected,
  onClick,
}: {
  opt: Option;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "inline-flex",
        flexDirection: opt.sub ? "column" : "row",
        alignItems: opt.sub ? "flex-start" : "center",
        gap: 0.5,
        px: 2.5,
        py: opt.sub ? 1.5 : 1.25,
        borderRadius: "12px",
        border: "1.5px solid",
        borderColor: selected ? "primary.main" : "#f0e4e2",
        bgcolor: selected ? "#fff0ef" : "#ffffff",
        cursor: "pointer",
        transition: "all 0.18s ease",
        userSelect: "none",
        "&:hover": {
          borderColor: selected ? "primary.main" : "#dfbfbc",
          bgcolor: selected ? "#ffe8e7" : "#fffafa",
        },
        position: "relative",
      }}
    >
      {selected && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 10,
            width: 16,
            height: 16,
            borderRadius: "50%",
            bgcolor: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckIcon sx={{ fontSize: 10, color: "#fff" }} />
        </Box>
      )}
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: selected ? 700 : 500,
          color: selected ? "primary.main" : "text.primary",
          lineHeight: 1.2,
          pr: selected ? 2 : 0,
        }}
      >
        {opt.label}
      </Typography>
      {opt.sub && (
        <Typography sx={{ fontSize: 11, color: selected ? "#a93533aa" : "text.disabled", lineHeight: 1 }}>
          {opt.sub}
        </Typography>
      )}
    </Box>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ total, current, completed }: { total: number; current: number; completed: number[] }) {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
      {Array.from({ length: total }, (_, i) => {
        const done = completed.includes(i);
        const active = i === current;
        return (
          <Box
            key={i}
            sx={{
              width: active ? 24 : done ? 8 : 8,
              height: 8,
              borderRadius: 4,
              bgcolor: active ? "primary.main" : done ? "#dfbfbc" : "#f0e4e2",
              transition: "all 0.3s ease",
            }}
          />
        );
      })}
    </Box>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

interface Props {
  onGenerate: (selections: WizardSelections, prompt: string) => void;
}

type PartialSelections = Partial<WizardSelections>;

export function MoodboardWizard({ onGenerate }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<PartialSelections>({});
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const step = STEPS[currentStep];

  function getStepValue(stepId: string): string | string[] {
    if (stepId === "occasion" || stepId === "aesthetic") {
      return (selections as Record<string, string[]>)[stepId] ?? [];
    }
    return (selections as Record<string, string>)[stepId] ?? "";
  }

  function isOptionSelected(stepId: string, value: string): boolean {
    const v = getStepValue(stepId);
    return Array.isArray(v) ? v.includes(value) : v === value;
  }

  function toggleOption(value: string) {
    setSelections((prev) => {
      const id = step.id;
      if (step.type === "single") {
        return { ...prev, [id]: value };
      }
      const current = ((prev as Record<string, string[]>)[id] ?? []) as string[];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [id]: next };
    });
  }

  function canAdvance(): boolean {
    const v = getStepValue(step.id);
    if (step.type === "single") return !!v;
    return (v as string[]).length > 0;
  }

  function advance() {
    if (!canAdvance()) return;
    setCompletedSteps((prev) => (prev.includes(currentStep) ? prev : [...prev, currentStep]));
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleGenerate() {
    const final: WizardSelections = {
      ageGroup: (selections as Record<string, string>).ageGroup ?? "",
      category: (selections as Record<string, string>).category ?? "",
      season: (selections as Record<string, string>).season ?? "",
      occasion: (selections as Record<string, string[]>).occasion ?? [],
      aesthetic: (selections as Record<string, string[]>).aesthetic ?? [],
    };
    onGenerate(final, buildMoodboardPrompt(final));
  }

  const isLastStep = currentStep === STEPS.length - 1;

  // Chips of confirmed selections
  const summaryChips: string[] = STEPS.slice(0, currentStep).flatMap((s) => {
    const v = (selections as Record<string, string | string[]>)[s.id];
    if (!v) return [];
    return Array.isArray(v) ? v.map((val) => getLabel(s.id, val)) : [getLabel(s.id, v)];
  });

  return (
    <Box sx={{ maxWidth: 680 }}>
      {/* Bounded card */}
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "20px",
          bgcolor: "#ffffff",
          p: { xs: 3, md: 4 },
          mb: 0,
        }}
      >
        {/* Top bar */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3.5 }}>
          <StepDots total={STEPS.length} current={currentStep} completed={completedSteps} />
          <Typography sx={{ fontSize: 12, color: "text.disabled", fontWeight: 500 }}>
            Step {currentStep + 1} of {STEPS.length}
          </Typography>
        </Box>

        {/* Selection summary */}
        {summaryChips.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 3 }}>
            {summaryChips.map((chip) => (
              <Box
                key={chip}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: "20px",
                  bgcolor: "#f9f0ef",
                  border: "1px solid #f0e4e2",
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#58413f" }}>{chip}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Step question */}
        <Fade in key={currentStep} timeout={280}>
          <Box>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "primary.main",
              mb: 1.5,
            }}
          >
            Women's Fashion · 2026
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 26, md: 36 },
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              color: "text.primary",
              mb: 1,
            }}
          >
            {step.question}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 3.5 }}>
            {step.hint}
          </Typography>

          {/* Options grid */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, mb: 4 }}>
            {step.options.map((opt) => (
              <OptionPill
                key={opt.value}
                opt={opt}
                selected={isOptionSelected(step.id, opt.value)}
                onClick={() => {
                  toggleOption(opt.value);
                  if (step.type === "single") {
                    setTimeout(() => {
                      if (isLastStep) return;
                      setCompletedSteps((prev) => (prev.includes(currentStep) ? prev : [...prev, currentStep]));
                      setCurrentStep((s) => s + 1);
                    }, 200);
                  }
                }}
              />
            ))}
          </Box>

          {/* CTA */}
          {isLastStep ? (
            <Button
              variant="contained"
              size="large"
              disabled={!canAdvance()}
              onClick={handleGenerate}
              startIcon={<AutoAwesomeIcon />}
              sx={{ py: 1.5, px: 4, fontSize: 15, borderRadius: "12px" }}
            >
              Generate Moodboard
            </Button>
          ) : (
            step.type === "multi" && (
              <Button
                variant="outlined"
                size="large"
                disabled={!canAdvance()}
                onClick={advance}
                endIcon={<ArrowForwardIcon />}
                sx={{
                  py: 1.25,
                  px: 3.5,
                  fontSize: 14,
                  borderRadius: "12px",
                  borderColor: canAdvance() ? "primary.main" : "divider",
                  color: canAdvance() ? "primary.main" : "text.disabled",
                }}
              >
                Continue
              </Button>
            )
          )}
          </Box>
        </Fade>
      </Box>
    </Box>
  );
}

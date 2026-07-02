import { useEffect, useState, useRef } from "react";
import { Box, Typography, Fade } from "@mui/material";

// ── Step definitions ─────────────────────────────────────────────────────────

interface GenStep {
  label: string;
  detail: string;
  durationMs: number;
  color: string;
  icon: React.ReactNode;
}

const GEN_STEPS: GenStep[] = [
  {
    label: "Crystallising brief",
    detail: "Interpreting your selections into a creative direction",
    durationMs: 2500,
    color: "#ff9b8a",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    label: "Connecting to trend database",
    detail: "Scanning seasonal signals and runway reports",
    durationMs: 4500,
    color: "#fbbf24",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    label: "Curating seasonal trends",
    detail: "Filtering and scoring relevant trend signals",
    durationMs: 6000,
    color: "#6ee7b7",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    label: "Generating hero imagery",
    detail: "Creating editorial outfit visuals with AI",
    durationMs: 10000,
    color: "#c4b5fd",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    label: "Composing texture tiles",
    detail: "Rendering fabric and surface detail tiles",
    durationMs: 8000,
    color: "#93c5fd",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: "Building pattern library",
    detail: "Generating silhouettes, colorways, and patterns",
    durationMs: 7000,
    color: "#f9a8d4",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    label: "Extracting colour palette",
    detail: "Harmonising seasonal swatches from generated imagery",
    durationMs: 5000,
    color: "#fde68a",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="0.5" /><circle cx="17.5" cy="10.5" r="0.5" />
        <circle cx="8.5" cy="7.5" r="0.5" /><circle cx="6.5" cy="12.5" r="0.5" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
  },
  {
    label: "Writing creative narrative",
    detail: "Composing editorial direction and keywords",
    durationMs: 6000,
    color: "#a5f3fc",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: "Assembling final board",
    detail: "Finalising layout and validating outputs",
    durationMs: Infinity, // holds until polling confirms done
    color: "#bbf7d0",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
];

// ── Animated ticker content for active step ───────────────────────────────────

function ScanningContent() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);
  const labels = ["Scanning 2.4M signals…", "Parsing runway data…", "Cross-referencing…", "Analysing sentiment…", "Mapping lifestyle…"];
  return (
    <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)", mt: 0.75, fontFamily: "monospace" }}>
      {labels[Math.floor(tick / 18) % labels.length]}
    </Typography>
  );
}

function TrendBarsContent() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(p + 1.8, 100)), 18);
    return () => clearInterval(id);
  }, []);
  const bars = [{ label: "Seasonal relevance", pct: 88 }, { label: "Style alignment", pct: 74 }, { label: "Market fit", pct: 91 }];
  return (
    <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
      {bars.map((b) => (
        <Box key={b.label} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.4)", width: 110, flexShrink: 0 }}>{b.label}</Typography>
          <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <Box sx={{ height: "100%", borderRadius: 2, bgcolor: "#6ee7b7", width: `${(progress / 100) * b.pct}%`, transition: "width 0.018s linear" }} />
          </Box>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 700, width: 28, textAlign: "right" }}>
            {Math.round((progress / 100) * b.pct)}%
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function ImagesContent() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => { i++; setCount(i); if (i >= 9) clearInterval(id); }, 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <Box sx={{ mt: 1, display: "flex", gap: 0.75, alignItems: "center" }}>
      {Array.from({ length: 9 }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 22, height: 28, borderRadius: "4px",
            bgcolor: i < count ? "#c4b5fd" : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
            transition: "background-color 0.2s ease",
          }}
        />
      ))}
      <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.4)", ml: 0.5 }}>
        {count < 9 ? `${count}/9` : "done"}
      </Typography>
    </Box>
  );
}

function PaletteContent() {
  const [revealed, setRevealed] = useState(0);
  const colors = ["#a93533", "#241918", "#e8d9c5", "#006c4d", "#ff746d", "#c4b5fd", "#fbbf24"];
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => { i++; setRevealed(i); if (i >= 7) clearInterval(id); }, 380);
    return () => clearInterval(id);
  }, []);
  return (
    <Box sx={{ mt: 1, display: "flex", gap: 0.75 }}>
      {colors.map((c, i) => (
        <Box key={i} sx={{ width: 20, height: 20, borderRadius: "4px", bgcolor: i < revealed ? c : "rgba(255,255,255,0.08)", transition: "background-color 0.25s ease", border: "1px solid rgba(255,255,255,0.1)" }} />
      ))}
    </Box>
  );
}

const STEP_CONTENT: Partial<Record<number, () => React.ReactElement>> = {
  1: ScanningContent,
  2: TrendBarsContent,
  3: ImagesContent,
  6: PaletteContent,
};

// ── Connector line ────────────────────────────────────────────────────────────

function Connector({ done }: { done: boolean }) {
  return (
    <Box sx={{ ml: "23px", width: 2, height: 18, bgcolor: done ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)", borderRadius: 1 }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  summary: string;
  isComplete: boolean;
}

export function GeneratingExperience({ summary, isComplete }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const advanceStep = (stepIdx: number) => {
      const step = GEN_STEPS[stepIdx];
      if (step.durationMs === Infinity) return; // wait for isComplete
      timerRef.current = setTimeout(() => {
        const next = stepIdx + 1;
        if (next < GEN_STEPS.length) {
          setActiveStep(next);
          advanceStep(next);
        }
      }, step.durationMs);
    };
    advanceStep(0);
    return () => clearTimeout(timerRef.current);
  }, []);

  // When polling confirms done and we're on the last (Infinity) step, complete it
  useEffect(() => {
    if (isComplete && activeStep === GEN_STEPS.length - 1) {
      // Leave it — parent will transition away after a short delay
    }
    if (isComplete && activeStep < GEN_STEPS.length - 1) {
      clearTimeout(timerRef.current);
      setActiveStep(GEN_STEPS.length - 1);
    }
  }, [isComplete, activeStep]);

  return (
    <Fade in timeout={400}>
      <Box
        sx={{
          borderRadius: "20px",
          background: "linear-gradient(145deg, #1a0a0a 0%, #241918 50%, #1a1230 100%)",
          p: { xs: 4, md: 5 },
          minHeight: 560,
          display: "flex",
          gap: 5,
        }}
      >
        {/* Left: Summary + Steps */}
        <Box sx={{ flex: "0 0 340px", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <Box
                sx={{
                  width: 8, height: 8, borderRadius: "50%", bgcolor: "#6ee7b7",
                  boxShadow: "0 0 10px #6ee7b750",
                  animation: "genpulse 1.6s ease-in-out infinite",
                }}
              />
              <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)" }}>
                Generating
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: "#ffffff", lineHeight: 1.2, mb: 1.5, letterSpacing: "-0.01em" }}>
              Creating your moodboard
            </Typography>
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              {summary}
            </Typography>
          </Box>

          {/* Steps */}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.25)", mb: 1.5 }}>
              Progress
            </Typography>

            {GEN_STEPS.map((step, i) => {
              const isActive = i === activeStep;
              const isDone = isComplete ? i < GEN_STEPS.length : i < activeStep;
              const isPending = !isActive && !isDone;
              const ContentComp = STEP_CONTENT[i];

              return (
                <Box key={step.label}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1.5,
                      px: 1.5,
                      py: isActive ? 1.25 : 0.75,
                      borderRadius: "10px",
                      bgcolor: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      border: isActive ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {/* Icon dot */}
                    <Box
                      sx={{
                        width: 28, height: 28, borderRadius: "8px", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        bgcolor: isActive ? step.color : isDone ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                        color: isActive ? "#1a0a0a" : isDone ? step.color : "rgba(255,255,255,0.2)",
                        transition: "all 0.3s ease",
                        boxShadow: isActive ? `0 0 12px ${step.color}44` : "none",
                      }}
                    >
                      {isDone && !isActive ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        step.icon
                      )}
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
                      <Typography
                        sx={{
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? "#ffffff" : isDone ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)",
                          lineHeight: 1.2,
                          transition: "color 0.3s",
                        }}
                      >
                        {step.label}
                      </Typography>
                      {isActive && (
                        <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.4)", mt: 0.25, lineHeight: 1.4 }}>
                          {step.detail}
                        </Typography>
                      )}
                      {isActive && ContentComp && <ContentComp />}
                    </Box>

                    <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.15)", fontWeight: 600, mt: 0.5, flexShrink: 0 }}>
                      0{i + 1}
                    </Typography>
                  </Box>

                  {i < GEN_STEPS.length - 1 && <Connector done={isDone} />}
                </Box>
              );
            })}
          </Box>

          {/* Bottom hint */}
          <Box sx={{ mt: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#fbbf24", animation: "genpulse 2s ease-in-out infinite" }} />
            <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em" }}>
              Typically 30 – 60 seconds
            </Typography>
          </Box>
        </Box>

        {/* Right: Decorative visual panel */}
        <Box
          sx={{
            flex: 1,
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            gap: 1.5,
            opacity: 0.6,
          }}
        >
          <VisualSkeletons activeStep={activeStep} isComplete={isComplete} />
        </Box>

        <style>{`
          @keyframes genpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }
          @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        `}</style>
      </Box>
    </Fade>
  );
}

// ── Right panel: skeleton moodboard tiles ────────────────────────────────────

function VisualSkeletons({ activeStep, isComplete }: { activeStep: number; isComplete: boolean }) {
  const revealed = isComplete ? 12 : Math.floor(activeStep * 1.4);

  const shimmer = {
    background: "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 75%)",
    backgroundSize: "400% 100%",
    animation: "shimmer 2.2s ease-in-out infinite",
  };

  const tile = (key: number, w: string, h: string, delay: string) => (
    <Box
      key={key}
      sx={{
        width: w, height: h, borderRadius: "10px",
        bgcolor: key < revealed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
        ...(key >= revealed ? shimmer : {}),
        transition: "background-color 0.4s ease",
        transitionDelay: delay,
        flexShrink: 0,
      }}
    />
  );

  return (
    <>
      {/* Hero row */}
      <Box sx={{ display: "flex", gap: 1.5 }}>
        {tile(0, "55%", "180px", "0s")}
        {tile(1, "calc(45% - 12px)", "180px", "0.1s")}
      </Box>
      {/* Tile row 1 */}
      <Box sx={{ display: "flex", gap: 1.5 }}>
        {tile(2, "33%", "120px", "0.15s")}
        {tile(3, "33%", "120px", "0.2s")}
        {tile(4, "calc(34% - 24px)", "120px", "0.25s")}
      </Box>
      {/* Tile row 2 */}
      <Box sx={{ display: "flex", gap: 1.5 }}>
        {tile(5, "50%", "100px", "0.3s")}
        {tile(6, "calc(50% - 12px)", "100px", "0.35s")}
      </Box>
      {/* Palette strip */}
      <Box sx={{ display: "flex", gap: 1 }}>
        {[7, 8, 9, 10, 11].map((k) =>
          tile(k, "18%", "32px", `${0.35 + (k - 7) * 0.06}s`)
        )}
      </Box>
      {/* Narrative block */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {tile(12, "80%", "12px", "0.6s")}
        {tile(13, "60%", "12px", "0.65s")}
        {tile(14, "70%", "12px", "0.7s")}
      </Box>
    </>
  );
}

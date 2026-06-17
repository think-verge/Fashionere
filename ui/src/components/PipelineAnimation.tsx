import { useEffect, useState, useCallback } from "react";
import { Box, Typography } from "@mui/material";

const STEP_MS = 2600;

// ── Step content components ──────────────────────────────────────────────────
// Defined before STEPS so they can be referenced by key

function BriefContent() {
  const [text, setText] = useState("");
  const full = "SS27 luxury resort — fluid silhouettes, sustainable fabrics...";
  useEffect(() => {
    setText("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setText(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 38);
    return () => clearInterval(id);
  }, []);
  return (
    <Box sx={{ mt: 1, px: 1.5, py: 1, bgcolor: "rgba(255,255,255,0.1)", borderRadius: "8px", minHeight: 36 }}>
      <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "'Literata', Georgia, serif", lineHeight: 1.5 }}>
        {text}
        <span style={{ opacity: 0.6, animation: "blink 1s step-end infinite" }}>|</span>
      </Typography>
    </Box>
  );
}

function AIContent() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 110);
    return () => clearInterval(id);
  }, []);
  const labels = ["Scanning 2.4M signals…", "Parsing runway data…", "Cross-referencing…", "Analysing sentiment…"];
  return (
    <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i / 6) * Math.PI * 2 + tick * 0.08;
          const cx = 15 + Math.cos(angle) * 10;
          const cy = 15 + Math.sin(angle) * 10;
          const opacity = 0.25 + ((tick + i * 3) % 6) / 6 * 0.75;
          return <circle key={i} cx={cx} cy={cy} r="2.8" fill="#fbbf24" opacity={opacity} />;
        })}
        <circle cx="15" cy="15" r="3.5" fill="#fbbf24" opacity="0.95" />
      </svg>
      <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
        {labels[Math.floor(tick / 22) % labels.length]}
      </Typography>
    </Box>
  );
}

function TrendsContent() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const id = setInterval(() => setProgress((p) => Math.min(p + 2, 100)), 20);
    return () => clearInterval(id);
  }, []);
  const bars = [
    { label: "Liquid Metal", pct: 88 },
    { label: "Structured Sheer", pct: 74 },
    { label: "Bio-Organic", pct: 62 },
  ];
  return (
    <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
      {bars.map((b) => (
        <Box key={b.label} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.55)", width: 104, flexShrink: 0 }}>
            {b.label}
          </Typography>
          <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                borderRadius: 3,
                bgcolor: "#6ee7b7",
                width: `${(progress / 100) * b.pct}%`,
                transition: "width 0.02s linear",
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 700, width: 28, textAlign: "right" }}>
            {Math.round((progress / 100) * b.pct)}%
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function MoodboardContent() {
  const [revealed, setRevealed] = useState(0);
  const colors = ["#a93533", "#241918", "#e8d9c5", "#006c4d", "#ff746d", "#c4b5fd"];
  useEffect(() => {
    setRevealed(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setRevealed(i);
      if (i >= 6) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, []);
  return (
    <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      {colors.map((c, i) => (
        <Box
          key={i}
          sx={{
            width: 26,
            height: 26,
            borderRadius: "6px",
            bgcolor: i < revealed ? c : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            transition: "background-color 0.25s ease",
            transform: i < revealed ? "scale(1)" : "scale(0.85)",
          }}
        />
      ))}
      <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.5)", ml: 0.5 }}>
        {revealed < 6 ? `${revealed}/6…` : "ready"}
      </Typography>
    </Box>
  );
}

function CostContent() {
  const [val, setVal] = useState(0);
  const target = 1440;
  useEffect(() => {
    setVal(0);
    const id = setInterval(() => {
      setVal((v) => {
        const next = v + 30;
        if (next >= target) { clearInterval(id); return target; }
        return next;
      });
    }, 28);
    return () => clearInterval(id);
  }, []);
  return (
    <Box sx={{ mt: 1, display: "flex", gap: 3, alignItems: "flex-end" }}>
      <Box>
        <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Per unit
        </Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 700, color: "#93c5fd", lineHeight: 1 }}>
          ${(val / 100).toFixed(2)}
        </Typography>
      </Box>
      <Box>
        <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          100 units
        </Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.65)", lineHeight: 1 }}>
          ${(val).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Step definitions ─────────────────────────────────────────────────────────

type StepKey = "brief" | "ai" | "trends" | "moodboard" | "cost";

const STEPS: { key: StepKey; icon: React.ReactNode; label: string; color: string }[] = [
  {
    key: "brief",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    label: "Designer Brief",
    color: "#ff9b8a",
  },
  {
    key: "ai",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    label: "AI Processing",
    color: "#fbbf24",
  },
  {
    key: "trends",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    label: "Trend Analysis",
    color: "#6ee7b7",
  },
  {
    key: "moodboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    label: "Mood Board",
    color: "#c4b5fd",
  },
  {
    key: "cost",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    label: "Cost Estimate",
    color: "#93c5fd",
  },
];

// Map step key → content component (rendered fresh on each mount so animations restart)
const CONTENT_MAP: Record<StepKey, () => React.ReactElement> = {
  brief: BriefContent,
  ai: AIContent,
  trends: TrendsContent,
  moodboard: MoodboardContent,
  cost: CostContent,
};

// ── Travelling dot connector ─────────────────────────────────────────────────

function Connector({ active }: { active: boolean }) {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    setPos(0);
    if (!active) return;
    const id = setInterval(() => {
      setPos((p) => {
        if (p >= 100) { clearInterval(id); return 100; }
        return p + 3;
      });
    }, 18);
    return () => clearInterval(id);
  }, [active]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", height: 26, ml: 1.5 }}>
      {/* track */}
      <Box sx={{ width: 2, height: "100%", bgcolor: "rgba(255,255,255,0.1)", borderRadius: 1, position: "absolute" }} />
      {/* fill */}
      <Box
        sx={{
          width: 2,
          bgcolor: "rgba(255,255,255,0.4)",
          borderRadius: 1,
          position: "absolute",
          top: 0,
          height: `${pos}%`,
          transition: "height 0.02s linear",
        }}
      />
      {/* glowing dot */}
      {active && pos > 0 && pos < 100 && (
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: "white",
            position: "absolute",
            top: `calc(${pos}% - 3.5px)`,
            boxShadow: "0 0 8px 2px rgba(255,255,255,0.45)",
            transition: "top 0.02s linear",
          }}
        />
      )}
      {/* arrowhead */}
      <Box
        sx={{
          position: "absolute",
          bottom: -3,
          width: 0,
          height: 0,
          borderLeft: "3px solid transparent",
          borderRight: "3px solid transparent",
          borderTop: `5px solid rgba(255,255,255,${pos >= 100 ? 0.4 : 0.15})`,
        }}
      />
    </Box>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PipelineAnimation() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => {
    if (!paused) setActive((a) => (a + 1) % STEPS.length);
  }, [paused]);

  useEffect(() => {
    const id = setInterval(advance, STEP_MS);
    return () => clearInterval(id);
  }, [advance]);

  return (
    <Box>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>

      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.35)",
          mb: 1.5,
        }}
      >
        Live Pipeline
      </Typography>

      {STEPS.map((step, i) => {
        const isActive = active === i;
        const isDone = i < active;
        const ContentComponent = CONTENT_MAP[step.key];

        return (
          <Box key={step.key}>
            <Box
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onClick={() => setActive(i)}
              sx={{
                px: 1.75,
                py: isActive ? 1.25 : 0.75,
                borderRadius: "10px",
                border: isActive
                  ? "1.5px solid rgba(255,255,255,0.25)"
                  : isDone
                  ? "1px solid rgba(255,255,255,0.1)"
                  : "1px solid rgba(255,255,255,0.05)",
                bgcolor: isActive
                  ? "rgba(255,255,255,0.12)"
                  : isDone
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.02)",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: isActive ? "0 0 18px rgba(255,255,255,0.06)" : "none",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                {/* Icon */}
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: "7px",
                    bgcolor: isActive ? step.color : "rgba(255,255,255,0.07)",
                    color: isActive ? "#1a0a0a" : isDone ? step.color : "rgba(255,255,255,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.3s ease",
                    boxShadow: isActive ? `0 0 10px ${step.color}55` : "none",
                  }}
                >
                  {isDone && !isActive ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    step.icon
                  )}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive
                        ? "#ffffff"
                        : isDone
                        ? "rgba(255,255,255,0.55)"
                        : "rgba(255,255,255,0.28)",
                      lineHeight: 1,
                      transition: "color 0.3s",
                    }}
                  >
                    {step.label}
                  </Typography>
                </Box>

                <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontWeight: 600 }}>
                  0{i + 1}
                </Typography>
              </Box>

              {/* Content — conditionally rendered so it remounts and animations restart */}
              {isActive && (
                <Box sx={{ ml: "42px" }}>
                  <ContentComponent />
                </Box>
              )}
            </Box>

            {i < STEPS.length - 1 && <Connector active={isActive} />}
          </Box>
        );
      })}

      {/* Loop pulse */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5, ml: 0.5 }}>
        <Box
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: "#6ee7b7",
            animation: "blink 1.4s ease-in-out infinite",
          }}
        />
        <Typography sx={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
          Click any step · hover to pause
        </Typography>
      </Box>
    </Box>
  );
}

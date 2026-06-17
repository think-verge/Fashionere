import { useState } from "react";
import {
  Box, Typography, Paper, TextField, IconButton, LinearProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { PageShell } from "../../components/PageShell";

interface Message {
  role: "user" | "ai";
  text: string;
}

const SEED_MESSAGES: Message[] = [
  {
    role: "ai",
    text: "Welcome to Conversational Intelligence. Ask me about color palettes, emerging silhouettes, or market trends for your upcoming collection.",
  },
  {
    role: "user",
    text: "What are the top fabric trends for SS27?",
  },
  {
    role: "ai",
    text: "For SS27, three materials are dominating early runway signals:\n\n• Liquid Metal (94% confidence) — Reflective woven fabrics from Lurex blends, strong in evening and occasion wear.\n• Structured Sheer (89%) — Double-layered organza and tulle with built-in boning, crossing into ready-to-wear.\n• Bio-Sequins (78%) — Plant-based PLA alternatives gaining adoption in sustainable luxury.",
  },
];

const RADAR_TRENDS = [
  { label: "Liquid Metal", value: 94 },
  { label: "Structured Sheer", value: 89 },
  { label: "Bio-Sequins", value: 78 },
];

export function TrendsPage() {
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setThinking(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "I'm analyzing current runway data and trend signals for your query. Sustainability-led construction (+34% YoY), tech-forward materials, and bio-innovative textiles are the dominant macro narratives for SS27. Liquid Metal finishes remain the highest-confidence individual trend at 94%.",
        },
      ]);
      setThinking(false);
    }, 1800);
  }

  return (
    <PageShell title="Trends">
      {/* Custom header with live indicator */}
      <Box sx={{ mb: 6 }}>
        <Typography sx={{ color: "primary.main", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", mb: 2 }}>
          Trend Analysis
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
          <Typography sx={{ fontSize: { xs: 32, md: 48 }, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: "text.primary" }}>
            Conversational Intelligence
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#006c4d", animation: "pulse 2s infinite", "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } } }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#006c4d", textTransform: "uppercase", letterSpacing: "0.1em" }}>Live</Typography>
          </Box>
        </Box>
        <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 17, lineHeight: 1.7, color: "text.secondary", maxWidth: 560 }}>
          Real-time signals from runway, retail, and social to inform your next collection.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 4, height: "calc(100vh - 380px)", minHeight: 460 }}>
        {/* Chat area */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Messages */}
          <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2, pb: 2 }}>
            {messages.map((msg, i) => (
              <Box
                key={i}
                sx={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 1.5 }}
              >
                {msg.role === "ai" && (
                  <Box
                    sx={{
                      width: 32, height: 32, borderRadius: "10px", bgcolor: "#241918",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, mt: 0.5,
                    }}
                  >
                    <AutoAwesomeIcon sx={{ fontSize: 15, color: "#ff9b8a" }} />
                  </Box>
                )}
                <Paper
                  elevation={0}
                  sx={{
                    maxWidth: "72%", p: 2,
                    ...(msg.role === "user"
                      ? { bgcolor: "#a93533", color: "#fff", borderRadius: "16px 16px 4px 16px" }
                      : { bgcolor: "#fff", borderRadius: "4px 16px 16px 16px" }),
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line",
                      color: msg.role === "user" ? "#fff" : "text.primary",
                    }}
                  >
                    {msg.text}
                  </Typography>
                </Paper>
              </Box>
            ))}
            {thinking && (
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: "10px", bgcolor: "#241918", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 15, color: "#ff9b8a" }} />
                </Box>
                <Paper elevation={0} sx={{ p: 2, borderRadius: "4px 16px 16px 16px", minWidth: 80 }}>
                  <LinearProgress sx={{ width: 60, height: 3, borderRadius: 2, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "#a93533" } }} />
                </Paper>
              </Box>
            )}
          </Box>

          {/* Input bar */}
          <Paper
            elevation={0}
            sx={{ p: 0.5, display: "flex", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: "12px" }}
          >
            <TextField
              fullWidth
              variant="standard"
              placeholder="Ask for color palettes, trends, silhouettes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              sx={{ px: 1.5, "& .MuiInput-root::before, & .MuiInput-root::after": { display: "none" } }}
            />
            <IconButton
              onClick={send}
              disabled={!input.trim() || thinking}
              sx={{
                width: 40, height: 40, bgcolor: "primary.main", color: "#fff",
                borderRadius: "8px", mr: 0.5,
                "&:hover": { bgcolor: "#7d1f1d" },
                "&.Mui-disabled": { bgcolor: "#f0e4e2", color: "#bbb" },
              }}
            >
              <SendIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Paper>
        </Box>

        {/* Right sidebar — Macro Analysis */}
        <Paper
          elevation={0}
          sx={{ width: 300, flexShrink: 0, p: 3, display: "flex", flexDirection: "column", overflow: "auto" }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "text.secondary", mb: 0.5 }}>
            Macro Analysis
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 3 }}>Trend Radar SS27</Typography>

          {/* Radar visual */}
          <Box sx={{ position: "relative", width: 140, height: 140, mx: "auto", mb: 3 }}>
            {[140, 100, 60].map((size) => (
              <Box
                key={size}
                sx={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)",
                  width: size, height: size, borderRadius: "50%", border: "1px solid #f0e4e2",
                }}
              />
            ))}
            {RADAR_TRENDS.map((t, i) => {
              const angle = (i * 120 - 90) * (Math.PI / 180);
              const r = 54 * (t.value / 100);
              return (
                <Box
                  key={t.label}
                  sx={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: `translate(-50%,-50%) translate(${+(r * Math.cos(angle)).toFixed(1)}px, ${+(r * Math.sin(angle)).toFixed(1)}px)`,
                    width: 10, height: 10, borderRadius: "50%", bgcolor: "primary.main",
                  }}
                />
              );
            })}
            <Box sx={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>91</Typography>
              <Typography sx={{ fontSize: 9, color: "text.secondary" }}>sentiment</Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary", mb: 2 }}>
            Radar Legend
          </Typography>
          {RADAR_TRENDS.map((t) => (
            <Box key={t.label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
              <Typography sx={{ fontSize: 13, color: "text.primary" }}>{t.label}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "primary.main" }}>{t.value}%</Typography>
            </Box>
          ))}

          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #f0e4e2" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
                Sustainability
              </Typography>
              <Typography sx={{ fontSize: 12, color: "#006c4d", fontWeight: 700 }}>+34%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={72}
              sx={{ height: 4, borderRadius: 2, bgcolor: "#f0e4e2", "& .MuiLinearProgress-bar": { bgcolor: "#006c4d" } }}
            />
          </Box>
        </Paper>
      </Box>
    </PageShell>
  );
}

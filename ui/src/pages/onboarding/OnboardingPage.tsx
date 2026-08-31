import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Chip, TextField, Alert,
  Stepper, Step, StepLabel, Paper, Link,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import { useAuth } from "../../lib/auth-context";

const STEPS = ["Your Role", "Sources", "Interests", "Account"];

const DESIGNER_SOURCES = ["Vogue", "Balenciaga", "Prada", "Dior", "Gucci", "Saint Laurent", "Valentino", "Loewe"];
const RETAIL_SOURCES = ["H&M", "Zara", "Mango", "Uniqlo", "COS", "ASOS", "& Other Stories"];
const GARMENT_TYPES = ["Jacket", "Coat", "Dress", "Trousers", "Skirt", "Top", "Shirt", "Knitwear", "Accessories", "Shoes", "Bag"];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<"designer" | "retail_chain" | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const availableSources = role === "retail_chain" ? RETAIL_SOURCES : DESIGNER_SOURCES;

  function toggleSource(s: string) {
    setSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function toggleInterest(g: string) {
    setInterests((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }

  async function handleSubmit() {
    if (!role) return;
    setError("");
    setLoading(true);
    try {
      await signup({
        name,
        email,
        password,
        role,
        sources: sources.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "")),
        garment_interests: interests.map((g) => g.toLowerCase()),
      });
      navigate("/app/looks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "#fff8f7" }}>
      {/* Left brand panel */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          width: "40%",
          maxWidth: 480,
          bgcolor: "#a93533",
          flexDirection: "column",
          justifyContent: "flex-end",
          p: 6,
        }}
      >
        <Typography sx={{ fontFamily: "'Literata', Georgia, serif", fontSize: 48, fontWeight: 700, color: "#ffffff", lineHeight: 1.1, letterSpacing: "-0.02em", mb: 3 }}>
          FASHIONARE
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: 16, lineHeight: 1.7 }}>
          Set up your account in 4 quick steps and start curating looks from the world's best sources.
        </Typography>
      </Box>

      {/* Right form */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: { xs: 3, sm: 6 } }}>
        <Box sx={{ width: "100%", maxWidth: 560 }}>
          <Stepper activeStep={step} sx={{ mb: 5 }}>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Step 0: Role */}
          {step === 0 && (
            <Box>
              <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", mb: 1, color: "text.primary" }}>
                What describes you best?
              </Typography>
              <Typography sx={{ color: "text.secondary", mb: 4, fontFamily: "'Literata', Georgia, serif", fontSize: 16 }}>
                We'll tailor your look feed based on your role.
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
                {(["designer", "retail_chain"] as const).map((r) => (
                  <Paper
                    key={r}
                    onClick={() => setRole(r)}
                    sx={{
                      flex: 1,
                      p: 4,
                      cursor: "pointer",
                      borderRadius: "16px",
                      border: role === r ? "2px solid #a93533" : "1px solid #f0e4e2",
                      position: "relative",
                      "&:hover": { borderColor: "#dfbfbc" },
                      transition: "border-color 0.15s",
                    }}
                  >
                    {role === r && (
                      <Box sx={{ position: "absolute", top: 12, right: 12, width: 24, height: 24, borderRadius: "50%", bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckIcon sx={{ color: "#fff", fontSize: 14 }} />
                      </Box>
                    )}
                    <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1, color: "text.primary" }}>
                      {r === "designer" ? "Fashion Designer" : "Retail Chain"}
                    </Typography>
                    <Typography sx={{ color: "text.secondary", fontSize: 14, lineHeight: 1.6 }}>
                      {r === "designer"
                        ? "Browse runway & editorial looks for creative research."
                        : "Track retail trends and competitor sources."}
                    </Typography>
                  </Paper>
                ))}
              </Box>
              <Button
                variant="contained"
                fullWidth
                disabled={!role}
                endIcon={<ArrowForwardIcon />}
                onClick={() => setStep(1)}
                sx={{ mt: 4, py: 1.5, borderRadius: "10px", fontSize: 15 }}
              >
                Continue
              </Button>
            </Box>
          )}

          {/* Step 1: Sources */}
          {step === 1 && (
            <Box>
              <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", mb: 1, color: "text.primary" }}>
                Which sources do you follow?
              </Typography>
              <Typography sx={{ color: "text.secondary", mb: 4, fontFamily: "'Literata', Georgia, serif", fontSize: 16 }}>
                Select the brands and publications you want looks from.
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 4 }}>
                {availableSources.map((s) => {
                  const selected = sources.includes(s);
                  return (
                    <Chip
                      key={s}
                      label={s}
                      onClick={() => toggleSource(s)}
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                      sx={{ fontWeight: 500, cursor: "pointer" }}
                    />
                  );
                })}
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="outlined" onClick={() => setStep(0)} sx={{ borderRadius: "10px", borderColor: "#f0e4e2", color: "text.secondary" }}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => setStep(2)}
                  sx={{ flex: 1, py: 1.5, borderRadius: "10px", fontSize: 15 }}
                >
                  Continue
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 2: Garment interests */}
          {step === 2 && (
            <Box>
              <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", mb: 1, color: "text.primary" }}>
                What garments interest you?
              </Typography>
              <Typography sx={{ color: "text.secondary", mb: 4, fontFamily: "'Literata', Georgia, serif", fontSize: 16 }}>
                We'll highlight these pieces in deconstruction views.
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 4 }}>
                {GARMENT_TYPES.map((g) => {
                  const selected = interests.includes(g);
                  return (
                    <Chip
                      key={g}
                      label={g}
                      onClick={() => toggleInterest(g)}
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                      sx={{ fontWeight: 500, cursor: "pointer" }}
                    />
                  );
                })}
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="outlined" onClick={() => setStep(1)} sx={{ borderRadius: "10px", borderColor: "#f0e4e2", color: "text.secondary" }}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => setStep(3)}
                  sx={{ flex: 1, py: 1.5, borderRadius: "10px", fontSize: 15 }}
                >
                  Continue
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 3: Account */}
          {step === 3 && (
            <Box>
              <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", mb: 1, color: "text.primary" }}>
                Create your account
              </Typography>
              <Typography sx={{ color: "text.secondary", mb: 4, fontFamily: "'Literata', Georgia, serif", fontSize: 16 }}>
                Almost there — just a few details.
              </Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mb: 3 }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 1, color: "text.primary" }}>Full Name</Typography>
                  <TextField fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name"
                    sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff", "& fieldset": { borderColor: "#f0e4e2" }, "&:hover fieldset": { borderColor: "#dfbfbc" }, "&.Mui-focused fieldset": { borderColor: "#a93533" } } }}
                  />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 1, color: "text.primary" }}>Email</Typography>
                  <TextField fullWidth type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="creative@studio.com" autoComplete="email"
                    sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff", "& fieldset": { borderColor: "#f0e4e2" }, "&:hover fieldset": { borderColor: "#dfbfbc" }, "&.Mui-focused fieldset": { borderColor: "#a93533" } } }}
                  />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 1, color: "text.primary" }}>Password</Typography>
                  <TextField fullWidth type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password"
                    sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff", "& fieldset": { borderColor: "#f0e4e2" }, "&:hover fieldset": { borderColor: "#dfbfbc" }, "&.Mui-focused fieldset": { borderColor: "#a93533" } } }}
                  />
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="outlined" onClick={() => setStep(2)} sx={{ borderRadius: "10px", borderColor: "#f0e4e2", color: "text.secondary" }}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  disabled={loading || !name || !email || !password}
                  endIcon={<ArrowForwardIcon />}
                  onClick={handleSubmit}
                  sx={{ flex: 1, py: 1.5, borderRadius: "10px", fontSize: 15 }}
                >
                  {loading ? "Creating account…" : "Create Account"}
                </Button>
              </Box>

              <Typography variant="body2" sx={{ mt: 3, textAlign: "center", color: "#999999" }}>
                Already have an account?{" "}
                <Link component={RouterLink} to="/login" sx={{ color: "primary.main", fontWeight: 500, textDecoration: "none" }}>
                  Sign in
                </Link>
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

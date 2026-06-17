import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, Typography, TextField, Button, Alert, Link, Grid } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckIcon from "@mui/icons-material/Check";
import { useAuth } from "../../lib/auth-context";
import { AuthIllustration } from "../../components/AuthIllustration";

function LabeledInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  helperText,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  helperText?: string;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: "text.primary", mb: 1 }}>
        {label}
      </Typography>
      <TextField
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        fullWidth
        autoComplete={autoComplete}
        helperText={helperText}
        sx={{
          "& .MuiOutlinedInput-root": {
            bgcolor: "#ffffff",
            "& fieldset": { borderColor: "#f0e4e2" },
            "&:hover fieldset": { borderColor: "#dfbfbc" },
            "&.Mui-focused fieldset": { borderColor: "#a93533" },
          },
          "& .MuiInputBase-input::placeholder": { color: "#999999", opacity: 1 },
        }}
      />
    </Box>
  );
}

const CRAFTS = [
  { id: "luxury", label: "Luxury Resortwear" },
  { id: "streetwear", label: "Streetwear" },
  { id: "sustainable", label: "Sustainable Basics" },
  { id: "avant-garde", label: "Avant-Garde Tailoring" },
  { id: "fast-fashion", label: "Fast Fashion Growth" },
  { id: "activewear", label: "Activewear" },
];

export function SignupPage() {
  const navigate = useNavigate();
  const { signupUser } = useAuth();
  const [step, setStep] = useState<"signup" | "onboarding">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCrafts, setSelectedCrafts] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleCraft(id: string) {
    setSelectedCrafts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signupUser(email, password, name);
      setStep("onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (step === "onboarding") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#fff8f7",
          p: 3,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: -160,
            right: -160,
            width: 320,
            height: 320,
            borderRadius: "50%",
            bgcolor: "rgba(169,53,51,0.05)",
            filter: "blur(80px)",
            pointerEvents: "none",
          }}
        />

        <Box sx={{ width: "100%", maxWidth: 900, position: "relative" }}>
          <Box sx={{ textAlign: "center", mb: 8 }}>
            <Typography
              sx={{
                color: "primary.main",
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                mb: 2,
              }}
            >
              Step 2 of 2
            </Typography>
            <Typography
              sx={{
                fontFamily: "'Literata', Georgia, serif",
                fontSize: { xs: 32, md: 44 },
                fontWeight: 700,
                color: "text.primary",
                mb: 2,
              }}
            >
              What defines your craft?
            </Typography>
            <Typography
              sx={{
                fontFamily: "'Literata', Georgia, serif",
                fontSize: 17,
                color: "text.secondary",
                maxWidth: 560,
                mx: "auto",
                lineHeight: 1.7,
              }}
            >
              Select the domains that anchor your creative vision. Centoire AI will calibrate
              its trend analysis to these specific verticals.
            </Typography>
          </Box>

          <Grid container spacing={2} sx={{ mb: 5 }}>
            {CRAFTS.map((craft) => {
              const active = selectedCrafts.includes(craft.id);
              return (
                <Grid key={craft.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Box
                    onClick={() => toggleCraft(craft.id)}
                    sx={{
                      p: 3,
                      borderRadius: "12px",
                      border: active ? "2px solid #a93533" : "2px solid #f0e4e2",
                      bgcolor: active ? "rgba(169,53,51,0.06)" : "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.2s",
                      "&:hover": {
                        borderColor: active ? "#a93533" : "#dfbfbc",
                      },
                    }}
                  >
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>
                      {craft.label}
                    </Typography>
                    {active && (
                      <CheckIcon sx={{ fontSize: 18, color: "primary.main", flexShrink: 0, ml: 1 }} />
                    )}
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => setStep("signup")}
              sx={{ color: "#999999", "&:hover": { color: "text.primary" } }}
            >
              Back
            </Button>

            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 11, color: "#999999", textTransform: "uppercase", letterSpacing: "0.1em", mb: 1.5 }}>
                {selectedCrafts.length} of 6 selected
              </Typography>
              <Button
                variant="contained"
                disabled={selectedCrafts.length === 0}
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate("/dashboard")}
                sx={{
                  px: 4,
                  py: 1.5,
                  borderRadius: "10px",
                  fontWeight: 600,
                  boxShadow: "0 4px 14px rgba(169,53,51,0.25)",
                }}
              >
                Continue to Dashboard
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex" }}>
      {/* Left: illustration panel */}
      <Box sx={{ display: { xs: "none", md: "flex" }, width: "50%", maxWidth: 600 }}>
        <AuthIllustration />
      </Box>

      {/* Right: form */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#fff8f7",
          p: { xs: 3, sm: 6 },
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: 80,
            right: 40,
            width: 240,
            height: 240,
            borderRadius: "50%",
            bgcolor: "rgba(169,53,51,0.05)",
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />

      <Box sx={{ width: "100%", maxWidth: 400, position: "relative" }}>
        <Box sx={{ textAlign: "center", mb: 5 }}>
          <Typography
            sx={{
              fontFamily: "'Literata', Georgia, serif",
              fontSize: 36,
              fontWeight: 700,
              color: "text.primary",
              lineHeight: 1,
              mb: 1,
            }}
          >
            CENTOIRE
          </Typography>
          <Typography sx={{ color: "primary.main", fontWeight: 500, fontSize: 15 }}>
            Join the Future of Fashion Intelligence
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSignup} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <LabeledInput
            label="Full Name"
            value={name}
            onChange={setName}
            placeholder="Alexander McQueen"
            required
            autoComplete="name"
          />
          <LabeledInput
            label="Email Address"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="creative@studio.com"
            required
            autoComplete="email"
          />
          <LabeledInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            helperText="Minimum 6 characters"
          />

          <Typography sx={{ fontSize: 12, color: "#999999", lineHeight: 1.6, mt: -0.5 }}>
            I agree to the{" "}
            <Link href="#" sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="#" sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              Privacy Policy
            </Link>
          </Typography>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            endIcon={<ArrowForwardIcon sx={{ transition: "transform 0.2s" }} />}
            sx={{
              py: 1.5,
              fontSize: 15,
              fontWeight: 600,
              borderRadius: "10px",
              boxShadow: "0 4px 14px rgba(169,53,51,0.25)",
              "&:hover": {
                boxShadow: "0 6px 20px rgba(169,53,51,0.35)",
                "& .MuiButton-endIcon svg": { transform: "translateX(3px)" },
              },
            }}
          >
            {loading ? "Creating workspace…" : "Create Workspace"}
          </Button>
        </Box>

        <Typography variant="body2" sx={{ mt: 4, textAlign: "center", color: "#999999" }}>
          Already have a workspace?{" "}
          <Link
            component={RouterLink}
            to="/login"
            sx={{ color: "primary.main", fontWeight: 500, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
          >
            Sign in
          </Link>
        </Typography>
      </Box>
      </Box>
    </Box>
  );
}

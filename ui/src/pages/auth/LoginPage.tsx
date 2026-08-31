import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Box, Typography, TextField, Button, Alert, Link,
  IconButton, InputAdornment,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useAuth } from "../../lib/auth-context";

function LabeledInput({
  label, type = "text", value, onChange, placeholder, required, autoComplete, endAdornment,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  endAdornment?: React.ReactNode;
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
        InputProps={{ endAdornment }}
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

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/app/looks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex" }}>
      {/* Left illustration panel */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          width: "50%",
          maxWidth: 600,
          bgcolor: "#a93533",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 3,
          p: 6,
        }}
      >
        <Typography
          sx={{
            fontFamily: "'Literata', Georgia, serif",
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          Fashion Intelligence Studio
        </Typography>
        <Typography sx={{ color: "rgba(255,255,255,0.7)", fontSize: 17, lineHeight: 1.7 }}>
          Curate looks, deconstruct garments, and build AI-powered collections — all in one place.
        </Typography>
      </Box>

      {/* Right form */}
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
        <Box sx={{ position: "absolute", top: 80, right: -80, width: 240, height: 240, borderRadius: "50%", bgcolor: "rgba(169,53,51,0.05)", filter: "blur(60px)", pointerEvents: "none" }} />
        <Box sx={{ position: "absolute", bottom: 80, left: -80, width: 240, height: 240, borderRadius: "50%", bgcolor: "rgba(0,108,77,0.03)", filter: "blur(60px)", pointerEvents: "none" }} />

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
              FASHIONARE
            </Typography>
            <Typography sx={{ color: "primary.main", fontWeight: 500, fontSize: 15 }}>
              Welcome Back
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
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
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              endAdornment={
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" size="small" sx={{ color: "#999999" }}>
                    {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              }
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              endIcon={<ArrowForwardIcon />}
              sx={{
                py: 1.5,
                fontSize: 15,
                fontWeight: 600,
                borderRadius: "10px",
                mt: 0.5,
                boxShadow: "0 4px 14px rgba(169,53,51,0.25)",
                "&:hover": { boxShadow: "0 6px 20px rgba(169,53,51,0.35)" },
              }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </Box>

          <Typography variant="body2" sx={{ mt: 4, textAlign: "center", color: "#999999" }}>
            Don't have an account?{" "}
            <Link
              component={RouterLink}
              to="/onboarding"
              sx={{ color: "primary.main", fontWeight: 500, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
            >
              Sign up
            </Link>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default LoginPage;

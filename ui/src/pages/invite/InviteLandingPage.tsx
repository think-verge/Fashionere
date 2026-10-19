import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BusinessIcon from "@mui/icons-material/Business";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth-context";

interface PreviewResponse {
  valid: boolean;
  email: string;
  tenant_id: string;
  tenant_name: string;
  expires_at?: string;
  already_accepted?: boolean;
}

export function InviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store pending invite in sessionStorage so login/signup flows carry it
  useEffect(() => {
    if (token) {
      sessionStorage.setItem("pending_tenant_invite", token);
    }
  }, [token]);

  const { data: preview, isLoading: previewLoading, isError, error } = useQuery<PreviewResponse>({
    queryKey: ["invite-preview", token],
    queryFn: async () => {
      const { data } = await api.get(`/invites/${token}/preview`);
      return data;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/invites/${token}/accept`);
      return data;
    },
    onSuccess: () => {
      sessionStorage.removeItem("pending_tenant_invite");
      setAcceptedSuccess(true);
    },
    onError: (err: any) => {
      setErrorMessage(
        err.response?.data?.detail || err.response?.data?.message || err.message || "Failed to accept invitation. Please try again."
      );
    },
  });

  if (previewLoading || authLoading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#faf8f7" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (isError || !preview) {
    const errText = (error as any)?.response?.data?.message || "This invitation link is invalid or has expired.";
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#faf8f7", p: 3 }}>
        <Paper
          elevation={0}
          sx={{
            maxWidth: 480,
            width: "100%",
            p: 4,
            textAlign: "center",
            borderRadius: "20px",
            border: "1px solid #f0e4e2",
            boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
          }}
        >
          <ErrorOutlineIcon color="error" sx={{ fontSize: 56, mb: 2 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            Invitation Expired or Invalid
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 14, mb: 3 }}>
            {errText}
          </Typography>
          <Button variant="outlined" onClick={() => navigate("/app/looks")} sx={{ borderRadius: "20px", textTransform: "none" }}>
            Return to Fashionere
          </Button>
        </Paper>
      </Box>
    );
  }

  if (preview.already_accepted || acceptedSuccess) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#faf8f7", p: 3 }}>
        <Paper
          elevation={0}
          sx={{
            maxWidth: 500,
            width: "100%",
            p: 4.5,
            textAlign: "center",
            borderRadius: "20px",
            border: "1px solid #e1eedd",
            bgcolor: "#ffffff",
            boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
          }}
        >
          <CheckCircleOutlineIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}>
            Access Granted!
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 14, mb: 3 }}>
            You now have full access to browse, deconstruct, and utilize private looks from <strong>{preview.tenant_name}</strong>.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            endIcon={<ArrowForwardIcon />}
            onClick={() => navigate("/app/looks")}
            sx={{ borderRadius: "24px", px: 4, py: 1.25, fontWeight: 600, textTransform: "none" }}
          >
            Explore Curated Looks
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#faf8f7", p: 3 }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: 520,
          width: "100%",
          p: 4.5,
          textAlign: "center",
          borderRadius: "24px",
          border: "1px solid #f0e4e2",
          bgcolor: "#ffffff",
          boxShadow: "0 12px 36px rgba(175, 44, 44, 0.08)",
        }}
      >
        <Box
          sx={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            bgcolor: "#fff0ef",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mx: "auto",
            mb: 2.5,
          }}
        >
          <LockOpenIcon sx={{ fontSize: 30 }} />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: "text.primary" }}>
          You're Invited to Access
        </Typography>

        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, my: 1.5, px: 2, py: 0.75, bgcolor: "#fbf6f5", borderRadius: "16px", border: "1px solid #f0e4e2" }}>
          <BusinessIcon sx={{ color: "primary.main", fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: 17, color: "primary.main" }}>
            {preview.tenant_name}
          </Typography>
        </Box>

        <Typography sx={{ color: "text.secondary", fontSize: 14, my: 2 }}>
          Fashionere Admin has invited you to collaborate and view private looks, silhouettes, and concepts from this brand.
        </Typography>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 3, textAlign: "left" }}>
            {errorMessage}
          </Alert>
        )}

        {user ? (
          <Box sx={{ mt: 3 }}>
            <Box sx={{ mb: 3, p: 2, bgcolor: "#faf8f7", borderRadius: "12px", border: "1px solid #f0e4e2" }}>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Logged in as:
              </Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>
                {user.email}
              </Typography>
            </Box>

            <Button
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
              sx={{
                borderRadius: "24px",
                py: 1.4,
                fontWeight: 600,
                fontSize: 15,
                textTransform: "none",
                boxShadow: "0 4px 14px rgba(175, 44, 44, 0.25)",
              }}
            >
              {acceptMutation.isPending ? "Connecting..." : "Accept Invitation"}
            </Button>
          </Box>
        ) : (
          <Box sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Button
              component={Link}
              to={`/login?redirect=/invite/${token}`}
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              sx={{
                borderRadius: "24px",
                py: 1.4,
                fontWeight: 600,
                fontSize: 15,
                textTransform: "none",
              }}
            >
              Log in to Accept
            </Button>

            <Button
              component={Link}
              to={`/signup?invite=${token}&email=${encodeURIComponent(preview.email)}`}
              variant="outlined"
              size="large"
              fullWidth
              sx={{
                borderRadius: "24px",
                py: 1.4,
                fontWeight: 600,
                fontSize: 15,
                textTransform: "none",
                borderColor: "#d9d0cf",
                color: "text.primary",
                "&:hover": { borderColor: "primary.main", bgcolor: "#fff0ef" },
              }}
            >
              Create New Account
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

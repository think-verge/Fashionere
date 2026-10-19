import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Alert,
  CircularProgress,
  Chip,
  Tabs,
  Tab,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing";
import { api } from "../lib/api/client";

interface BrandRequestItem {
  _id: string;
  brand_name: string;
  source_type: "runway" | "retail";
  season?: string;
  reference_url?: string;
  notes?: string;
  status: "pending" | "approved" | "deconstructing" | "completed" | "rejected";
  rejection_reason?: string;
  createdAt: string;
}

interface RequestBrandDialogProps {
  open: boolean;
  onClose: () => void;
  defaultType?: "runway" | "retail";
}

export function RequestBrandDialog({ open, onClose, defaultType = "runway" }: RequestBrandDialogProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"new" | "history">("new");
  const [brandName, setBrandName] = useState("");
  const [sourceType, setSourceType] = useState<"runway" | "retail">(defaultType);
  const [season, setSeason] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch my tenant's requested brands
  const { data: myRequests = [], isLoading: loadingHistory } = useQuery<BrandRequestItem[]>({
    queryKey: ["my-brand-requests"],
    queryFn: async () => {
      const { data } = await api.get("/brand-requests/my");
      return data.requests ?? [];
    },
    enabled: open,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/brand-requests", {
        brand_name: brandName.trim(),
        source_type: sourceType,
        season: season.trim() || undefined,
        reference_url: referenceUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-brand-requests"] });
      setSuccessMessage(`Request for '${brandName.trim()}' submitted! Super Admin will review it.`);
      setErrorMessage(null);
      setBrandName("");
      setSeason("");
      setReferenceUrl("");
      setNotes("");
      setTimeout(() => {
        setSuccessMessage(null);
        setTab("history");
      }, 1500);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      setErrorMessage(
        error.response?.data?.detail || error.response?.data?.message || error.message || "Failed to submit brand request."
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) {
      setErrorMessage("Please enter a brand name.");
      return;
    }
    setErrorMessage(null);
    submitMutation.mutate();
  };

  const getStatusChip = (status: BrandRequestItem["status"]) => {
    switch (status) {
      case "completed":
        return <Chip size="small" icon={<CheckCircleOutlineIcon />} label="Available" color="success" />;
      case "deconstructing":
        return <Chip size="small" icon={<PrecisionManufacturingIcon />} label="Deconstructing" color="secondary" />;
      case "approved":
        return <Chip size="small" icon={<AccessTimeIcon />} label="Approved" color="info" />;
      case "rejected":
        return <Chip size="small" icon={<ErrorOutlineIcon />} label="Rejected" color="error" />;
      default:
        return <Chip size="small" label="Pending Review" color="warning" />;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "20px",
          p: 1,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: "10px",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
            }}
          >
            <AutoAwesomeIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
              Request a Brand Source
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Request new designer or retail labels to be deconstructed into your catalog
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, pt: 1, borderBottom: "1px solid #f0e4e2" }}>
        <Tabs
          value={tab}
          onChange={(_, val) => {
            setTab(val);
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab value="new" label="New Request" sx={{ textTransform: "none", fontWeight: 600, fontSize: 13 }} />
          <Tab
            value="history"
            label={`My Requests (${myRequests.length})`}
            sx={{ textTransform: "none", fontWeight: 600, fontSize: 13 }}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ pt: 2.5 }}>
        {tab === "new" ? (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {errorMessage && (
              <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ borderRadius: "10px" }}>
                {errorMessage}
              </Alert>
            )}

            {successMessage && (
              <Alert severity="success" sx={{ borderRadius: "10px" }}>
                {successMessage}
              </Alert>
            )}

            <TextField
              label="Brand Name *"
              placeholder="e.g. Jacquemus, Loewe, Zara Studio"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              fullWidth
              size="small"
              disabled={submitMutation.isPending}
              required
            />

            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", mb: 0.5 }}>
                Catalog Source Type
              </FormLabel>
              <RadioGroup
                row
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as "runway" | "retail")}
              >
                <FormControlLabel
                  value="runway"
                  control={<Radio size="small" />}
                  label={<Typography sx={{ fontSize: 13 }}>Runway Designer Collection</Typography>}
                />
                <FormControlLabel
                  value="retail"
                  control={<Radio size="small" />}
                  label={<Typography sx={{ fontSize: 13 }}>Retail Commercial Trend</Typography>}
                />
              </RadioGroup>
            </FormControl>

            <TextField
              label="Season / Collection (Optional)"
              placeholder="e.g. Fall 2025, Spring 2026, Resort"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              fullWidth
              size="small"
              disabled={submitMutation.isPending}
            />

            <TextField
              label="Reference URL (Optional)"
              placeholder="https://vogue.com/fashion-shows/... or store URL"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              fullWidth
              size="small"
              disabled={submitMutation.isPending}
            />

            <TextField
              label="Notes or specific looks desired (Optional)"
              placeholder="Add any specific silhouettes or styles you want deconstructed..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              fullWidth
              size="small"
              disabled={submitMutation.isPending}
            />
          </Box>
        ) : (
          <Box sx={{ minHeight: 220, display: "flex", flexDirection: "column", gap: 1.5 }}>
            {loadingHistory ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : myRequests.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
                <Typography sx={{ fontSize: 14 }}>No brand requests submitted yet.</Typography>
                <Typography variant="caption">
                  Click on the "New Request" tab to request a fashion brand for deconstruction.
                </Typography>
              </Box>
            ) : (
              myRequests.map((req) => (
                <Box
                  key={req._id}
                  sx={{
                    p: 2,
                    borderRadius: "12px",
                    border: "1px solid #f0e4e2",
                    bgcolor: "#faf8f7",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{req.brand_name}</Typography>
                      <Chip
                        size="small"
                        label={req.source_type === "runway" ? "Runway" : "Retail"}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                      {req.season && (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          • {req.season}
                        </Typography>
                      )}
                    </Box>
                    {req.rejection_reason && req.status === "rejected" && (
                      <Typography variant="caption" sx={{ color: "error.main", display: "block" }}>
                        Reason: {req.rejection_reason}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Requested {new Date(req.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box>{getStatusChip(req.status)}</Box>
                </Box>
              ))
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ borderRadius: "20px", textTransform: "none", color: "text.secondary" }}>
          Close
        </Button>
        {tab === "new" && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={!brandName.trim() || submitMutation.isPending}
            sx={{ borderRadius: "20px", px: 3, fontWeight: 600, textTransform: "none" }}
          >
            {submitMutation.isPending ? <CircularProgress size={16} color="inherit" /> : "Submit Request"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

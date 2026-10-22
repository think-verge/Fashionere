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
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SyncIcon from "@mui/icons-material/Sync";
import StorefrontIcon from "@mui/icons-material/Storefront";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import LaunchIcon from "@mui/icons-material/Launch";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { api } from "../lib/api/client";

export interface ShopifyStatus {
  connected: boolean;
  shop_domain: string | null;
  status: "active" | "disconnected" | "syncing" | "error";
  last_synced_at: string | null;
  sync_error: string | null;
  product_count: number;
  deconstructed_count?: number;
  scopes: string[];
}

interface ShopifyConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export function ShopifyConnectDialog({ open, onClose, onSyncComplete }: ShopifyConnectDialogProps) {
  const qc = useQueryClient();
  const [shopDomain, setShopDomain] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const { data: status, isLoading } = useQuery<ShopifyStatus>({
    queryKey: ["shopify-status"],
    queryFn: async () => {
      const { data } = await api.get("/shopify/status");
      return data;
    },
    enabled: open,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/shopify/sync");
      return data;
    },
    onSuccess: (data) => {
      setErrorMsg(null);
      setSuccessMsg(`Successfully imported ${data.imported_count} products from Shopify into your private looks.`);
      qc.invalidateQueries({ queryKey: ["shopify-status"] });
      qc.invalidateQueries({ queryKey: ["looks"] });
      qc.invalidateQueries({ queryKey: ["looks-filters"] });
      if (onSyncComplete) onSyncComplete();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setErrorMsg(e.response?.data?.detail || e.message || "Failed to sync catalogue");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/shopify/disconnect");
      return data;
    },
    onSuccess: () => {
      setErrorMsg(null);
      setSuccessMsg("Shopify store disconnected successfully.");
      setConfirmDisconnect(false);
      qc.invalidateQueries({ queryKey: ["shopify-status"] });
      qc.invalidateQueries({ queryKey: ["looks"] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setErrorMsg(e.response?.data?.detail || e.message || "Failed to disconnect store");
    },
  });

  const handleConnect = async (customShop?: string) => {
    const targetShop = customShop || shopDomain.trim();
    if (!targetShop) {
      setErrorMsg("Please enter your Shopify store name or myshopify.com domain");
      return;
    }

    try {
      setConnecting(true);
      setErrorMsg(null);
      const { data } = await api.get("/shopify/auth", {
        params: { shop: targetShop },
      });

      if (data?.auth_url) {
        // Redirect to Shopify OAuth authorization screen
        window.location.href = data.auth_url;
      } else {
        setErrorMsg("Unable to initiate OAuth redirect.");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setErrorMsg(e.response?.data?.detail || e.message || "Failed to start Shopify connection");
    } finally {
      setConnecting(false);
    }
  };

  const handleClose = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmDisconnect(false);
    onClose();
  };

  const isConnected = Boolean(status?.connected);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: "20px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.15)",
            bgcolor: "#fffdfc",
            overflow: "hidden",
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1, pt: 2.5, px: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              bgcolor: isConnected ? "rgba(46, 125, 50, 0.1)" : "rgba(175, 44, 44, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isConnected ? "#2e7d32" : "primary.main",
            }}
          >
            <StorefrontIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
              Shopify Store Integration
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
              Sync private brand catalogue & looks
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={handleClose} sx={{ color: "text.secondary" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2 }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: "12px", fontSize: 13 }} onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}
        {successMsg && (
          <Alert severity="success" sx={{ mb: 2, borderRadius: "12px", fontSize: 13 }} onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ py: 6, display: "flex", justifyContent: "center", alignItems: "center", gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Loading connection status...</Typography>
          </Box>
        ) : isConnected ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Status Card */}
            <Box
              sx={{
                p: 2.5,
                borderRadius: "16px",
                bgcolor: "rgba(46, 125, 50, 0.04)",
                border: "1px solid rgba(46, 125, 50, 0.2)",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CheckCircleOutlineIcon sx={{ color: "#2e7d32", fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 15, color: "#1b5e20" }}>
                    Connected Store
                  </Typography>
                </Box>
                <Chip
                  label="Active"
                  size="small"
                  sx={{
                    bgcolor: "#e8f5e9",
                    color: "#2e7d32",
                    fontWeight: 700,
                    fontSize: 12,
                    height: 24,
                  }}
                />
              </Box>

              <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.primary", mb: 0.5 }}>
                {status?.shop_domain}
              </Typography>

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mt: 1.5, pt: 1.5, borderTop: "1px dashed rgba(46, 125, 50, 0.2)" }}>
                <Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", fontWeight: 700 }}>
                    Imported Looks
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary" }}>
                    {status?.product_count ?? 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", fontWeight: 700 }}>
                    Deconstructed
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#2e7d32" }}>
                    {status?.deconstructed_count ?? 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "uppercase", fontWeight: 700 }}>
                    Last Synced
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}>
                    {status?.last_synced_at
                      ? new Date(status.last_synced_at).toLocaleString()
                      : "Not synced yet"}
                  </Typography>
                </Box>
              </Box>

              {status?.sync_error && (
                <Alert
                  severity="warning"
                  icon={<ErrorOutlineIcon fontSize="inherit" />}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      disabled={syncMutation.isPending}
                      onClick={() => syncMutation.mutate()}
                      sx={{ fontSize: 11, fontWeight: 700, textTransform: "none" }}
                    >
                      {syncMutation.isPending ? "Retrying..." : "Retry Sync"}
                    </Button>
                  }
                  sx={{ mt: 1.5, borderRadius: "10px", fontSize: 12, alignItems: "center" }}
                >
                  Last sync note: {status.sync_error}
                </Alert>
              )}
            </Box>

            {/* Sync Controls */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
                startIcon={syncMutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
                sx={{
                  py: 1.2,
                  borderRadius: "12px",
                  fontWeight: 600,
                  fontSize: 14,
                  textTransform: "none",
                  boxShadow: "0 4px 14px rgba(175, 44, 44, 0.25)",
                }}
              >
                {syncMutation.isPending ? "Syncing Catalogue..." : "Sync Catalogue Products Now"}
              </Button>
              <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "center" }}>
                Pulls the latest catalog updates from your store into your private tenant looks.
              </Typography>
            </Box>

            <Divider sx={{ my: 0.5 }} />

            {/* Disconnect Section */}
            {confirmDisconnect ? (
              <Box sx={{ p: 2, borderRadius: "12px", bgcolor: "#fff1f0", border: "1px solid #ffccc7" }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#cf1322", mb: 1.5 }}>
                  Are you sure you want to disconnect this Shopify store?
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    disabled={disconnectMutation.isPending}
                    onClick={() => disconnectMutation.mutate()}
                    sx={{ borderRadius: "8px", textTransform: "none", fontSize: 12, fontWeight: 600 }}
                  >
                    {disconnectMutation.isPending ? "Disconnecting..." : "Yes, Disconnect"}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setConfirmDisconnect(false)}
                    sx={{ borderRadius: "8px", textTransform: "none", fontSize: 12 }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Button
                variant="text"
                color="inherit"
                size="small"
                startIcon={<LinkOffIcon />}
                onClick={() => setConfirmDisconnect(true)}
                sx={{
                  alignSelf: "flex-start",
                  color: "text.secondary",
                  textTransform: "none",
                  fontSize: 12,
                  "&:hover": { color: "error.main" },
                }}
              >
                Disconnect Shopify store
              </Button>
            )}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 13 }}>
              Connect your brand’s Shopify store to automatically import your seasonal styles, products, and color variants into your tenant-isolated private looks collection.
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <TextField
                label="Shopify Store Domain or Name"
                placeholder="e.g. acne-studios or my-brand.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                size="small"
                fullWidth
                slotProps={{
                  input: {
                    sx: { borderRadius: "12px" },
                  },
                }}
                helperText="Enter your *.myshopify.com handle or full URL"
              />
            </Box>

            <Button
              variant="contained"
              color="primary"
              fullWidth
              disabled={connecting}
              onClick={() => handleConnect()}
              startIcon={connecting ? <CircularProgress size={18} color="inherit" /> : <LaunchIcon />}
              sx={{
                py: 1.2,
                borderRadius: "12px",
                fontWeight: 600,
                fontSize: 14,
                textTransform: "none",
                boxShadow: "0 4px 14px rgba(175, 44, 44, 0.25)",
              }}
            >
              {connecting ? "Connecting to Shopify..." : "Connect Shopify Store"}
            </Button>

            {/* Quick Sandbox Connect Helper */}
            <Box
              sx={{
                p: 2,
                borderRadius: "14px",
                bgcolor: "#f7f4f2",
                border: "1px dashed #e5d7d3",
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                Testing / Development Sandbox Mode:
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
                No live Shopify app credentials are required. You can connect a sandbox store to test catalogue import with realistic fashion product fixtures.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setShopDomain("fashion-sandbox-store");
                  handleConnect("fashion-sandbox-store");
                }}
                disabled={connecting}
                sx={{
                  borderRadius: "10px",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "none",
                  borderColor: "#d5c3bd",
                  color: "text.primary",
                }}
              >
                Quick Connect Sandbox Store
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={handleClose} sx={{ borderRadius: "10px", textTransform: "none", fontSize: 13 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

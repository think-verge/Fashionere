import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Skeleton,
  InputAdornment,
} from "@mui/material";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import BusinessIcon from "@mui/icons-material/Business";
import { api } from "../../lib/api/client";
import { PageHeader } from "../../components/PageHeader";

interface TenantItem {
  _id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

interface InviteItem {
  _id: string;
  token: string;
  email: string;
  tenant_id: string;
  tenant_name: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  createdAt: string;
  invited_by?: { name: string; email: string };
  accepted_by?: { name: string; email: string };
}

export function AdminInvitesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [targetTenantId, setTargetTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

  // Fetch tenants
  const { data: tenantsData, isLoading: loadingTenants } = useQuery<{ tenants: TenantItem[] }>({
    queryKey: ["admin-tenants"],
    queryFn: async () => {
      const { data } = await api.get("/admin/tenants");
      return data;
    },
  });

  // Fetch invites
  const { data: invitesData, isLoading: loadingInvites } = useQuery<{ invites: InviteItem[] }>({
    queryKey: ["admin-invites"],
    queryFn: async () => {
      const { data } = await api.get("/admin/invites");
      return data;
    },
  });

  // Create invite mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/admin/invites", {
        email: email.trim(),
        tenant_id: targetTenantId,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
      setCreatedUrl(data.invite_url);
      setToast({ msg: "Invitation created successfully!", severity: "success" });
    },
    onError: (err: any) => {
      setToast({
        msg: err.response?.data?.message || err.message || "Failed to create invitation",
        severity: "error",
      });
    },
  });

  // Revoke invite mutation
  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/invites/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
      setToast({ msg: "Invitation revoked", severity: "success" });
    },
    onError: (err: any) => {
      setToast({
        msg: err.response?.data?.message || err.message || "Failed to revoke invitation",
        severity: "error",
      });
    },
  });

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setToast({ msg: "Invitation link copied to clipboard!", severity: "success" });
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEmail("");
    setTargetTenantId("");
    setCreatedUrl(null);
  };

  const tenants = tenantsData?.tenants || [];
  const invites = invitesData?.invites || [];

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", pb: 8 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 4 }}>
        <PageHeader
          eyebrow="Tenant Management"
          heading="Access & Collaboration Invites"
          description="Invite users and teams to collaborate and access private tenant looks and workspaces."
        />
        <Button
          variant="contained"
          color="primary"
          startIcon={<PersonAddAlt1Icon />}
          onClick={() => {
            setCreatedUrl(null);
            setModalOpen(true);
          }}
          sx={{
            borderRadius: "24px",
            px: 3,
            py: 1,
            fontWeight: 600,
            textTransform: "none",
            boxShadow: "0 4px 14px rgba(175, 44, 44, 0.25)",
            flexShrink: 0,
            mt: 2,
          }}
        >
          Invite User to Tenant
        </Button>
      </Box>

      {/* Invites List */}
      <Paper
        elevation={0}
        sx={{
          border: "1px solid #f0e4e2",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,0.03)",
        }}
      >
        <Box sx={{ px: 3, py: 2.5, borderBottom: "1px solid #f0e4e2", bgcolor: "#faf8f7" }}>
          <Typography sx={{ fontWeight: 600, fontSize: 16, color: "text.primary" }}>
            Active & Past Invitations ({invites.length})
          </Typography>
        </Box>

        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: "#faf8f7" }}>
              <TableRow>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Invitee Email
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Shared Tenant
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Status
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Expires At
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Created
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingInvites ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton height={32} />
                    </TableCell>
                  </TableRow>
                ))
              ) : invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
                    <MailOutlineIcon sx={{ fontSize: 40, color: "#ccc", mb: 1, display: "block", mx: "auto" }} />
                    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>No invitations created yet.</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }}>
                      Click "Invite User to Tenant" to grant someone access to a brand's private looks.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                invites.map((inv) => {
                  const inviteUrl = `${window.location.origin}/invite/${inv.token}`;
                  return (
                    <TableRow key={inv._id} hover sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                      <TableCell sx={{ fontWeight: 500, fontSize: 14 }}>
                        {inv.email}
                      </TableCell>
                      <TableCell sx={{ fontSize: 14 }}>
                        <Chip
                          icon={<BusinessIcon style={{ fontSize: 15 }} />}
                          label={inv.tenant_name}
                          size="small"
                          sx={{ bgcolor: "#f5eee9", color: "#58413f", fontWeight: 600, fontSize: 12 }}
                        />
                      </TableCell>
                      <TableCell>
                        {inv.status === "accepted" && (
                          <Chip
                            label="Accepted"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: 11 }}
                          />
                        )}
                        {inv.status === "pending" && (
                          <Chip
                            label="Pending"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: 11 }}
                          />
                        )}
                        {inv.status === "revoked" && (
                          <Chip
                            label="Revoked"
                            size="small"
                            color="error"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: 11 }}
                          />
                        )}
                        {inv.status === "expired" && (
                          <Chip
                            label="Expired"
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: 11, color: "text.disabled", borderColor: "#ddd" }}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">
                        {inv.status === "pending" && (
                          <Box sx={{ display: "inline-flex", gap: 1 }}>
                            <Tooltip title="Copy invite link">
                              <IconButton size="small" onClick={() => handleCopy(inviteUrl)}>
                                <ContentCopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Revoke invitation">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => revokeMutation.mutate(inv._id)}
                              >
                                <BlockIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create Invite Modal */}
      <Dialog
        open={modalOpen}
        onClose={handleCloseModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: "16px", p: 1 },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>
          {createdUrl ? "Invitation Created!" : "Invite User to Tenant"}
        </DialogTitle>

        <DialogContent dividers sx={{ borderTop: "1px solid #f0e4e2", borderBottom: "1px solid #f0e4e2", py: 3 }}>
          {createdUrl ? (
            <Box sx={{ textAlign: "center", py: 1 }}>
              <CheckCircleOutlineIcon color="success" sx={{ fontSize: 52, mb: 1.5 }} />
              <Typography sx={{ fontWeight: 600, fontSize: 16, mb: 1 }}>
                Invite link generated for {email}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 3 }}>
                Share this link with the recipient. When they open it, they will be prompted to log in or sign up to accept access.
              </Typography>

              <TextField
                fullWidth
                value={createdUrl}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onClick={() => handleCopy(createdUrl)}
                        sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
                      >
                        Copy
                      </Button>
                    </InputAdornment>
                  ),
                }}
                sx={{ bgcolor: "#faf8f7", borderRadius: "8px" }}
              />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                Select the brand/tenant whose private looks will be accessible, and specify the invitee's email.
              </Typography>

              <TextField
                select
                label="Select Tenant to Share"
                value={targetTenantId}
                onChange={(e) => setTargetTenantId(e.target.value)}
                fullWidth
                disabled={loadingTenants}
              >
                {tenants.map((t) => (
                  <MenuItem key={t._id} value={t._id}>
                    {t.name} ({t.slug})
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Invitee Email Address"
                placeholder="designer@partnerbrand.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          {createdUrl ? (
            <Button onClick={handleCloseModal} variant="contained" sx={{ borderRadius: "20px" }}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={handleCloseModal} sx={{ color: "text.secondary" }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => createMutation.mutate()}
                disabled={!targetTenantId || !email.includes("@") || createMutation.isPending}
                sx={{ borderRadius: "20px", fontWeight: 600, px: 3 }}
              >
                {createMutation.isPending ? "Generating..." : "Generate Invite"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? <Alert severity={toast.severity}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

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
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  Alert,
  Skeleton,
  IconButton,
  Tooltip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { api } from "../../lib/api/client";
import { PageHeader } from "../../components/PageHeader";

interface BrandRequestItem {
  _id: string;
  brand_name: string;
  source_type: "runway" | "retail";
  season?: string;
  reference_url?: string;
  notes?: string;
  status: "pending" | "approved" | "deconstructing" | "completed" | "rejected";
  rejection_reason?: string;
  admin_notes?: string;
  createdAt: string;
  tenant_id?: { _id: string; name: string; slug: string; plan: string };
  requested_by?: { _id: string; name: string; email: string };
}

export function AdminBrandRequestsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

  // Fetch brand requests
  const { data: requestsData, isLoading } = useQuery<{ requests: BrandRequestItem[] }>({
    queryKey: ["admin-brand-requests", statusFilter, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (typeFilter !== "all") params.source_type = typeFilter;
      const { data } = await api.get("/admin/brand-requests", { params });
      return data;
    },
  });

  const requests = requestsData?.requests ?? [];

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      rejection_reason,
      admin_notes,
    }: {
      id: string;
      status: BrandRequestItem["status"];
      rejection_reason?: string;
      admin_notes?: string;
    }) => {
      const { data } = await api.patch(`/admin/brand-requests/${id}`, {
        status,
        rejection_reason,
        admin_notes,
      });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-brand-requests"] });
      setToast({ msg: `Brand request status updated to '${vars.status}'`, severity: "success" });
      setRejectModalOpen(false);
      setSelectedRequestId(null);
      setRejectionReason("");
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      setToast({
        msg: error.response?.data?.detail || error.response?.data?.message || error.message || "Failed to update status",
        severity: "error",
      });
    },
  });

  const handleOpenReject = (id: string) => {
    setSelectedRequestId(id);
    setRejectionReason("");
    setRejectModalOpen(true);
  };

  const handleConfirmReject = () => {
    if (!selectedRequestId) return;
    updateStatusMutation.mutate({
      id: selectedRequestId,
      status: "rejected",
      rejection_reason: rejectionReason.trim() || undefined,
    });
  };

  const getStatusBadge = (status: BrandRequestItem["status"]) => {
    switch (status) {
      case "completed":
        return <Chip size="small" icon={<CheckCircleOutlineIcon />} label="Completed" color="success" />;
      case "deconstructing":
        return <Chip size="small" icon={<PrecisionManufacturingIcon />} label="Deconstructing" color="secondary" />;
      case "approved":
        return <Chip size="small" label="Approved" color="info" />;
      case "rejected":
        return <Chip size="small" icon={<CancelOutlinedIcon />} label="Rejected" color="error" />;
      default:
        return <Chip size="small" icon={<HourglassEmptyIcon />} label="Pending" color="warning" />;
    }
  };

  return (
    <Box>
      <PageHeader
        eyebrow="Super Admin Portal"
        heading="Brand Source Requests"
        description="Review incoming tenant requests to ingest and deconstruct new runway designer or retail brand catalogs."
      />

      {/* Filter Tabs */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {(["all", "pending", "approved", "deconstructing", "completed", "rejected"] as const).map((s) => (
            <Chip
              key={s}
              label={s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              clickable
              onClick={() => setStatusFilter(s)}
              color={statusFilter === s ? "primary" : "default"}
              variant={statusFilter === s ? "filled" : "outlined"}
              sx={{ fontWeight: 600, textTransform: "capitalize" }}
            />
          ))}
        </Box>

        <Box sx={{ display: "flex", gap: 1 }}>
          {(["all", "runway", "retail"] as const).map((t) => (
            <Chip
              key={t}
              label={t === "all" ? "All Sources" : t === "runway" ? "Runway" : "Retail"}
              clickable
              onClick={() => setTypeFilter(t)}
              color={typeFilter === t ? "primary" : "default"}
              variant={typeFilter === t ? "filled" : "outlined"}
              sx={{ fontWeight: 500 }}
            />
          ))}
        </Box>
      </Box>

      {/* Requests Table */}
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          borderRadius: "16px",
          border: "1px solid #f0e4e2",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
        }}
      >
        <Table>
          <TableHead sx={{ bgcolor: "#faf8f7" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}>Brand Name</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}>Requesting Tenant</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}>Season & Reference</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}>Requested Date</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary", textAlign: "right" }}>
                Pipeline Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton height={40} />
                  </TableCell>
                </TableRow>
              ))
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
                  <AutoAwesomeIcon sx={{ fontSize: 36, color: "#d9c7c4", mb: 1, display: "block", mx: "auto" }} />
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    No brand requests found
                  </Typography>
                  <Typography variant="caption">
                    Tenants will appear here when they request new brands from their Looks page.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r._id} hover sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{r.brand_name}</Typography>
                    {r.notes && (
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", maxWidth: 220 }}>
                        "{r.notes}"
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.source_type === "runway" ? "Runway" : "Retail"}
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        bgcolor: r.source_type === "runway" ? "#fcefe8" : "#e8f4fc",
                        color: r.source_type === "runway" ? "#af2c2c" : "#1976d2",
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 13 }}>
                      {r.tenant_id?.name || "Unknown Tenant"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                      by {r.requested_by?.name || r.requested_by?.email || "Unknown User"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {r.season && (
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{r.season}</Typography>
                    )}
                    {r.reference_url && (
                      <Button
                        size="small"
                        variant="text"
                        href={r.reference_url}
                        target="_blank"
                        rel="noreferrer"
                        endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                        sx={{ fontSize: 11, p: 0, textTransform: "none" }}
                      >
                        View Link
                      </Button>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, color: "text.secondary" }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(r.status)}
                    {r.rejection_reason && (
                      <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 0.5 }}>
                        {r.rejection_reason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ textAlign: "right" }}>
                    <Box sx={{ display: "inline-flex", gap: 0.75, alignItems: "center" }}>
                      {r.status === "pending" && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            color="info"
                            disabled={updateStatusMutation.isPending}
                            onClick={() => updateStatusMutation.mutate({ id: r._id, status: "approved" })}
                            sx={{ borderRadius: "12px", textTransform: "none", fontSize: 12, px: 1.5 }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={updateStatusMutation.isPending}
                            onClick={() => handleOpenReject(r._id)}
                            sx={{ borderRadius: "12px", textTransform: "none", fontSize: 12, px: 1.5 }}
                          >
                            Reject
                          </Button>
                        </>
                      )}

                      {r.status === "approved" && (
                        <Button
                          size="small"
                          variant="contained"
                          color="secondary"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: r._id, status: "deconstructing" })}
                          sx={{ borderRadius: "12px", textTransform: "none", fontSize: 12, px: 1.5 }}
                        >
                          Start Deconstruct
                        </Button>
                      )}

                      {r.status === "deconstructing" && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: r._id, status: "completed" })}
                          sx={{ borderRadius: "12px", textTransform: "none", fontSize: 12, px: 1.5 }}
                        >
                          Mark Completed
                        </Button>
                      )}

                      {(r.status === "completed" || r.status === "rejected") && (
                        <Tooltip title="Reset to Pending">
                          <IconButton
                            size="small"
                            onClick={() => updateStatusMutation.mutate({ id: r._id, status: "pending" })}
                          >
                            <HourglassEmptyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Reject Modal */}
      <Dialog
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: "16px", p: 1 } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Reject Brand Request</Typography>
          <IconButton size="small" onClick={() => setRejectModalOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
            Provide an optional reason why this brand request cannot be fulfilled at this time.
          </Typography>
          <TextField
            autoFocus
            label="Rejection Reason"
            placeholder="e.g. Catalog source unavailable or low resolution assets"
            fullWidth
            size="small"
            multiline
            rows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectModalOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmReject}
            disabled={updateStatusMutation.isPending}
            sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 600 }}
          >
            Confirm Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast Notification */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ borderRadius: "12px" }}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

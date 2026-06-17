import { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Divider,
  Avatar,
} from "@mui/material";
import { PageShell } from "../../components/PageShell";
import { useAuth } from "../../lib/auth-context";

export function SettingsPage() {
  const { user, saveProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await saveProfile(name);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Settings">
      <Box sx={{ maxWidth: 560 }}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 3 }}>
            Profile
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
            <Avatar
              sx={{
                width: 56,
                height: 56,
                bgcolor: "primary.dark",
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {user?.name?.[0]?.toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {user?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {success && <Alert severity="success" sx={{ mb: 2 }}>Profile saved.</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSave} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Email"
              value={user?.email ?? ""}
              disabled
              fullWidth
              helperText="Email cannot be changed"
            />
            <Button
              type="submit"
              variant="contained"
              disabled={saving || name === user?.name}
              sx={{ alignSelf: "flex-start" }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </Box>
        </Paper>
      </Box>
    </PageShell>
  );
}

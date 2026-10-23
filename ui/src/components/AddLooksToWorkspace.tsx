import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Snackbar } from "@mui/material";
import { WorkspacePicker } from "./WorkspacePicker";
import { api } from "../lib/api/client";
import { browserTimeZone } from "../lib/elements";

interface AddLookResult {
  added: number;
  skipped: number;
  already_in_workspace: boolean;
  folder_name: string;
}

interface Props {
  open: boolean;
  projectId: string;
  /** Looks to add; each is filed into the workspace's folder for today. */
  lookIds: string[];
  onClose: () => void;
  onDone?: () => void;
}

/**
 * Pick a workspace, then add whole looks to it. The server files each look's
 * deconstructed shots / silhouettes / palettes / fabrics / patterns into a
 * "<workspace>-<date>" folder under Looks.
 */
export function AddLooksToWorkspace({ open, projectId, lookIds, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [toast, setToast] = useState<{ msg: string; severity: "success" | "info" | "error"; wsId: string } | null>(null);

  async function handleSelect(wsId: string) {
    const results: AddLookResult[] = [];
    let failed = 0;
    let unprocessed = 0;
    // Sequential: the server creates the day folder on first add, so avoid racing it.
    for (const lookId of lookIds) {
      try {
        const { data } = await api.post(`/workspace/${wsId}/looks`, { look_id: lookId, tz: browserTimeZone() });
        results.push(data);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 422) unprocessed++; else failed++;
      }
    }
    qc.invalidateQueries({ queryKey: ["workspace", wsId] });
    qc.invalidateQueries({ queryKey: ["folders", wsId] });
    qc.removeQueries({ queryKey: ["workspaces"] });

    const added = results.filter((r) => !r.already_in_workspace);
    const dupes = results.length - added.length;
    const folder = added[0]?.folder_name;
    let msg: string;
    let severity: "success" | "info" | "error" = "success";
    if (added.length > 0) {
      msg = `${added.length} look${added.length !== 1 ? "s" : ""} filed in ${folder}`;
      if (dupes) msg += ` · ${dupes} already in this workspace`;
    } else if (dupes > 0) {
      msg = lookIds.length === 1 ? `Already in this workspace (${results[0].folder_name})` : "Those looks are already in this workspace";
      severity = "info";
    } else {
      msg = unprocessed ? "That look hasn't been deconstructed yet" : "Couldn't add — try again";
      severity = "error";
    }
    if (failed && added.length) msg += ` · ${failed} failed`;
    setToast({ msg, severity, wsId });
    onDone?.();
  }

  return (
    <>
      <WorkspacePicker
        open={open}
        projectId={projectId}
        onClose={onClose}
        onSelect={(wsId) => { onClose(); handleSelect(wsId); }}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={() => setToast(null)}
            action={
              <Button color="inherit" size="small" onClick={() => nav(`/app/workspace/${toast.wsId}`)}>
                View moodboard
              </Button>
            }
            sx={{ borderRadius: "10px" }}
          >
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

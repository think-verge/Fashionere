import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface Workspace {
  _id: string;
  name: string;
  status: "draft" | "ready" | "generating";
  elements: unknown[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-raisin/10 text-raisin/60",
  ready: "bg-green-100 text-green-700",
  generating: "bg-salmon/15 text-salmon",
};

export default function WorkspacesPage() {
  const { activeProject } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["workspaces", activeProject?.id],
    queryFn: async () => {
      const params = activeProject?.id ? { project_id: activeProject.id } : {};
      const { data } = await api.get("/workspace", { params });
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post("/workspace", {
        name,
        project_id: activeProject?.id,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setCreating(false);
      setNewName("");
    },
  });

  const handleCreate = () => {
    if (newName.trim()) create.mutate(newName.trim());
  };

  return (
    <div className="px-8 py-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="eyebrow text-deep-red mb-1">Project</p>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          {activeProject && <p className="text-sm text-raisin/50 mt-1">{activeProject.name}</p>}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-raisin text-white text-[11px] font-semibold tracking-[0.15em] uppercase px-5 py-2.5 hover:bg-deep-red transition-colors"
        >
          + New workspace
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="border border-raisin/15 p-5 mb-6 flex gap-3 items-center">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Workspace name…"
            className="flex-1 bg-transparent border-b border-raisin/20 py-2 text-[14px] outline-none focus:border-deep-red transition-colors"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || create.isPending}
            className="bg-raisin text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-2 hover:bg-deep-red transition-colors disabled:opacity-40"
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
          <button onClick={() => { setCreating(false); setNewName(""); }} className="text-raisin/40 hover:text-raisin text-sm transition-colors">
            Cancel
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-raisin/5 animate-pulse" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="border border-dashed border-raisin/20 p-12 text-center">
          <p className="text-raisin/40 text-sm">No workspaces yet.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-3 text-deep-red text-sm underline"
          >
            Create your first workspace →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <Link
              key={ws._id}
              to={`/app/workspace/${ws._id}`}
              className="border border-raisin/10 p-5 hover:border-raisin/30 transition-colors block group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-[14px] group-hover:text-deep-red transition-colors">{ws.name}</h3>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[ws.status]}`}>
                  {ws.status}
                </span>
              </div>
              <p className="text-[12px] text-raisin/50">
                {ws.elements.length} element{ws.elements.length !== 1 ? "s" : ""}
              </p>
              <p className="text-[11px] text-raisin/35 mt-2">
                {new Date(ws.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

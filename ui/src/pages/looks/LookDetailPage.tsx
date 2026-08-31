import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth-context";

interface GarmentElement {
  id: string;
  look_id: string;
  piece: string;
  garment_type: string;
  colors: Array<{ hex?: string; name?: string }>;
  fabric: { name?: string; type?: string };
  pattern: string | null;
  materials_candidates: string[];
}

interface Look {
  id: string;
  brand: string;
  season: string;
  year: number;
  source_type: "retail" | "runway";
  images: Array<{ url?: string; src?: string }>;
  is_deconstructed: boolean;
  garments: GarmentElement[];
}

interface Workspace {
  _id: string;
  name: string;
}

const ELEMENT_TYPES = ["color", "fabric", "pattern"] as const;

export default function LookDetailPage() {
  const { lookId } = useParams<{ lookId: string }>();
  const { activeProject } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const decoded = lookId ? decodeURIComponent(lookId) : "";

  const { data: look, isLoading, error } = useQuery<Look>({
    queryKey: ["look", decoded],
    queryFn: async () => {
      const { data } = await api.get(`/looks/${encodeURIComponent(decoded)}`);
      return data;
    },
    enabled: !!decoded,
  });

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces", activeProject?.id],
    queryFn: async () => {
      const params = activeProject?.id ? { project_id: activeProject.id } : {};
      const { data } = await api.get("/workspace", { params });
      return data;
    },
  });

  const addElement = useMutation({
    mutationFn: async ({ garment, type }: { garment: GarmentElement; type: string }) => {
      let wsId = selectedWorkspace;
      if (!wsId) {
        const { data: ws } = await api.post("/workspace", {
          name: `${look?.brand ?? "Look"} workspace`,
          project_id: activeProject?.id,
        });
        wsId = ws._id;
        qc.invalidateQueries({ queryKey: ["workspaces"] });
        setSelectedWorkspace(wsId);
      }

      let elementData: Record<string, unknown> = {};
      if (type === "color") elementData = { colors: garment.colors };
      else if (type === "fabric") elementData = { fabric: garment.fabric, materials: garment.materials_candidates };
      else if (type === "pattern") elementData = { pattern: garment.pattern };

      await api.post(`/workspace/${wsId}/elements`, {
        look_id: decoded,
        garment_id: garment.id,
        garment_type: garment.garment_type,
        element_type: type,
        data: elementData,
        source_brand: look?.brand ?? "",
        row: garment.garment_type,
      });
      return wsId;
    },
    onSuccess: (wsId) => {
      setToast("Added to workspace");
      setTimeout(() => setToast(null), 2000);
      qc.invalidateQueries({ queryKey: ["workspace", wsId] });
    },
  });

  if (isLoading) return (
    <div className="px-8 py-8">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-raisin/5 w-48" />
        <div className="aspect-[3/4] max-w-sm bg-raisin/5" />
      </div>
    </div>
  );

  if (error || !look) return (
    <div className="px-8 py-8">
      <p className="text-sm text-raisin/50">Look not found.</p>
    </div>
  );

  const mainImage = look.images?.[0];
  const imgSrc = mainImage?.url ?? mainImage?.src;

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Header */}
      <button onClick={() => nav(-1)} className="flex items-center gap-1.5 text-sm text-raisin/50 hover:text-raisin mb-6 transition-colors">
        ← Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-10">
        {/* Image */}
        <div>
          <div className="aspect-[3/4] bg-raisin/5 overflow-hidden">
            {imgSrc ? (
              <img src={imgSrc} alt={`${look.brand} ${look.season}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-12 h-12 text-raisin/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="mt-4">
            <h1 className="text-xl font-semibold capitalize">{look.brand}</h1>
            <p className="text-sm text-raisin/50 mt-0.5">{look.season} {look.year} · {look.source_type}</p>
          </div>
        </div>

        {/* Garments */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="eyebrow text-deep-red mb-1">Deconstruction</p>
              <h2 className="text-lg font-semibold">{look.garments.length} garment{look.garments.length !== 1 ? "s" : ""}</h2>
            </div>

            {/* Workspace selector */}
            <div className="flex items-center gap-2">
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="text-sm border border-raisin/15 bg-bg px-3 py-1.5 outline-none focus:border-raisin/40 min-w-[160px]"
              >
                <option value="">Auto workspace</option>
                {workspaces.map((ws) => (
                  <option key={ws._id} value={ws._id}>{ws.name}</option>
                ))}
              </select>
              {selectedWorkspace && (
                <button
                  onClick={() => nav(`/app/workspace/${selectedWorkspace}`)}
                  className="text-xs text-deep-red hover:underline"
                >
                  Open →
                </button>
              )}
            </div>
          </div>

          {look.garments.length === 0 ? (
            <div className="border border-raisin/10 p-6 text-sm text-raisin/40 text-center">
              No garment data available for this look.
            </div>
          ) : (
            <div className="space-y-4">
              {look.garments.map((garment) => (
                <GarmentCard
                  key={garment.id}
                  garment={garment}
                  onAdd={(type) => addElement.mutate({ garment, type })}
                  loading={addElement.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-raisin text-white text-sm px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function GarmentCard({ garment, onAdd, loading }: {
  garment: GarmentElement;
  onAdd: (type: string) => void;
  loading: boolean;
}) {
  return (
    <div className="border border-raisin/10 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="font-medium text-[14px] capitalize">{garment.piece}</p>
          <p className="text-[12px] text-raisin/50 mt-0.5 capitalize">{garment.garment_type}</p>
        </div>
      </div>

      {/* Elements */}
      <div className="space-y-3">
        {/* Colors */}
        {garment.colors.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 flex-1">
              {garment.colors.slice(0, 6).map((c, i) => (
                <div
                  key={i}
                  title={c.name}
                  className="w-5 h-5 rounded-full border border-raisin/10 flex-shrink-0"
                  style={{ backgroundColor: c.hex ?? "#ccc" }}
                />
              ))}
              <span className="text-[12px] text-raisin/50 self-center ml-1">{garment.colors[0]?.name}</span>
            </div>
            <AddButton label="Color" onClick={() => onAdd("color")} loading={loading} />
          </div>
        )}

        {/* Fabric */}
        {garment.fabric?.name && (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-raisin/70 flex-1">{garment.fabric.name}</span>
            <AddButton label="Fabric" onClick={() => onAdd("fabric")} loading={loading} />
          </div>
        )}

        {/* Pattern */}
        {garment.pattern && (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-raisin/70 flex-1 capitalize">{garment.pattern}</span>
            <AddButton label="Pattern" onClick={() => onAdd("pattern")} loading={loading} />
          </div>
        )}
      </div>
    </div>
  );
}

function AddButton({ label, onClick, loading }: { label: string; onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="text-[11px] font-semibold tracking-wider uppercase px-3 py-1.5 border border-raisin/20 hover:border-deep-red hover:text-deep-red transition-colors disabled:opacity-40 flex-shrink-0"
    >
      + {label}
    </button>
  );
}

import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";

interface WorkspaceElement {
  element_id: string;
  look_id: string;
  garment_id: string;
  garment_type: string;
  element_type: "color" | "fabric" | "pattern" | "silhouette";
  data: Record<string, unknown>;
  source_brand: string;
  row: string;
}

interface Workspace {
  _id: string;
  name: string;
  status: "draft" | "ready" | "generating";
  elements: WorkspaceElement[];
}

const ELEMENT_COLORS: Record<string, string> = {
  color: "bg-amber-50 border-amber-200 text-amber-800",
  fabric: "bg-blue-50 border-blue-200 text-blue-800",
  pattern: "bg-purple-50 border-purple-200 text-purple-800",
  silhouette: "bg-raisin/5 border-raisin/20 text-raisin/70",
};

export default function WorkspaceCanvas() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: ws, isLoading } = useQuery<Workspace>({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const { data } = await api.get(`/workspace/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const removeEl = useMutation({
    mutationFn: async (elementId: string) => {
      await api.delete(`/workspace/${id}/elements/${elementId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/workspace/${id}/generate`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", id] }),
  });

  if (isLoading) return (
    <div className="px-8 py-8">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-raisin/5 w-48" />
        <div className="h-48 bg-raisin/5" />
      </div>
    </div>
  );

  if (!ws) return (
    <div className="px-8 py-8">
      <p className="text-sm text-raisin/50">Workspace not found.</p>
    </div>
  );

  // Group elements by row (garment_type)
  const rows = new Map<string, WorkspaceElement[]>();
  for (const el of ws.elements) {
    const row = el.row || el.garment_type || "other";
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(el);
  }

  const isGenerating = ws.status === "generating";

  return (
    <div className="px-8 py-8 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <button onClick={() => nav(-1)} className="text-sm text-raisin/50 hover:text-raisin mb-3 transition-colors block">← Back</button>
          <h1 className="text-2xl font-semibold tracking-tight">{ws.name}</h1>
          <p className="text-sm text-raisin/50 mt-1">{ws.elements.length} elements</p>
        </div>

        <button
          onClick={() => generate.mutate()}
          disabled={ws.elements.length === 0 || isGenerating || generate.isPending}
          className="bg-deep-red text-white text-[12px] font-semibold tracking-[0.15em] uppercase px-6 py-3 hover:bg-raisin transition-colors disabled:opacity-40"
        >
          {isGenerating ? "Generating…" : "Generate Collection"}
        </button>
      </div>

      {isGenerating && (
        <div className="mb-6 px-5 py-4 bg-salmon/10 border border-salmon/20 text-sm text-salmon">
          Your collection is being generated. This may take a few minutes.
        </div>
      )}

      {/* Canvas */}
      {ws.elements.length === 0 ? (
        <div className="flex-1 border border-dashed border-raisin/15 flex items-center justify-center">
          <div className="text-center">
            <p className="text-raisin/40 text-sm mb-2">No elements yet.</p>
            <p className="text-raisin/30 text-xs">Go to a look and add color, fabric, or pattern elements.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto space-y-6">
          {[...rows.entries()].map(([rowKey, elements]) => (
            <div key={rowKey}>
              <div className="flex items-center gap-3 mb-3">
                <p className="eyebrow text-raisin/50 capitalize">{rowKey}</p>
                <div className="flex-1 h-px bg-raisin/10" />
              </div>
              <div className="flex flex-wrap gap-3">
                {elements.map((el) => (
                  <ElementCard
                    key={el.element_id}
                    element={el}
                    onRemove={() => removeEl.mutate(el.element_id)}
                    removing={removeEl.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ElementCard({ element, onRemove, removing }: {
  element: WorkspaceElement;
  onRemove: () => void;
  removing: boolean;
}) {
  const colors = (element.data?.colors as Array<{ hex?: string; name?: string }>) ?? [];
  const colorClass = ELEMENT_COLORS[element.element_type] ?? "bg-raisin/5 border-raisin/20";

  return (
    <div className={`border px-4 py-3 min-w-[140px] max-w-[200px] group relative ${colorClass}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{element.element_type}</p>
        <button
          onClick={onRemove}
          disabled={removing}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-current opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
        >
          ×
        </button>
      </div>

      {element.element_type === "color" && colors.length > 0 && (
        <div className="flex gap-1 mb-1">
          {colors.slice(0, 4).map((c, i) => (
            <div key={i} className="w-5 h-5 rounded-full border border-white/40" style={{ backgroundColor: c.hex ?? "#ccc" }} title={c.name} />
          ))}
        </div>
      )}

      {element.element_type === "fabric" && (
        <p className="text-[12px]">{(element.data?.fabric as { name?: string })?.name ?? "Unknown"}</p>
      )}

      {element.element_type === "pattern" && (
        <p className="text-[12px] capitalize">{element.data?.pattern as string ?? "—"}</p>
      )}

      <p className="text-[10px] opacity-50 mt-1.5 capitalize">{element.source_brand}</p>
    </div>
  );
}

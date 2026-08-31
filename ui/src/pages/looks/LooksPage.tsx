import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface LookSummary {
  id: string;
  brand: string;
  season: string;
  year: number;
  source_type: "retail" | "runway";
  thumbnail?: string;
  garment_count: number;
  is_deconstructed: boolean;
}

interface LookListResponse {
  looks: LookSummary[];
  total: number;
  next_cursor?: string;
}

export default function LooksPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState<string | undefined>();
  const [allLooks, setAllLooks] = useState<LookSummary[]>([]);

  const type = user?.role === "retail_chain" ? "retail" : "runway";

  const { data, isLoading, isFetching } = useQuery<LookListResponse>({
    queryKey: ["looks", type, cursor],
    queryFn: async () => {
      const params: Record<string, string> = { type, limit: "24" };
      if (cursor) params.cursor = cursor;
      const { data } = await api.get("/looks", { params });
      if (!cursor) {
        setAllLooks(data.looks);
      } else {
        setAllLooks((prev) => [...prev, ...data.looks]);
      }
      return data;
    },
  });

  const loadMore = () => {
    if (data?.next_cursor) setCursor(data.next_cursor);
  };

  return (
    <div className="px-8 py-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="eyebrow text-deep-red mb-1">
            {type === "retail" ? "Retail" : "Runway"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Looks</h1>
          {data && (
            <p className="text-sm text-raisin/50 mt-1">{data.total.toLocaleString()} looks</p>
          )}
        </div>
      </div>

      {isLoading && !allLooks.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-raisin/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {allLooks.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </div>

          {data?.next_cursor && (
            <div className="mt-10 flex justify-center">
              <button
                onClick={loadMore}
                disabled={isFetching}
                className="px-8 py-3 border border-raisin/20 text-[12px] font-semibold tracking-[0.15em] uppercase hover:border-raisin/50 transition-colors disabled:opacity-40"
              >
                {isFetching ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LookCard({ look }: { look: LookSummary }) {
  return (
    <Link to={`/app/looks/${encodeURIComponent(look.id)}`} className="group block">
      <div className="aspect-[3/4] bg-raisin/5 overflow-hidden relative mb-3">
        {look.thumbnail ? (
          <img
            src={look.thumbnail}
            alt={`${look.brand} ${look.season}`}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-raisin/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {look.is_deconstructed && (
          <div className="absolute top-2 right-2 bg-raisin text-white text-[9px] font-semibold tracking-widest px-2 py-0.5 uppercase">
            {look.garment_count}G
          </div>
        )}
      </div>
      <div>
        <p className="text-[13px] font-semibold capitalize">{look.brand}</p>
        <p className="text-[12px] text-raisin/50 mt-0.5">{look.season} {look.year}</p>
      </div>
    </Link>
  );
}

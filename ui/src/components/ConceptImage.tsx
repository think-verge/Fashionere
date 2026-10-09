import { useState, useEffect } from "react";
import { Box, Skeleton } from "@mui/material";

export function ConceptImage({ conceptId, sx }: { conceptId: string; sx?: object }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!conceptId || conceptId.startsWith("skeleton")) return;
    const ac = new AbortController();
    let objectUrl = "";
    const token = localStorage.getItem("fash_token") ?? "";
    fetch(`/api/v1/concepts/${conceptId}/image`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
      .then(async (resp) => {
        if (!resp.ok) return;
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => { ac.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [conceptId]);

  if (!src) return <Skeleton variant="rectangular" sx={{ width: "100%", height: "100%", ...sx }} />;
  return <Box component="img" src={src} sx={{ width: "100%", height: "100%", objectFit: "cover", ...sx }} />;
}

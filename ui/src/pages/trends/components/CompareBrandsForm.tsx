import { useState } from "react";
import { Autocomplete, Box, Button, TextField } from "@mui/material";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import type { TrendSheetSummary } from "../../../lib/api/generated/model";
import { brandLabel } from "./TrendReportCard";

interface Props {
  brands: TrendSheetSummary[];
  disabled: boolean;
  onSubmit: (a: string, b: string) => void;
}

export function CompareBrandsForm({ brands, disabled, onSubmit }: Props) {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const slugs = brands.map((x) => x.brand_slug);

  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
      <Autocomplete
        size="small"
        options={slugs.filter((s) => s !== b)}
        getOptionLabel={brandLabel}
        value={a}
        onChange={(_e, v) => setA(v)}
        renderInput={(p) => <TextField {...p} label="Brand A" placeholder="First brand" />}
        sx={{ minWidth: 220 }}
      />
      <Autocomplete
        size="small"
        options={slugs.filter((s) => s !== a)}
        getOptionLabel={brandLabel}
        value={b}
        onChange={(_e, v) => setB(v)}
        renderInput={(p) => <TextField {...p} label="Brand B" placeholder="Second brand" />}
        sx={{ minWidth: 220 }}
      />
      <Button
        variant="contained"
        endIcon={<CompareArrowsIcon />}
        disabled={!a || !b || disabled}
        onClick={() => a && b && onSubmit(a, b)}
      >
        Compare
      </Button>
    </Box>
  );
}

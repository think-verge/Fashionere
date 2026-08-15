import { useState } from "react";
import { Autocomplete, Box, Button, TextField } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import type { TrendSheetSummary } from "../../../lib/api/generated/model";
import { brandLabel } from "./TrendReportCard";

interface Props {
  brands: TrendSheetSummary[];
  disabled: boolean;
  onSubmit: (brandSlug: string) => void;
}

export function BrandReportForm({ brands, disabled, onSubmit }: Props) {
  const [brandSlug, setBrandSlug] = useState<string | null>(null);

  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
      <Autocomplete
        size="small"
        options={brands.map((b) => b.brand_slug)}
        getOptionLabel={brandLabel}
        value={brandSlug}
        onChange={(_e, value) => setBrandSlug(value)}
        renderInput={(params) => <TextField {...params} label="Brand" placeholder="Choose a brand" />}
        sx={{ minWidth: 260 }}
      />
      <Button
        variant="contained"
        endIcon={<AutoAwesomeIcon />}
        disabled={!brandSlug || disabled}
        onClick={() => brandSlug && onSubmit(brandSlug)}
      >
        Generate Report
      </Button>
    </Box>
  );
}

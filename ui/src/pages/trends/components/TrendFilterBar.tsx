import { Autocomplete, Box, Chip, TextField } from "@mui/material";
import type { TrendSheetSummary } from "../../../lib/api/generated/model";
import type { TrendFilters } from "../../../lib/trend-filters";
import { brandLabel } from "./TrendReportCard";
import { DIMENSION_LABELS, DIMENSION_ORDER } from "./DimensionCard";

interface Props {
  summaries: TrendSheetSummary[];
  filters: TrendFilters;
  onChange: (filters: TrendFilters) => void;
}

export function TrendFilterBar({ summaries, filters, onChange }: Props) {
  const brandOptions = summaries.map((s) => s.brand_slug);
  const yearOptions = Array.from(new Set(summaries.flatMap((s) => s.window_years.map(String)))).sort();
  const dimOptions = DIMENSION_ORDER;

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      <Autocomplete
        multiple
        size="small"
        options={brandOptions}
        getOptionLabel={brandLabel}
        value={filters.brands}
        onChange={(_e, value) => onChange({ ...filters, brands: value })}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => <Chip label={brandLabel(option)} size="small" {...getTagProps({ index })} key={option} />)
        }
        renderInput={(params) => <TextField {...params} label="Brand" placeholder="All brands" />}
        sx={{ minWidth: 220, flex: 1 }}
      />
      <Autocomplete
        multiple
        size="small"
        options={dimOptions}
        getOptionLabel={(k) => DIMENSION_LABELS[k] ?? k}
        value={filters.dims}
        onChange={(_e, value) => onChange({ ...filters, dims: value })}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip label={DIMENSION_LABELS[option] ?? option} size="small" {...getTagProps({ index })} key={option} />
          ))
        }
        renderInput={(params) => <TextField {...params} label="Dimension focus" placeholder="All dimensions" />}
        sx={{ minWidth: 220, flex: 1 }}
      />
      <Autocomplete
        multiple
        size="small"
        options={yearOptions}
        value={filters.years}
        onChange={(_e, value) => onChange({ ...filters, years: value })}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} key={option} />)
        }
        renderInput={(params) => <TextField {...params} label="Season / Year" placeholder="All years" />}
        sx={{ minWidth: 180, flex: 1 }}
      />
    </Box>
  );
}

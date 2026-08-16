import { useState } from "react";
import { Autocomplete, Box, Button, TextField } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

export interface SeasonOption {
  year: number;
  season: string;
  category: string;
  brands: string[];
  id: string;
}

interface Props {
  options: SeasonOption[];
  disabled: boolean;
  onSubmit: (o: SeasonOption) => void;
}

export const seasonLabel = (o: SeasonOption) =>
  `${o.season} ${o.year} · ${o.category.toUpperCase()} (${o.brands.length} brands)`;

export function SeasonWideForm({ options, disabled, onSubmit }: Props) {
  const [sel, setSel] = useState<SeasonOption | null>(null);

  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
      <Autocomplete
        size="small"
        options={options}
        getOptionLabel={seasonLabel}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        value={sel}
        onChange={(_e, v) => setSel(v)}
        renderInput={(p) => <TextField {...p} label="Season" placeholder="Choose a season" />}
        sx={{ minWidth: 340 }}
      />
      <Button
        variant="contained"
        endIcon={<AutoAwesomeIcon />}
        disabled={!sel || disabled}
        onClick={() => sel && onSubmit(sel)}
      >
        Generate Report
      </Button>
    </Box>
  );
}

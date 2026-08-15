import { Tab, Tabs } from "@mui/material";
import { useNavigate } from "react-router-dom";

interface Props {
  value: "reports" | "generate";
}

export function TrendsSectionTabs({ value }: Props) {
  const navigate = useNavigate();

  return (
    <Tabs
      value={value}
      onChange={(_e, next) => navigate(next === "reports" ? "/trends" : "/trends/generate")}
      sx={{ mb: 4, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none", fontWeight: 600 } }}
    >
      <Tab label="Reports" value="reports" />
      <Tab label="Generate" value="generate" />
    </Tabs>
  );
}

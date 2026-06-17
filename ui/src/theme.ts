import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#C9A84C",
      light: "#DFC27D",
      dark: "#9B7B29",
      contrastText: "#0D0D0D",
    },
    secondary: {
      main: "#E8E8E8",
      contrastText: "#0D0D0D",
    },
    background: {
      default: "#0D0D0D",
      paper: "#1A1A1A",
    },
    divider: "rgba(255,255,255,0.08)",
    text: {
      primary: "#F5F5F5",
      secondary: "#A0A0A0",
    },
    success: { main: "#4CAF50" },
    warning: { main: "#FF9800" },
    error: { main: "#F44336" },
    info: { main: "#90CAF9" },
  },
  typography: {
    fontFamily: '"Geist Variable", "Inter", system-ui, sans-serif',
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 600, letterSpacing: "-0.01em" },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
        containedPrimary: {
          background: "linear-gradient(135deg, #C9A84C 0%, #9B7B29 100%)",
          "&:hover": { background: "linear-gradient(135deg, #DFC27D 0%, #C9A84C 100%)" },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});

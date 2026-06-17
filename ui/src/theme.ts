import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#a93533",
      light: "#ff746d",
      dark: "#710810",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#5f5e5e",
      contrastText: "#ffffff",
    },
    background: {
      default: "#fff8f7",
      paper: "#ffffff",
    },
    divider: "#f0e4e2",
    text: {
      primary: "#241918",
      secondary: "#58413f",
      disabled: "#999999",
    },
    success: { main: "#006c4d" },
    warning: { main: "#f0c14b" },
    error: { main: "#ba1a1a" },
    info: { main: "#5f5e5e" },
  },
  typography: {
    fontFamily: "'Work Sans', system-ui, sans-serif",
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 600, letterSpacing: "-0.01em" },
    h4: { fontWeight: 600, letterSpacing: "-0.01em" },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
    caption: { color: "#999999" },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10 },
        containedPrimary: {
          backgroundColor: "#a93533",
          "&:hover": { backgroundColor: "#8a2a28" },
          boxShadow: "0 2px 8px rgba(169,53,51,0.2)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid #f0e4e2",
          borderRadius: 16,
          boxShadow: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid #f0e4e2",
          borderRadius: 16,
          boxShadow: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#f0e4e2",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#dfbfbc",
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          boxShadow: "none",
          borderBottom: "1px solid #f0e4e2",
          borderRadius: 0,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
          boxShadow: "none",
          borderRight: "1px solid #f0e4e2",
          borderRadius: 0,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: "1px solid #f0e4e2",
        },
      },
    },
  },
});

import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Avatar,
  Tooltip,
  Divider,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import LayersIcon from "@mui/icons-material/LayersOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUpOutlined";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import { useAuth } from "../lib/auth-context";

const DRAWER_WIDTH = 288;

const NAV_ITEMS = [
  { label: "Looks", path: "/app/looks", icon: <SearchIcon /> },
  { label: "Workspaces", path: "/app/workspaces", icon: <LayersIcon /> },
  { label: "Trends", path: "/app/trends", icon: <TrendingUpIcon /> },
];

interface Props {
  title: string;
  children: ReactNode;
}

export function PageShell({ title, children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: "#ffffff",
            borderRight: "1px solid #f0e4e2",
          },
        }}
      >
        {/* Logo */}
        <Box sx={{ px: 2.5, py: 3.5, display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                fontFamily: "'Literata', Georgia, serif",
                fontWeight: 700,
                fontSize: 20,
                color: "#ffffff",
                lineHeight: 1,
              }}
            >
              F
            </Typography>
          </Box>
          <Box>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "0.05em",
                color: "text.primary",
                lineHeight: 1,
              }}
            >
              FASHIONARE
            </Typography>
            <Typography
              sx={{
                fontSize: 10,
                color: "#999999",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                mt: 0.5,
              }}
            >
              Fashion Intelligence
            </Typography>
          </Box>
        </Box>

        {/* Project label */}
        {user && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Typography sx={{ fontSize: 11, color: "#999999", textTransform: "uppercase", letterSpacing: "0.15em", mb: 0.5 }}>
              Role
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>
              {user.role === "retail_chain" ? "Retail Chain" : "Fashion Designer"}
            </Typography>
          </Box>
        )}

        <Divider sx={{ borderColor: "#f0e4e2", mx: 2 }} />

        {/* Nav */}
        <List sx={{ flex: 1, px: 1.5, py: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: "12px",
                    px: 2,
                    py: 1.25,
                    bgcolor: active ? "primary.main" : "transparent",
                    color: active ? "#ffffff" : "#58413f",
                    "&:hover": {
                      bgcolor: active ? "primary.main" : "#fff0ef",
                    },
                    "& .MuiListItemIcon-root": {
                      color: active ? "#ffffff" : "#58413f",
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      variant: "body2",
                      fontWeight: active ? 600 : 500,
                      fontSize: 14,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>

        {/* Bottom user section */}
        <Divider sx={{ borderColor: "#f0e4e2" }} />
        <Box sx={{ px: 1.5, py: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, mb: 0.5 }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: "primary.main",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {initials}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} noWrap display="block" color="text.primary">
                {user?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: 11 }}>
                {user?.email}
              </Typography>
            </Box>
            <Tooltip title="Logout">
              <IconButton
                size="small"
                onClick={logout}
                sx={{ color: "#58413f", "&:hover": { bgcolor: "#fff0ef", color: "primary.main" } }}
              >
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: "rgba(255,248,247,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid #f0e4e2",
            borderRadius: 0,
            color: "text.primary",
          }}
        >
          <Toolbar sx={{ px: { xs: 3, sm: 5 }, gap: 1 }}>
            <Typography variant="body2" sx={{ color: "#999999", fontWeight: 400, fontSize: 13 }}>
              FASHIONARE
            </Typography>
            <Typography sx={{ color: "#dfbfbc", fontSize: 13 }}>/</Typography>
            <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 500, fontSize: 13 }}>
              {title}
            </Typography>
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          sx={{ flex: 1, px: { xs: 3, sm: 5 }, py: 6, bgcolor: "background.default" }}
        >
          <Box sx={{ maxWidth: 1280, mx: "auto" }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

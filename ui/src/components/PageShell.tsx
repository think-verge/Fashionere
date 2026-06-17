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
import DashboardIcon from "@mui/icons-material/DashboardOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CollectionsIcon from "@mui/icons-material/CollectionsOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUpOutlined";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBagOutlined";
import CalculateIcon from "@mui/icons-material/CalculateOutlined";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import { useAuth } from "../lib/auth-context";

const DRAWER_WIDTH = 220;

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
  { label: "Studio", path: "/studio", icon: <AutoAwesomeIcon /> },
  { label: "Moodboards", path: "/moodboards", icon: <CollectionsIcon /> },
  { label: "Trends", path: "/trends", icon: <TrendingUpIcon /> },
  { label: "Catalogue", path: "/catalogue", icon: <ShoppingBagIcon /> },
  { label: "Cost Calculator", path: "/cost-calculator", icon: <CalculateIcon /> },
  { label: "Projects", path: "/projects", icon: <FolderIcon /> },
];

interface Props {
  title: string;
  children: ReactNode;
}

export function PageShell({ title, children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useAuth();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <Box sx={{ p: 2.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              background: "linear-gradient(135deg, #C9A84C 0%, #9B7B29 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.02em",
            }}
          >
            CENTOIRE
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Fashion Intelligence
          </Typography>
        </Box>
        <List sx={{ flex: 1, px: 1, py: 1.5 }}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  selected={active}
                  sx={{
                    borderRadius: 2,
                    "&.Mui-selected": {
                      bgcolor: "rgba(201,168,76,0.12)",
                      color: "primary.main",
                      "& .MuiListItemIcon-root": { color: "primary.main" },
                    },
                    "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ variant: "body2", fontWeight: active ? 600 : 400 }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
        <Divider />
        <Box sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.dark", fontSize: 13 }}>
            {user?.name?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight={600} noWrap display="block">
              {user?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {user?.email}
            </Typography>
          </Box>
          <Tooltip title="Settings">
            <IconButton size="small" onClick={() => navigate("/settings")}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Logout">
            <IconButton size="small" onClick={logoutUser}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: "background.default",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Toolbar>
            <Typography variant="h6" fontWeight={600}>
              {title}
            </Typography>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, p: 3, bgcolor: "background.default" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

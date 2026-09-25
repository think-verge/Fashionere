import { type ReactNode, useRef, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Popover,
  MenuItem,
  TextField,
  Button,
  CircularProgress,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import LayersIcon from "@mui/icons-material/LayersOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUpOutlined";
import LogoutIcon from "@mui/icons-material/LogoutOutlined";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api/client";

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
  const { user, logout, activeProject, setActiveProject } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      searchParams.set("q", val);
    } else {
      searchParams.delete("q");
    }
    setSearchParams(searchParams);
  };

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);

  const { data: projects = [] } = useQuery<Array<{ _id: string; name: string }>>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await api.get("/projects");
      return Array.isArray(data) ? data : (data.projects ?? []);
    },
    enabled: !!user,
  });

  const createProject = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post("/projects", { name });
      return data;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setActiveProject({ id: project._id ?? project.id, name: project.name, is_default: false });
      setNewProjectName("");
      setCreating(false);
      setPopoverOpen(false);
    },
  });

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
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

        {/* Role + Project selector */}
        {user && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Typography sx={{ fontSize: 11, color: "#999999", textTransform: "uppercase", letterSpacing: "0.15em", mb: 0.5 }}>
              Role
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary", mb: 2 }}>
              {user.role === "retail_chain" ? "Retail Chain" : "Fashion Designer"}
            </Typography>

            {/* Project selector */}
            <Typography sx={{ fontSize: 11, color: "#999999", textTransform: "uppercase", letterSpacing: "0.15em", mb: 0.5 }}>
              Project
            </Typography>
            <Button
              ref={anchorRef}
              onClick={() => setPopoverOpen(true)}
              startIcon={<FolderIcon sx={{ fontSize: 15 }} />}
              endIcon={<ArrowDropDownIcon />}
              fullWidth
              sx={{
                justifyContent: "flex-start",
                textAlign: "left",
                color: activeProject ? "text.primary" : "text.disabled",
                fontWeight: activeProject ? 600 : 400,
                fontSize: 13,
                px: 1.5,
                py: 0.75,
                border: "1px solid #f0e4e2",
                borderRadius: "8px",
                bgcolor: "#faf8f7",
                "&:hover": { bgcolor: "#fff0ef", borderColor: "#dfbfbc" },
                "& .MuiButton-endIcon": { ml: "auto" },
              }}
            >
              <Box component="span" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                {activeProject?.name ?? "Select project"}
              </Box>
            </Button>

            <Popover
              open={popoverOpen}
              // eslint-disable-next-line react-hooks/refs
              anchorEl={anchorRef.current}
              onClose={() => { setPopoverOpen(false); setCreating(false); setNewProjectName(""); }}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
              PaperProps={{ sx: { width: DRAWER_WIDTH - 40, mt: 0.5, border: "1px solid #f0e4e2", borderRadius: "12px", boxShadow: "0 4px 24px rgba(36,25,24,0.10)" } }}
            >
              <Box sx={{ py: 1 }}>
                {projects.length === 0 && !creating && (
                  <MenuItem disabled sx={{ fontSize: 13, color: "text.disabled" }}>No projects yet</MenuItem>
                )}
                {projects.map((p) => (
                  <MenuItem
                    key={p._id}
                    selected={activeProject?.id === p._id}
                    onClick={() => {
                      setActiveProject({ id: p._id, name: p.name, is_default: false });
                      setPopoverOpen(false);
                    }}
                    sx={{
                      fontSize: 13,
                      borderRadius: "8px",
                      mx: 0.5,
                      "&.Mui-selected": { bgcolor: "#fff0ef", color: "primary.main", fontWeight: 600 },
                    }}
                  >
                    {p.name}
                  </MenuItem>
                ))}
                <Divider sx={{ borderColor: "#f0e4e2", my: 1 }} />
                {creating ? (
                  <Box sx={{ px: 1.5, pb: 1 }}>
                    <TextField
                      autoFocus
                      size="small"
                      fullWidth
                      placeholder="Project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && newProjectName.trim() && createProject.mutate(newProjectName.trim())}
                      sx={{ mb: 1, "& .MuiOutlinedInput-root fieldset": { borderColor: "#f0e4e2" } }}
                    />
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!newProjectName.trim() || createProject.isPending}
                        onClick={() => createProject.mutate(newProjectName.trim())}
                        sx={{ borderRadius: "8px", fontSize: 12, flex: 1 }}
                      >
                        {createProject.isPending ? <CircularProgress size={14} /> : "Create"}
                      </Button>
                      <Button
                        size="small"
                        onClick={() => { setCreating(false); setNewProjectName(""); }}
                        sx={{ borderRadius: "8px", fontSize: 12, color: "text.secondary" }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <MenuItem
                    onClick={() => setCreating(true)}
                    sx={{ fontSize: 13, color: "primary.main", fontWeight: 500, borderRadius: "8px", mx: 0.5 }}
                  >
                    <AddIcon sx={{ fontSize: 16, mr: 1 }} /> New project
                  </MenuItem>
                )}
              </Box>
            </Popover>
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

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            top: 0,
            width: "100%",
            bgcolor: "rgba(255, 255, 255, 0.65)",
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.8)",
            color: "text.primary",
            boxShadow: "0 12px 40px rgba(160, 140, 130, 0.08)",
            zIndex: 1100,
            transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Toolbar sx={{ px: { xs: 3, sm: 4 }, minHeight: "56px !important", gap: 1.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: "primary.main",
                boxShadow: "0 0 10px rgba(189,58,58,0.5)",
              }}
            />
            <Typography variant="body2" sx={{ color: "#a59796", fontWeight: 600, fontSize: 13, letterSpacing: "0.05em" }}>
              FASHIONARE
            </Typography>
            <Typography sx={{ color: "#e2d5d3", fontSize: 14 }}>/</Typography>
            <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em" }}>
              {title}
            </Typography>

            <Box sx={{ flexGrow: 1 }} />
            
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                bgcolor: "#ffffff",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: "20px",
                px: 2,
                py: 1,
                width: { xs: "100%", sm: 320 },
                gap: 1
              }}
            >
              <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Box
                component="input"
                value={searchParams.get("q") || ""}
                onChange={handleSearch}
                placeholder="Search silhouette, fabric, color..."
                sx={{
                  border: "none",
                  outline: "none",
                  bgcolor: "transparent",
                  width: "100%",
                  fontSize: 15,
                  fontFamily: "'Inter', -apple-system, sans-serif",
                  fontWeight: 400,
                  letterSpacing: "0.01em",
                  color: "text.primary",
                  "&::placeholder": {
                    color: "text.secondary",
                  }
                }}
              />
            </Box>
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          sx={{ flex: 1, px: { xs: 3, sm: 5 }, pt: 6, pb: 6, bgcolor: "#f7f3f1" }}
        >
          <Box sx={{ maxWidth: 1280, mx: "auto" }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

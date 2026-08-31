import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api/client";

interface Project {
  id: string;
  name: string;
  is_default: boolean;
}

export default function AppShell() {
  const { user, activeProject, setActiveProject, setProjects, logout } = useAuth();
  const nav = useNavigate();
  const [projectOpen, setProjectOpen] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await api.get("/projects");
      setProjects(data);
      return data;
    },
  });

  const handleProjectSwitch = (p: Project) => {
    setActiveProject(p);
    localStorage.setItem("fash_project", JSON.stringify(p));
    setProjectOpen(false);
  };

  const handleLogout = () => {
    logout();
    nav("/login");
  };

  const navItem = "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-sm transition-colors text-raisin/60 hover:text-raisin hover:bg-raisin/5";
  const activeNavItem = "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-sm text-raisin bg-raisin/8";

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-raisin/10 flex flex-col h-full">
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 border-b border-raisin/10">
          <p className="eyebrow text-salmon tracking-[0.2em]">Fashionare</p>
        </div>

        {/* Project switcher */}
        <div className="px-3 py-3 border-b border-raisin/10 relative">
          <button
            onClick={() => setProjectOpen(!projectOpen)}
            className="w-full flex items-center justify-between px-2 py-2 text-left hover:bg-raisin/5 rounded-sm transition-colors"
          >
            <div className="min-w-0">
              <p className="text-[10px] text-raisin/40 uppercase tracking-widest mb-0.5">Project</p>
              <p className="text-[13px] font-medium truncate">{activeProject?.name ?? "No project"}</p>
            </div>
            <svg className={`w-3.5 h-3.5 text-raisin/40 flex-shrink-0 transition-transform ${projectOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {projectOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-raisin/10 shadow-sm z-50 py-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProjectSwitch(p)}
                  className={`w-full text-left px-3 py-2 text-[13px] hover:bg-bg transition-colors ${activeProject?.id === p.id ? "text-deep-red font-medium" : "text-raisin"}`}
                >
                  {p.name}
                  {p.is_default && <span className="ml-1.5 text-[10px] text-raisin/40">(default)</span>}
                </button>
              ))}
              <div className="border-t border-raisin/10 mt-1 pt-1">
                <button
                  onClick={() => { /* TODO: new project modal */ setProjectOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[12px] text-raisin/50 hover:text-raisin transition-colors"
                >
                  + New project
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          <NavLink to="/app/looks" className={({ isActive }) => isActive ? activeNavItem : navItem}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Looks
          </NavLink>
          <NavLink to="/app/workspaces" className={({ isActive }) => isActive ? activeNavItem : navItem}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Workspaces
          </NavLink>
          <NavLink to="/app/trends" className={({ isActive }) => isActive ? activeNavItem : navItem}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Trends
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-raisin/10">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-6 h-6 bg-salmon/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-salmon">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-raisin/40 capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
            <button onClick={handleLogout} className="text-raisin/30 hover:text-raisin transition-colors" title="Log out">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

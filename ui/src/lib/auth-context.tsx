/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "./api/client";

interface User {
  id: string;
  name: string;
  email: string;
  role: "designer" | "retail_chain";
  sources: string[];
  garment_interests: string[];
  onboarding_complete: boolean;
}

interface Project {
  id: string;
  name: string;
  is_default: boolean;
}

interface AuthCtx {
  user: User | null;
  activeProject: Project | null;
  projects: Project[];
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  setActiveProject: (p: Project) => void;
  setProjects: (ps: Project[]) => void;
}

interface SignupData {
  name: string;
  email: string;
  password: string;
  role: "designer" | "retail_chain";
  sources: string[];
  garment_interests: string[];
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("fash_token");
    const storedUser = localStorage.getItem("fash_user");
    const storedProject = localStorage.getItem("fash_project");
    if (token && storedUser) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(JSON.parse(storedUser));
        if (storedProject) setActiveProject(JSON.parse(storedProject));
      } catch {
        /* ignore */
      }
    }
    setIsLoading(false);
  }, []);

  const storeSession = (token: string, user: User, project: Project | null) => {
    localStorage.setItem("fash_token", token);
    localStorage.setItem("fash_user", JSON.stringify(user));
    if (project) localStorage.setItem("fash_project", JSON.stringify(project));
    setUser(user);
    if (project) setActiveProject(project);
  };

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    storeSession(data.token, data.user, data.project);
    if (data.project) setProjects([data.project]);
  };

  const signup = async (signupData: SignupData) => {
    const { data } = await api.post("/auth/signup", signupData);
    storeSession(data.token, data.user, data.project);
    if (data.project) setProjects([data.project]);
  };

  const logout = () => {
    localStorage.removeItem("fash_token");
    localStorage.removeItem("fash_user");
    localStorage.removeItem("fash_project");
    setUser(null);
    setActiveProject(null);
    setProjects([]);
  };

  return (
    <AuthContext.Provider value={{ user, activeProject, projects, isLoading, login, signup, logout, setActiveProject, setProjects }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

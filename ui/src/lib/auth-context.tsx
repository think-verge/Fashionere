import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { getCentoireAPI } from "./api/generated/client";
import type { User } from "./api/generated/model";

const api = getCentoireAPI();

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  loginUser: (email: string, password: string) => Promise<void>;
  signupUser: (email: string, password: string, name: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  refreshUser: () => Promise<void>;
  saveProfile: (name: string) => Promise<User>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getApiV1AuthMe()
      .then((u) => { if (!cancelled) setUser(u); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await api.getApiV1AuthMe());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginUser = useCallback(async (email: string, password: string) => {
    const u = await api.postApiV1AuthLogin({ email, password });
    setUser(u);
  }, []);

  const signupUser = useCallback(async (email: string, password: string, name: string) => {
    const u = await api.postApiV1AuthSignup({ email, password, name });
    setUser(u);
  }, []);

  const logoutUser = useCallback(async () => {
    await api.postApiV1AuthLogout();
    setUser(null);
  }, []);

  const saveProfile = useCallback(async (name: string) => {
    const u = await api.patchApiV1UsersMe({ name });
    setUser(u);
    return u;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, loginUser, signupUser, logoutUser, refreshUser, saveProfile }),
    [loading, loginUser, logoutUser, refreshUser, saveProfile, signupUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

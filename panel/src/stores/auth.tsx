import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { api, ApiError } from "../services/api";
import type { MeOut } from "../types/api";

interface AuthState {
  user: MeOut | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...names: string[]) => boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<MeOut | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<MeOut>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const login = useCallback(
    async (username: string, password: string) => {
      const me = await api.post<MeOut>("/auth/login", { username, password });
      qc.setQueryData(["me"], me);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      qc.setQueryData(["me"], null);
      qc.clear();
    }
  }, [qc]);

  const hasRole = useCallback(
    (...names: string[]) =>
      !!data?.roles.some((r) => names.includes(r.name)),
    [data],
  );

  return (
    <AuthCtx.Provider
      value={{ user: data ?? null, loading: isLoading, login, logout, hasRole }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  orgId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  orgName?: string;
  orgLogoUrl?: string | null;
  plantIds: string[];
  isSuperAdmin: boolean;
  /** Set when the super admin is browsing as a specific org. */
  orgOverride?: string;
  orgOverrideName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  logout: async () => {},
});

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json() as AuthUser & { authenticated?: boolean };
  // 200 { authenticated: false } means no session — no error, just not logged in
  if (data.authenticated === false) return null;
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery<AuthUser | null, Error>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await fetchMe();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // re-check every 5 min
    retry: false,
  });

  async function logout() {
    await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

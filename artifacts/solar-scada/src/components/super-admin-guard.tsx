/**
 * SuperAdminGuard — redirects any non-super-admin user to the root route.
 * Wrap any /superadmin/** page with this component.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && (!user || !user.isSuperAdmin)) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Authenticating…</div>
      </div>
    );
  }

  if (!user?.isSuperAdmin) return null;

  return <>{children}</>;
}

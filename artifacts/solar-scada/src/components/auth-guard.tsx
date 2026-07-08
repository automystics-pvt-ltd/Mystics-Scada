/**
 * AuthGuard — redirects unauthenticated visitors to /login.
 *
 * Render this around the protected portion of the route tree.
 * The login page itself must sit OUTSIDE this guard.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Zap } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-3 text-muted-foreground">
        <Zap className="h-5 w-5 text-primary animate-pulse" />
        <span className="text-sm">Verifying session…</span>
      </div>
    );
  }

  if (!user) {
    // Render nothing while redirect is in-flight
    return null;
  }

  return <>{children}</>;
}

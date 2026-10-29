import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  light?: boolean;
}

export function AppLayout({ title, subtitle, children, light }: AppLayoutProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  console.log("[ONBOARDING DEBUG] AppLayout mounting. Path:", location.pathname);
  console.log("[ONBOARDING DEBUG] Auth status:", isAuthenticated ? "authenticated" : "unauthenticated");

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      console.log("[ONBOARDING DEBUG] Profile retrieval started");
      const res = await fetchWithAuth("/api/v1/profile");
      
      console.log(`[ONBOARDING DEBUG] Profile API status: ${res.status}`);
      if (res.status === 404) {
        console.log("[ONBOARDING DEBUG] Profile not found (404)");
        throw new Error("Profile not found");
      }
      if (!res.ok) {
        console.log(`[ONBOARDING DEBUG] Profile fetch failed: ${res.statusText}`);
        throw new Error("Failed to fetch profile");
      }
      
      const data = await res.json();
      console.log("[ONBOARDING DEBUG] Retrieved profile data:", {
        age: data.age, weight: data.weight, goal: data.fitness_goal, level: data.fitness_level, completed: data.profile_completed
      });
      
      const isComplete = Boolean(
        data.age && data.age > 0 &&
        data.weight && data.weight > 0 &&
        data.height && data.height > 0 &&
        data.fitness_goal && data.fitness_level
      );
      
      if (!isComplete || data.profile_completed === false) {
        console.log("[ONBOARDING DEBUG] Profile completeness check failed. Required fields might be missing.");
        throw new Error("Profile incomplete");
      }
      
      console.log("[ONBOARDING DEBUG] Profile retrieval succeeded and is complete");
      return data;
    },
    enabled: isAuthenticated,
    retry: false
  });

  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated && mounted) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, navigate, mounted]);

  useEffect(() => {
    if (error && mounted) {
      console.log(`[ONBOARDING DEBUG] AppLayout error effect triggered: ${error.message}`);
      if ((error.message === "Profile not found" || error.message === "Profile incomplete") && location.pathname !== "/onboarding/profile") {
        console.log("[ONBOARDING DEBUG] Redirecting to /onboarding/profile");
        navigate({ to: "/onboarding/profile", replace: true });
      }
    }
  }, [error, navigate, location.pathname, mounted]);

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Checking profile...</p>
        </div>
      </div>
    );
  }

  if (error && (error.message === "Profile not found" || error.message === "Profile incomplete")) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className={light ? "theme-light md:pl-64" : "md:pl-64"}>
        <TopBar title={title} subtitle={subtitle} />
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

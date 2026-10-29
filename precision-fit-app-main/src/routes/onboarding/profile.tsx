import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Activity, ArrowRight, Loader2, Target, Zap, Heart, Flame } from "lucide-react";
import { fetchWithAuth } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding/profile")({
  head: () => ({
    meta: [{ title: "Create Your Profile — FitAssist" }]
  }),
  component: OnboardingProfile,
});

const goals = [
  { id: "weight_loss", title: "Weight Loss", desc: "Improve body composition and build sustainable habits.", icon: Flame },
  { id: "muscle_gain", title: "Muscle Gain", desc: "Build strength and increase lean muscle.", icon: Target },
  { id: "endurance", title: "Endurance", desc: "Improve stamina and cardiovascular performance.", icon: Heart },
  { id: "general_fitness", title: "General Fitness", desc: "Build overall health, strength and fitness.", icon: Zap },
];

const levels = [
  { id: "beginner", title: "Beginner", desc: "New to structured workouts" },
  { id: "intermediate", title: "Intermediate", desc: "I exercise regularly" },
  { id: "advanced", title: "Advanced", desc: "I train consistently" },
];

function OnboardingProfile() {
  const navigate = useNavigate();
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileExists, setProfileExists] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetchWithAuth("/api/v1/profile");
        if (res.ok) {
          const data = await res.json();
          setProfileExists(true);
          if (data.age) setAge(data.age.toString());
          if (data.weight) setWeight(data.weight.toString());
          if (data.height) setHeight(data.height.toString());
          if (data.fitness_goal) setGoal(data.fitness_goal);
          if (data.fitness_level) setLevel(data.fitness_level);
        }
      } catch (err) {
        // Ignore errors, we just won't prefill
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadProfile();
  }, []);

  const isValid = age && parseInt(age) > 0 && weight && parseFloat(weight) > 0 && height && parseFloat(height) > 0 && goal && level;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // 1. Save profile
      const res = await fetchWithAuth("/api/v1/profile", {
        method: profileExists ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: parseInt(age),
          weight: parseFloat(weight),
          height: parseFloat(height),
          fitness_goal: goal,
          fitness_level: level
        })
      });
      
      if (!res.ok) {
        throw new Error("Failed to save profile");
      }
      
      setIsProcessingAI(true);
      
      // 2. Generate AI plan
      const aiRes = await fetchWithAuth("/api/v1/recommendations/generate", {
        method: "POST"
      });
      
      if (!aiRes.ok) {
        throw new Error("Failed to generate plan");
      }
      
      // 3. Redirect
      navigate({ to: "/dashboard" });
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsSubmitting(false);
      setIsProcessingAI(false);
    }
  }

  if (isProcessingAI) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 animate-pulse">
          <SparklesIcon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Building your personalized plan</h2>
        <div className="mt-8 space-y-4 text-left max-w-sm w-full mx-auto">
          <LoadingStep text="Analyzing your profile" delay="delay-[0ms]" />
          <LoadingStep text="Understanding your fitness goal" delay="delay-[500ms]" />
          <LoadingStep text="Designing your weekly workouts" delay="delay-[1000ms]" />
          <LoadingStep text="Preparing your recommendations" delay="delay-[1500ms]" />
        </div>
      </div>
    );
  }

  if (isLoadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col p-6 lg:p-12 items-center">
      <div className="w-full max-w-2xl">
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
              <Activity className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">FitAssist</span>
          </div>
          <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">Step 1 of 4</span>
        </div>
        
        <h1 className="text-3xl font-semibold tracking-tight">Let's personalize your FitAssist experience</h1>
        <p className="mt-2 text-muted-foreground">Tell us a little about yourself so your AI coach can create a plan tailored to you.</p>

        <form onSubmit={handleSubmit} className="mt-12 space-y-12">
          
          {/* Age & Weight */}
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">How old are you?</label>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">Your age helps us personalize your recommendations.</p>
              <input 
                type="number" min="1" max="120" required
                value={age} onChange={e => setAge(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-card px-4 outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40 transition" 
                placeholder="21"
              />
            </div>
            <div>
              <label className="text-sm font-semibold">What's your current weight?</label>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">You can update your weight anytime.</p>
              <div className="relative">
                <input 
                  type="number" min="1" step="0.1" required
                  value={weight} onChange={e => setWeight(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40 transition" 
                  placeholder="72"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">kg</span>
              </div>
            </div>
          </div>
          
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">What's your height?</label>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">Used for calculating your BMI and energy needs.</p>
              <div className="relative">
                <input 
                  type="number" min="1" step="0.1" required
                  value={height} onChange={e => setHeight(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40 transition" 
                  placeholder="175"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">cm</span>
              </div>
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="text-sm font-semibold mb-4 block">What's your primary goal?</label>
            <div className="grid gap-4 sm:grid-cols-2">
              {goals.map(g => (
                <button
                  key={g.id} type="button"
                  onClick={() => setGoal(g.id)}
                  className={cn(
                    "flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all",
                    goal === g.id 
                      ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.15)]" 
                      : "border-border bg-card hover:border-primary/40 hover:bg-card-elevated"
                  )}
                >
                  <g.icon className={cn("h-6 w-6", goal === g.id ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <div className="font-semibold">{g.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{g.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Level */}
          <div>
            <label className="text-sm font-semibold mb-4 block">What's your current fitness level?</label>
            <div className="grid gap-4 sm:grid-cols-3">
              {levels.map(l => (
                <button
                  key={l.id} type="button"
                  onClick={() => setLevel(l.id)}
                  className={cn(
                    "flex flex-col items-center text-center gap-2 rounded-xl border p-4 transition-all",
                    level === l.id 
                      ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.15)]" 
                      : "border-border bg-card hover:border-primary/40 hover:bg-card-elevated"
                  )}
                >
                  <div className="font-semibold">{l.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{l.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-destructive font-medium">{error}</div>}

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-8 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <>Generate My Personalized Plan <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function LoadingStep({ text, delay }: { text: string; delay: string }) {
  return (
    <div className={cn("flex items-center gap-3 animate-pulse", delay)}>
      <div className="h-4 w-4 rounded-full bg-primary/40 flex items-center justify-center shrink-0">
        <div className="h-2 w-2 rounded-full bg-primary" />
      </div>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

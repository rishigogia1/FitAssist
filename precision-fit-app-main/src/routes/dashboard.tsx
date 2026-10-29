import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { Flame, Footprints, Timer, Trophy, Sparkles, Play, Dumbbell, RefreshCw, AlertCircle } from "lucide-react";
import { getDashboardData, fetchWithAuth } from "@/lib/api-client";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FitAssist" },
      { name: "description", content: "Your daily AI-powered fitness overview: calories, steps, activity, and personalized plan." },
    ],
  }),
  component: Dashboard,
});

const macroColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"];

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardData,
  });

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    }).format(new Date());
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchWithAuth("/api/v1/recommendations/generate", { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      console.error(e);
    }
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <AppLayout title="Dashboard" subtitle={`Loading your daily activity summary...`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-2xl border border-border bg-card p-5 animate-pulse" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <div className="h-80 rounded-2xl border border-border bg-card p-5 xl:col-span-2 animate-pulse" />
          <div className="h-80 rounded-2xl border border-border bg-card p-5 animate-pulse" />
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <div className="h-72 rounded-2xl border border-border bg-card p-5 xl:col-span-2 animate-pulse" />
          <div className="h-72 rounded-2xl border border-border bg-card p-5 animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout title="Dashboard" subtitle="Unable to load dashboard">
        <div className="flex h-96 flex-col items-center justify-center text-center rounded-2xl border border-dashed border-destructive/30 p-6 bg-card-elevated/30 max-w-lg mx-auto mt-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Unable to load your dashboard</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            {error?.message || "We couldn't retrieve your latest fitness data."}
          </p>
          <button 
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 shadow-md"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </AppLayout>
    );
  }

  const {
    user,
    greeting,
    calories,
    steps,
    activity,
    fitness_score,
    nutrition_split,
    progress_history,
    steps_history,
    recommendation
  } = data;

  const macros = [
    { name: "Protein", value: nutrition_split.protein },
    { name: "Carbs", value: nutrition_split.carbs },
    { name: "Fats", value: nutrition_split.fats },
  ];

  const avgStepsText = steps.source_available 
    ? (steps.average_per_day > 0 ? `Average ${steps.average_per_day.toLocaleString()} steps / day` : "No activity recorded yet") 
    : "Connect a fitness tracker to track steps";

  return (
    <AppLayout title={greeting} subtitle={`Here's your activity for today, ${formattedDate}.`}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard 
          to="/nutrition" 
          icon={Flame} 
          label="Calories" 
          value={`${calories.consumed.toLocaleString()} kcal`} 
          hint={`Goal ${calories.target.toLocaleString()}`} 
          trend={calories.trend} 
          trendPositive={calories.trend_positive} 
        />
        <StatCard 
          to="/progress" 
          icon={Footprints} 
          label="Steps" 
          value={steps.source_available ? (steps.completed > 0 ? steps.completed.toLocaleString() : "0") : "N/A"} 
          hint={steps.source_available ? `of ${steps.target.toLocaleString()}` : "Connect a tracker"} 
          trend={steps.source_available ? steps.trend : "0%"} 
          trendPositive={steps.source_available ? steps.trend_positive : false} 
        />
        <StatCard 
          to="/workout" 
          icon={Timer} 
          label="Activity Time" 
          value={`${activity.minutes} min`} 
          hint={`${activity.sessions} ${activity.sessions === 1 ? 'session' : 'sessions'}`} 
          trend={activity.trend} 
          trendPositive={activity.trend_positive} 
        />
        <StatCard 
          to="/progress" 
          icon={Trophy} 
          label="Fitness Score" 
          value={`${fitness_score.score}/${fitness_score.max_score}`} 
          hint={fitness_score.percentile !== "N/A" ? fitness_score.percentile : "No score yet"} 
          trend={fitness_score.trend} 
          trendPositive={fitness_score.trend_positive} 
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {/* Progress chart */}
        <div className="rounded-2xl border border-border bg-card p-5 xl:col-span-2 shadow-[var(--shadow-card)] transition hover:border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Progress overview</h3>
              <p className="text-xs text-muted-foreground">Fitness score vs. weekly goal</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Legend dot="var(--chart-1)" label="Score" />
              <Legend dot="var(--chart-2)" label="Goal" />
            </div>
          </div>
          <div className="mt-4 h-64">
            {progress_history && progress_history.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={progress_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
                  <Line type="monotone" dataKey="score" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="goal" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-xs text-muted-foreground">
                <p>Complete a few workouts to start seeing your progress history.</p>
              </div>
            )}
          </div>
        </div>

        {/* Donut */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/20">
          <h3 className="text-sm font-semibold">Nutrition split</h3>
          <p className="text-xs text-muted-foreground">Today's macros</p>
          <div className="mt-2 h-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={macros} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={3} stroke="none">
                  {macros.map((_, i) => <Cell key={i} fill={macroColors[i]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {macros.map((m, i) => (
              <div key={m.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: macroColors[i] }} /> {m.name}
                </span>
                <span className="font-medium">{m.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {/* Steps bar */}
        <div className="rounded-2xl border border-border bg-card p-5 xl:col-span-2 shadow-[var(--shadow-card)] transition hover:border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Steps this week</h3>
              <p className="text-xs text-muted-foreground">{avgStepsText}</p>
            </div>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={steps_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="steps" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-card-elevated to-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/50 flex flex-col justify-between">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" /> AI Recommendation
              </div>
              <button 
                onClick={handleRefresh}
                className={cn("text-muted-foreground hover:text-primary transition-all", isRefreshing && "animate-spin")}
                title="Regenerate recommendation"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {recommendation ? (
              <>
                <h3 className="mt-3 text-base font-semibold">{recommendation.title}</h3>
                <p className={cn("mt-1 text-sm text-muted-foreground transition-opacity", isRefreshing ? "opacity-30" : "opacity-100")}>
                  {recommendation.description}
                </p>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2"><Dumbbell className="h-3.5 w-3.5 text-primary" /> {recommendation.exercise_count} exercises · {recommendation.duration_minutes} min</div>
                  <div className="flex items-center gap-2"><Flame className="h-3.5 w-3.5 text-primary" /> ~ {recommendation.calories} kcal burn target</div>
                </div>
              </>
            ) : (
              <div className="mt-4 py-4 text-center text-xs text-muted-foreground">
                No active workout recommendation. Complete your profile onboarding.
              </div>
            )}
          </div>

          <div className="relative mt-5">
            {recommendation ? (
              <button
                onClick={() => navigate({ to: "/workout/$id", params: { id: recommendation.workout_id } })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
              >
                <Play className="h-4 w-4 fill-current" /> Start Workout
              </button>
            ) : (
              <Link
                to="/workout"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-all"
              >
                Workout Library
              </Link>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "var(--card-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
};

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> {label}
    </span>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import {
  Flame, Trophy, Target, Award, Zap, Dumbbell, Apple, Star,
  TrendingDown, Plus, X, ChevronRight, RotateCcw, Bot, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar,
} from "recharts";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProgressData, addWeightLog } from "@/lib/api-client";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — FitAssist" },
      { name: "description", content: "Track your real weight trend, weekly activity, streak, goals and achievements." },
    ],
  }),
  component: ProgressPage,
});

// ─── Icon map for achievements ────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  dumbbell: Dumbbell,
  trophy: Trophy,
  award: Award,
  flame: Flame,
  zap: Zap,
  apple: Apple,
  salad: Apple,
  target: Target,
  "trending-down": TrendingDown,
  star: Star,
};

function AchievementIcon({ icon, unlocked }: { icon: string; unlocked: boolean }) {
  const Icon = ICON_MAP[icon] ?? Award;
  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${unlocked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────
function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-card border border-border ${className}`} />;
}

// ─── Modal wrapper ────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
function ProgressPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [weightRange, setWeightRange] = useState<"7d" | "4w" | "12w" | "all">("4w");
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [weightError, setWeightError] = useState<string | null>(null);

  // ─── Query ─────────────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["progress", weightRange],
    queryFn: () => getProgressData(weightRange),
    staleTime: 30_000,
  });

  // ─── Add weight mutation ────────────────────────────────────────────────
  const weightMutation = useMutation({
    mutationFn: (weight: number) => addWeightLog(weight),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["progress"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setShowWeightModal(false);
      setWeightInput("");
      setWeightError(null);
    },
  });

  const handleAddWeight = () => {
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0 || val > 500) {
      setWeightError("Please enter a valid weight between 1 and 500 kg.");
      return;
    }
    setWeightError(null);
    weightMutation.mutate(val);
  };

  // ─── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppLayout title="Your progress" subtitle="Loading your data…">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} className="h-36" />)}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <SkeletonCard className="h-80 xl:col-span-2" />
          <SkeletonCard className="h-80" />
        </div>
        <SkeletonCard className="mt-6 h-32" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} className="h-28" />)}
        </div>
      </AppLayout>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <AppLayout title="Your progress" subtitle="">
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-destructive font-medium">Unable to load your progress.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
        </div>
      </AppLayout>
    );
  }

  const { streak, goals, achievements, weight, weekly_activity, summary, goal_progress } = data;

  // ─── Streak heatmap (21 cells — current week + 2 prior) ─────────────────
  // We don't have per-day detail in this response, so show streak intensity
  const streakCells = Array.from({ length: 21 }, (_, i) => {
    const daysAgo = 20 - i;
    // Current streak covers the last `streak.current` days
    const isActive = daysAgo < streak.current;
    return isActive;
  });

  const weightHasData = weight?.has_data === true;
  const weightHistory = weightHasData ? (weight.history ?? []) : [];
  const allActivityZero = weekly_activity.days.every((d: any) => d.minutes === 0);

  const RANGES: { key: "7d" | "4w" | "12w" | "all"; label: string }[] = [
    { key: "7d", label: "7 Days" },
    { key: "4w", label: "4 Weeks" },
    { key: "12w", label: "12 Weeks" },
    { key: "all", label: "All Time" },
  ];

  return (
    <AppLayout title="Your progress" subtitle="Trends, goals, and achievements — all from your real activity.">

      {/* ── Gamification row ──────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">

        {/* Streak */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card-elevated to-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current streak</p>
              <p className="text-2xl font-semibold tracking-tight">
                {streak.current === 0 ? "0 days" : `${streak.current} ${streak.current === 1 ? "day" : "days"}`}
              </p>
            </div>
          </div>
          {streak.longest > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Longest: {streak.longest} days</p>
          )}
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {streakCells.map((active, i) => (
              <div
                key={i}
                className={`h-6 rounded transition-colors ${active ? "bg-primary/70" : "bg-muted"}`}
              />
            ))}
          </div>
          {streak.current === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Complete a workout or log a meal to start your streak.
            </p>
          )}
        </div>

        {/* Goals */}
        <button
          onClick={() => setShowGoalsModal(true)}
          className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] text-left hover:border-primary/30 transition-colors group"
        >
          <p className="text-xs text-muted-foreground">Goals completed</p>
          <p className="mt-1 text-2xl font-semibold">{goals.completed} / {goals.total}</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${goals.total > 0 ? (goals.completed / goals.total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {goals.remaining === 0
                ? "All goals completed! 🎉"
                : `${goals.remaining} goal${goals.remaining === 1 ? "" : "s"} remaining this month`}
            </p>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </button>

        {/* Achievements */}
        <button
          onClick={() => setShowAchievementsModal(true)}
          className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] text-left hover:border-primary/30 transition-colors group"
        >
          <p className="text-xs text-muted-foreground">Achievements</p>
          <p className="mt-1 text-2xl font-semibold">
            {achievements.unlocked} / {achievements.total} unlocked
          </p>
          <div className="mt-3 flex -space-x-2">
            {achievements.items
              .filter((a: any) => a.unlocked)
              .slice(0, 5)
              .map((a: any) => {
                const Icon = ICON_MAP[a.icon] ?? Award;
                return (
                  <div key={a.code} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-card-elevated text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                );
              })}
            {achievements.unlocked === 0 && (
              <p className="text-xs text-muted-foreground">Complete your first workout to unlock achievements.</p>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </button>
      </div>

      {/* ── Range Selector ────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center gap-2">
        {RANGES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setWeightRange(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              weightRange === key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Charts row ───────────────────────────────────────────────── */}
      <div className="mt-3 grid gap-4 xl:grid-cols-3">

        {/* Weight Trend */}
        <div className="rounded-2xl border border-border bg-card p-5 xl:col-span-2 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Weight trend</h3>
              <p className="text-xs text-muted-foreground">
                {weightHasData
                  ? `${weightHistory.length} measurement${weightHistory.length === 1 ? "" : "s"}`
                  : "No measurements yet"}
              </p>
            </div>
            <button
              onClick={() => setShowWeightModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Weight
            </button>
          </div>

          {weightHasData && weight.current && (
            <div className="mt-2 flex gap-6 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Current </span>
                <span className="font-semibold">{weight.current} kg</span>
              </div>
              {weight.change !== undefined && weight.change !== 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Change </span>
                  <span className={`font-semibold ${weight.change < 0 ? "text-green-400" : "text-orange-400"}`}>
                    {weight.change > 0 ? "+" : ""}{weight.change} kg
                  </span>
                </div>
              )}
              {weight.goal && (
                <div>
                  <span className="text-xs text-muted-foreground">Goal </span>
                  <span className="font-semibold">{weight.goal} kg</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 h-56">
            {!weightHasData ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <TrendingDown className="h-8 w-8 opacity-30" />
                <p className="text-sm font-medium">No weight history yet</p>
                <p className="text-xs max-w-xs">
                  Add your first weight measurement to start tracking your trend.
                </p>
              </div>
            ) : weightHistory.length < 2 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">Only {weightHistory.length} measurement — add more to see a trend.</p>
              </div>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={weightHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "var(--card-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: any) => [`${v} kg`, "Weight"]}
                  />
                  <Area type="monotone" dataKey="kg" stroke="var(--primary)" strokeWidth={2} fill="url(#wg)" dot={{ fill: "var(--primary)", r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Weekly Activity */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold">Weekly activity</h3>
          <p className="text-xs text-muted-foreground">
            {allActivityZero
              ? "No completed workouts yet"
              : `Avg ${weekly_activity.average_minutes} min/active day`}
          </p>
          <div className="mt-4 h-56">
            {allActivityZero ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground text-center">
                <Dumbbell className="h-8 w-8 opacity-30" />
                <p className="text-sm font-medium">No completed workouts yet.</p>
                <p className="text-xs">Finish a workout to see your activity here.</p>
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart data={weekly_activity.days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--card-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: any) => [`${v} min`, "Activity"]}
                    cursor={{ fill: "var(--accent)" }}
                  />
                  <Bar dataKey="minutes" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Progress Summary ─────────────────────────────────────────── */}
      <h2 className="mt-8 mb-3 text-sm font-semibold">Your Progress</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Fitness Score</p>
          <p className="mt-1 text-2xl font-semibold">{summary.fitness_score}<span className="text-sm text-muted-foreground">/100</span></p>
          {summary.fitness_score_change !== 0 && (
            <p className={`mt-1 text-xs font-medium ${summary.fitness_score_change > 0 ? "text-green-400" : "text-orange-400"}`}>
              {summary.fitness_score_change > 0 ? "+" : ""}{summary.fitness_score_change} vs last week
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Workout Sessions</p>
          <p className="mt-1 text-2xl font-semibold">{summary.workout_sessions}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.completed_this_week !== undefined
              ? `${summary.completed_this_week} this week · total completed`
              : "total completed"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Activity Minutes</p>
          <p className="mt-1 text-2xl font-semibold">{summary.activity_minutes}</p>
          <p className="mt-1 text-xs text-muted-foreground">total logged</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Nutrition Adherence</p>
          <p className="mt-1 text-2xl font-semibold">{summary.nutrition_adherence}%</p>
          <p className="mt-1 text-xs text-muted-foreground">last 30 days</p>
        </div>
      </div>

      {/* ── Your Goal Card ────────────────────────────────────────────── */}
      {goal_progress && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-card-elevated to-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Target className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold">Your Goal</p>
          </div>
          {goal_progress.type === "weight_loss" && (
            <div className="space-y-1">
              {goal_progress.weight_change < 0 ? (
                <p className="text-base font-semibold text-green-400">You've lost {Math.abs(goal_progress.weight_change)} kg 🎉</p>
              ) : goal_progress.weight_change > 0 ? (
                <p className="text-sm text-muted-foreground">Starting: {goal_progress.starting_weight} kg → Current: {goal_progress.current_weight} kg</p>
              ) : (
                <p className="text-sm text-muted-foreground">Keep logging your weight to track progress.</p>
              )}
              {goal_progress.goal_weight && goal_progress.remaining !== undefined && (
                <p className="text-xs text-muted-foreground">{Math.abs(goal_progress.remaining)} kg remaining to reach {goal_progress.goal_weight} kg</p>
              )}
              {goal_progress.percentage_to_goal !== undefined && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Progress</span><span>{goal_progress.percentage_to_goal}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${goal_progress.percentage_to_goal}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
          {goal_progress.type === "muscle_gain" && (
            <div>
              {goal_progress.weight_change > 0 ? (
                <p className="text-base font-semibold text-primary">You've gained {goal_progress.weight_change} kg 💪</p>
              ) : (
                <p className="text-sm text-muted-foreground">Log your weight to track muscle gain progress.</p>
              )}
            </div>
          )}
          {goal_progress.type === "fitness_score" && (
            <div>
              <p className="text-base font-semibold">
                Fitness Score: {goal_progress.current_score}
                {goal_progress.score_change !== 0 && (
                  <span className={`ml-2 text-sm ${goal_progress.score_change > 0 ? "text-green-400" : "text-orange-400"}`}>
                    ({goal_progress.score_change > 0 ? "+" : ""}{goal_progress.score_change} vs last week)
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Complete workouts and log meals daily to improve your score.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Achievements grid ─────────────────────────────────────────── */}
      <h2 className="mt-8 mb-3 text-sm font-semibold">Achievements</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {achievements.items.slice(0, 8).map((a: any) => (
          <div
            key={a.code}
            className={`rounded-2xl border p-5 shadow-[var(--shadow-card)] transition-all ${
              a.unlocked ? "border-primary/30 bg-card" : "border-border bg-card opacity-50"
            }`}
          >
            <AchievementIcon icon={a.icon} unlocked={a.unlocked} />
            <p className="mt-4 text-sm font-semibold">{a.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
            {a.unlocked && a.unlocked_at && (
              <p className="mt-2 text-[10px] text-primary/70">
                Unlocked {new Date(a.unlocked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── AI Progress Analysis ──────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">AI Progress Analysis</p>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            <Sparkles className="h-3 w-3" /> Powered by Gemini
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Get a personalized analysis of your recent progress, trends, and areas to improve — powered by your real FitAssist data.
        </p>
        <button
          onClick={() => navigate({ to: "/ai-coach" })}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 active:scale-95 transition-all"
        >
          <Bot className="h-3.5 w-3.5" /> Ask AI Coach
        </button>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {/* Add Weight Modal */}
      <Modal open={showWeightModal} onClose={() => { setShowWeightModal(false); setWeightInput(""); setWeightError(null); }} title="Log Weight">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Current weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weightInput}
              onChange={e => { setWeightInput(e.target.value); setWeightError(null); }}
              onKeyDown={e => e.key === "Enter" && handleAddWeight()}
              placeholder="e.g. 77.4"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60 transition"
            />
            {weightError && <p className="mt-1.5 text-xs text-destructive">{weightError}</p>}
          </div>
          <button
            onClick={handleAddWeight}
            disabled={weightMutation.isPending}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition"
          >
            {weightMutation.isPending ? "Saving…" : "Save Weight"}
          </button>
          {weightMutation.isError && (
            <p className="text-xs text-destructive text-center">
              {(weightMutation.error as Error)?.message || "Failed to save weight."}
            </p>
          )}
        </div>
      </Modal>

      {/* Goals Modal */}
      <Modal open={showGoalsModal} onClose={() => setShowGoalsModal(false)} title={`Monthly Goals — ${goals.completed} / ${goals.total} Complete`}>
        <div className="space-y-3">
          {goals.items.map((g: any) => (
            <div key={g.id} className={`rounded-xl border p-3 ${g.completed ? "border-primary/20 bg-primary/5" : "border-border bg-card-elevated"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{g.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${g.completed ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {g.current}/{g.target}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${g.completed ? "bg-primary" : "bg-primary/50"}`}
                  style={{ width: `${g.percentage}%` }}
                />
              </div>
            </div>
          ))}
          {goals.items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Your goals will appear here after setting up your fitness profile.
            </p>
          )}
        </div>
      </Modal>

      {/* Achievements Modal */}
      <Modal open={showAchievementsModal} onClose={() => setShowAchievementsModal(false)} title={`Achievements — ${achievements.unlocked} / ${achievements.total} Unlocked`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {achievements.items.map((a: any) => (
            <div
              key={a.code}
              className={`rounded-xl border p-3 ${a.unlocked ? "border-primary/30 bg-primary/5" : "border-border bg-card-elevated opacity-60"}`}
            >
              <div className="flex items-center gap-3">
                <AchievementIcon icon={a.icon} unlocked={a.unlocked} />
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {a.unlocked && a.unlocked_at && (
                    <p className="text-[10px] text-primary/70 mt-0.5">
                      {new Date(a.unlocked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

    </AppLayout>
  );
}

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Apple, Coffee, UtensilsCrossed, Moon, CheckCircle2, Circle, Settings, Clock, Flame, X, Sparkles, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { getTodayNutrition, logNutritionMeal, unlogNutritionMeal, getWeeklyAnalysis, getAdaptiveRecommendations, replaceMeal, submitMealFeedback } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/nutrition")({
  head: () => ({
    meta: [
      { title: "Nutrition — FitAssist" },
      { name: "description", content: "Track your meals, macros, and nutrition score with AI-personalized recommendations." },
    ],
  }),
  component: NutritionPage,
});

function getMealIcon(type: string) {
  if (type === "breakfast") return Coffee;
  if (type === "lunch") return UtensilsCrossed;
  if (type === "dinner") return Moon;
  return Apple;
}

function NutritionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [replaceMealId, setReplaceMealId] = useState<string | null>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const [adaptiveRec, setAdaptiveRec] = useState<any>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ["nutrition", "today"],
    queryFn: getTodayNutrition,
    retry: false
  });

  const { data: weeklyData } = useQuery({
    queryKey: ["nutrition", "weekly"],
    queryFn: getWeeklyAnalysis
  });

  const logMutation = useMutation({
    mutationFn: (meal: any) => logNutritionMeal({
      meal_id: meal.id,
      meal_type: meal.type,
      meal_name: meal.name,
      calories: meal.calories,
      protein_g: meal.protein_g !== undefined ? meal.protein_g : meal.protein,
      carbs_g: meal.carbs_g !== undefined ? meal.carbs_g : meal.carbs,
      fat_g: meal.fat_g !== undefined ? meal.fat_g : meal.fat
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", "today"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "weekly"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAdaptiveRec(null);
    }
  });

  const unlogMutation = useMutation({
    mutationFn: (logId: string) => unlogNutritionMeal(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", "today"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "weekly"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  
  const replaceMutation = useMutation({
    mutationFn: ({ mealId, reason }: {mealId: string, reason: string}) => replaceMeal(mealId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", "today"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "weekly"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Meal replaced successfully");
      setReplaceMealId(null);
      setReplaceReason("");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Unable to find a replacement meal.");
    }
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ mealId, type }: {mealId: string, type: string}) => submitMealFeedback(mealId, type)
  });

  const generateRecsMutation = useMutation({
    mutationFn: (exclude?: string[]) => getAdaptiveRecommendations(exclude),
    onSuccess: (data) => {
      setAdaptiveRec(data.adaptive_recommendation);
      queryClient.invalidateQueries({ queryKey: ["nutrition", "today"] });
    }
  });

  const toggleMeal = (meal: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (logMutation.isPending || unlogMutation.isPending) return;
    
    const logEntry = data?.logged_meals?.find((log: any) => log.meal_id === meal.id);
    if (logEntry) {
      unlogMutation.mutate(logEntry.id);
    } else {
      logMutation.mutate(meal);
    }
  };
  
  const handleReplace = (mealId: string) => {
    if (!replaceReason) return;
    replaceMutation.mutate({ mealId, reason: replaceReason });
  };

  if (loading) {
    return (
      <AppLayout title="Nutrition" subtitle="Track your daily consumption and meal plan.">
        <div className="flex h-64 items-center justify-center">
          <p className="text-muted-foreground animate-pulse">Personalizing your nutrition plan...</p>
        </div>
      </AppLayout>
    );
  }

  const errorMsg = queryError?.message;
  if (errorMsg?.includes("404") || errorMsg?.includes("preferences not found")) {
    return (
      <AppLayout title="Nutrition" subtitle="Track your daily consumption and meal plan.">
        <div className="flex h-96 flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border p-6 bg-card-elevated/30">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Apple className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Personalize Your Nutrition</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            FitAssist needs to know your dietary preferences, allergies, and goals to generate your personalized meal plan.
          </p>
          <button 
            onClick={() => navigate({ to: "/settings" })}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            <Settings className="h-4 w-4" /> Go to Settings
          </button>
        </div>
      </AppLayout>
    );
  }
  
  if (queryError || !data) {
    return (
      <AppLayout title="Nutrition" subtitle="Track your daily consumption and meal plan.">
        <div className="flex h-96 flex-col items-center justify-center text-center rounded-2xl border border-dashed border-destructive/30 p-6 bg-card-elevated/30 max-w-lg mx-auto mt-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Apple className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Unable to Load Nutrition Plan</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            {errorMsg || "An error occurred loading your nutrition plan. Please try reloading or check your preferences."}
          </p>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => refetch()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 shadow-md"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
            <button 
              onClick={() => navigate({ to: "/settings" })}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium transition-all hover:bg-card-elevated"
            >
              <Settings className="h-4 w-4" /> Settings
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { targets, meals, personalized_for, consumed, score, logged_meals, ai_insight } = data;
  
  const scoreData = [
    { v: score.value, name: "score" },
    { v: Math.max(0, 100 - score.value), name: "rest" },
  ];

  return (
    <AppLayout title="Nutrition" subtitle="Track your daily consumption and meal plan.">
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
        <div className="flex items-center gap-2 font-semibold">
           <Apple className="h-4 w-4" /> Personalized for you:
        </div>
        <span className="rounded-md bg-background/50 px-2 py-1 text-xs capitalize border border-primary/10">{personalized_for.goal.replace('_', ' ')}</span>
        <span className="rounded-md bg-background/50 px-2 py-1 text-xs capitalize border border-primary/10">{personalized_for.dietary_preference.replace('_', ' ')}</span>
        <span className="rounded-md bg-background/50 px-2 py-1 text-xs capitalize border border-primary/10">{personalized_for.cuisine} cuisine</span>
      </div>
      
      {ai_insight && (
        <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/30 p-5 shadow-lg relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Sparkles className="w-16 h-16 text-blue-300" />
           </div>
           <div className="flex items-start gap-4 relative z-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-blue-100">Today's AI Insight</h4>
                <p className="mt-1 text-sm text-blue-200/80 leading-relaxed">{ai_insight.content}</p>
              </div>
           </div>
        </div>
      )}

      {adaptiveRec && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-card to-card-elevated border border-primary/20 p-6 shadow-2xl relative overflow-hidden group animate-in slide-in-from-top duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Sparkles className="w-24 h-24 text-primary" />
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-primary mb-2">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">Adaptive Recommendation</span>
              </div>
              <h3 className="text-xl font-bold text-foreground">{adaptiveRec.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">{adaptiveRec.explanation}</p>
              
              {adaptiveRec.meal && (
                <div className="mt-4 p-4 rounded-xl bg-card-elevated border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
                      {adaptiveRec.meal.name}
                      <span className="text-xs font-normal text-muted-foreground capitalize">({adaptiveRec.meal.type})</span>
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{adaptiveRec.meal.description}</p>
                    {adaptiveRec.meal.prep_time && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-2">
                        <Clock className="w-3 h-3 text-blue-400" /> {adaptiveRec.meal.prep_time} mins prep
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {adaptiveRec.nutrition_delta && (
                      <div className="grid grid-cols-2 gap-2 text-right">
                        <div className="text-[10px] text-muted-foreground bg-primary/5 border border-primary/10 rounded px-2 py-0.5">
                          <span className="font-semibold text-primary">+{adaptiveRec.nutrition_delta.protein}g</span> Protein
                        </div>
                        <div className="text-[10px] text-muted-foreground bg-orange-500/5 border border-orange-500/10 rounded px-2 py-0.5">
                          <span className="font-semibold text-orange-400">+{adaptiveRec.nutrition_delta.calories}</span> kcal
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-row md:flex-col gap-2 justify-end self-stretch md:self-center">
              {adaptiveRec.status !== "on_track" && adaptiveRec.meal && (
                <>
                  <button
                    onClick={() => logMutation.mutate(adaptiveRec.meal)}
                    disabled={logMutation.isPending}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-lg hover:shadow-primary/20 disabled:opacity-50"
                  >
                    Add to Nutrition
                  </button>
                  <button
                    onClick={() => {
                      const nextExclusions = [...excludedIds, adaptiveRec.meal.id];
                      setExcludedIds(nextExclusions);
                      generateRecsMutation.mutate(nextExclusions);
                    }}
                    disabled={generateRecsMutation.isPending}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold transition-all hover:bg-card-elevated disabled:opacity-50"
                  >
                    Find Another
                  </button>
                </>
              )}
              <button
                onClick={() => setAdaptiveRec(null)}
                className="rounded-xl border border-border bg-card p-3 text-muted-foreground hover:bg-card-elevated hover:text-foreground transition-colors self-end md:self-auto"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
          {[
            { label: "Calories", value: consumed.calories.toLocaleString(), hint: `of ${targets.calories} kcal`, current: consumed.calories, target: targets.calories },
            { label: "Protein", value: `${consumed.protein}g`, hint: `Goal ${targets.protein}g`, current: consumed.protein, target: targets.protein },
            { label: "Carbs", value: `${consumed.carbs}g`, hint: `Goal ${targets.carbs}g`, current: consumed.carbs, target: targets.carbs },
            { label: "Fats", value: `${consumed.fat}g`, hint: `Goal ${targets.fat}g`, current: consumed.fat, target: targets.fat },
          ].map((s) => (
            <div key={s.label} className="group rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/30">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground/70">{s.hint}</p>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out" 
                  style={{ width: `${Math.min(100, (s.current / s.target) * 100)}%` }} 
                />
              </div>
            </div>
          ))}
        </div>

        {/* Nutrition Score Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Nutrition Score</p>
              <p className="text-xs text-muted-foreground">Macro balance & quality</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          
          <div className="relative mx-auto mt-6 h-48 w-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie 
                  data={scoreData} 
                  dataKey="v" 
                  innerRadius={65} 
                  outerRadius={85} 
                  startAngle={90} 
                  endAngle={-270} 
                  stroke="none"
                  animationBegin={0}
                  animationDuration={1000}
                >
                  <Cell fill="var(--primary)" />
                  <Cell fill="var(--card-elevated)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tracking-tight">{score.value}%</span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {score.value > 80 ? "Excellent" : score.value > 50 ? "Good" : "Pending"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Today's Meal Plan</h2>
        <div className="flex items-center gap-4">
           <button 
             onClick={() => generateRecsMutation.mutate(excludedIds)}
             disabled={generateRecsMutation.isPending}
             className="text-xs flex items-center gap-1.5 text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
           >
             <Sparkles className="w-3 h-3" />
             {generateRecsMutation.isPending ? "Generating..." : "Adaptive Recs"}
           </button>
           <span className="text-xs text-muted-foreground">{logged_meals?.length || 0} of {meals.length} logged</span>
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        {meals.map((m: any) => {
          const Icon = getMealIcon(m.type);
          const isEaten = logged_meals?.some((log: any) => log.meal_id === m.id);
          return (
            <div 
              key={m.id} 
              onClick={() => setSelectedMeal(m)}
              className={cn(
                "group relative cursor-pointer rounded-2xl border p-5 shadow-[var(--shadow-card)] transition-all duration-300",
                isEaten 
                  ? "border-primary/40 bg-card-elevated/50" 
                  : "border-border bg-card hover:border-primary/20",
                m.reason ? "border-blue-500/30" : ""
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                    isEaten ? "bg-primary text-primary-foreground" : "bg-card-elevated text-primary"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.type} • {m.calories} kcal</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   {!isEaten && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setReplaceMealId(m.id); }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-card-elevated text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                        title="Replace Meal"
                      >
                         <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                   )}
                   <button 
                     onClick={(e) => toggleMeal(m, e)}
                     disabled={logMutation.isPending || unlogMutation.isPending}
                     className={cn(
                       "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all",
                       isEaten 
                         ? "bg-primary/20 text-primary hover:bg-primary/30" 
                         : "bg-card-elevated text-muted-foreground hover:bg-primary/10 hover:text-primary",
                       (logMutation.isPending || unlogMutation.isPending) && "opacity-50 cursor-not-allowed"
                     )}
                   >
                     {isEaten ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                   </button>
                </div>
              </div>
              
              {m.reason && (
                 <div className="mt-4 text-xs p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200">
                    <span className="font-semibold block mb-1">Why this was recommended</span>
                    {m.reason}
                 </div>
              )}

              <div className="mt-5 space-y-2">
                <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                {m.ingredients?.slice(0, 3).map((i: string) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs text-foreground/70">
                    <div className="h-1 w-1 rounded-full bg-primary/40" />
                    {i}
                  </div>
                ))}
                {m.ingredients?.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-3.5">+ {m.ingredients.length - 3} more ingredients</div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2">
                <MiniMacro label="P" value={m.protein_g || m.protein} color="var(--chart-1)" />
                <MiniMacro label="C" value={m.carbs_g || m.carbs} color="var(--chart-2)" />
                <MiniMacro label="F" value={m.fat_g || m.fat} color="var(--chart-4)" />
              </div>
              
              {isEaten && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/60 to-secondary/60 rounded-b-2xl" />
              )}
            </div>
          );
        })}
      </div>
      
      {weeklyData && (
         <div className="mt-10 mb-10">
            <h2 className="text-lg font-semibold mb-4">Weekly Nutrition Analytics</h2>
            <div className="grid gap-6 lg:grid-cols-2">
               <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                  <h3 className="text-sm font-semibold mb-6">Macro Adherence (Last 7 Days)</h3>
                  <div className="h-48">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                           { name: 'Calories', score: weeklyData.adherence.calories, fill: 'var(--primary)' },
                           { name: 'Protein', score: weeklyData.adherence.protein, fill: 'var(--chart-1)' },
                           { name: 'Carbs', score: weeklyData.adherence.carbs, fill: 'var(--chart-2)' },
                           { name: 'Fat', score: weeklyData.adherence.fat, fill: 'var(--chart-4)' },
                        ]} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                           <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                           <Tooltip cursor={{ fill: 'var(--card-elevated)' }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }} />
                           <Bar dataKey="score" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
               </div>
               
               <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                  <h3 className="text-sm font-semibold mb-4">AI Weekly Insight</h3>
                  <div className="space-y-4">
                     {weeklyData.insights.map((insight: string, i: number) => (
                        <div key={i} className="flex gap-3 text-sm text-muted-foreground p-4 rounded-xl bg-card-elevated/50">
                           <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
                           <p>{insight}</p>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      )}

      {selectedMeal && (
        <MealDetailModal 
          meal={selectedMeal} 
          onClose={() => setSelectedMeal(null)} 
          onFeedback={(type) => {
             feedbackMutation.mutate({ mealId: selectedMeal.id, type });
          }}
        />
      )}
      
      {replaceMealId && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in" onClick={() => !replaceMutation.isPending && setReplaceMealId(null)}>
            <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
               <div className="flex items-center justify-between mb-2">
                 <h3 className="text-xl font-bold">Replace Meal</h3>
                 <button 
                   onClick={() => setReplaceMealId(null)}
                   disabled={replaceMutation.isPending}
                   className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                 >
                   <X className="h-4 w-4" />
                 </button>
               </div>
               <p className="text-sm text-muted-foreground mb-6">Let the AI know why you want a different meal.</p>
               
               {replaceMutation.isError && (
                 <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
                   <span>{replaceMutation.error?.message || "Unable to find a replacement meal."}</span>
                   <button 
                     onClick={() => handleReplace(replaceMealId)}
                     className="underline font-semibold ml-2 hover:opacity-80"
                   >
                     Try Again
                   </button>
                 </div>
               )}

               <div className="space-y-2 mb-6">
                  {["Too many calories", "Need more protein", "Don't like the ingredients", "Takes too long to prep", "Just want something else"].map(reason => (
                     <label key={reason} className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                        replaceReason === reason ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-card-elevated",
                        replaceMutation.isPending && "opacity-50 cursor-not-allowed"
                     )}>
                        <input 
                          type="radio" 
                          name="reason" 
                          className="hidden" 
                          checked={replaceReason === reason} 
                          onChange={() => !replaceMutation.isPending && setReplaceReason(reason)}
                          disabled={replaceMutation.isPending}
                        />
                        <span className="text-sm font-medium">{reason}</span>
                     </label>
                  ))}
               </div>
               
               <div className="flex gap-3">
                  <button 
                    onClick={() => setReplaceMealId(null)} 
                    disabled={replaceMutation.isPending}
                    className="flex-1 rounded-xl bg-card-elevated py-3 text-sm font-medium hover:bg-border transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                     onClick={() => handleReplace(replaceMealId)} 
                     disabled={!replaceReason || replaceMutation.isPending}
                     className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                     {replaceMutation.isPending ? <Sparkles className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                     {replaceMutation.isPending ? "Finding Replacement..." : "Find Replacement"}
                  </button>
               </div>
            </div>
         </div>
      )}
    </AppLayout>
  );
}

function MiniMacro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-card-elevated/40 p-2 border border-border/50">
      <p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold" style={{ color }}>{value}g</p>
    </div>
  );
}

function MealDetailModal({ meal, onClose, onFeedback }: { meal: any, onClose: () => void, onFeedback: (type: string) => void }) {
  const Icon = getMealIcon(meal.type);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div 
        className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-card-elevated hover:bg-primary/20 hover:text-primary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{meal.name}</h3>
            <p className="text-sm text-muted-foreground capitalize">{meal.type}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-card-elevated px-3 py-1.5 text-xs font-medium">
             <Flame className="h-3.5 w-3.5 text-orange-500" />
             {meal.calories} kcal
          </div>
          {meal.prep_time && (
            <div className="flex items-center gap-1.5 rounded-lg bg-card-elevated px-3 py-1.5 text-xs font-medium">
               <Clock className="h-3.5 w-3.5 text-blue-500" />
               {meal.prep_time} mins
            </div>
          )}
        </div>

        <p className="mt-6 text-sm text-foreground/80 leading-relaxed">
          {meal.description || "A delicious and healthy meal choice."}
        </p>

        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-3">Ingredients</h4>
          <ul className="grid grid-cols-2 gap-2">
            {meal.ingredients?.map((ing: string, i: number) => (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {ing}
              </li>
            ))}
          </ul>
        </div>
        
        {meal.instructions && (
           <div className="mt-6 border-t border-border pt-4">
              <h4 className="text-sm font-semibold mb-3">Instructions</h4>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{meal.instructions}</p>
           </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
           <span className="text-sm text-muted-foreground">How was this meal?</span>
           <div className="flex gap-2">
              <button 
                onClick={() => { onFeedback("dislike"); setFeedbackGiven(true); }}
                disabled={feedbackGiven}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card-elevated hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50 text-xs font-medium"
              >
                 <ThumbsDown className="w-3.5 h-3.5" /> Dislike
              </button>
              <button 
                onClick={() => { onFeedback("like"); setFeedbackGiven(true); }}
                disabled={feedbackGiven}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card-elevated hover:bg-green-500/10 hover:text-green-400 transition-colors disabled:opacity-50 text-xs font-medium"
              >
                 <ThumbsUp className="w-3.5 h-3.5" /> Like
              </button>
           </div>
        </div>

      </div>
    </div>
  );
}

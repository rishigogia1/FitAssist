import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { User, Bell, Shield, Smartphone, Palette, Globe, Save, Check, Activity } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { fetchWithAuth, getNutritionPreferences, updateNutritionPreferences } from "@/lib/api-client";
import { Coffee } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FitAssist" },
      { name: "description", content: "Manage your FitAssist profile, notifications, and security settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { email, displayName, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  
  // Local state for the input field
  const [localName, setLocalName] = useState(displayName || "");
  
  // Fitness profile state
  const [fitnessData, setFitnessData] = useState({ age: "", weight: "", height: "", sex: "male", fitness_goal: "", fitness_level: "" });
  const [isFitnessLoading, setIsFitnessLoading] = useState(false);
  
  // Nutrition profile state
  const [nutritionData, setNutritionData] = useState({ 
    dietary_preference: "no_preference", 
    cuisine_preference: "mixed", 
    meals_per_day: 3, 
    allergies: [] as string[], 
    foods_liked: "", 
    foods_disliked: "" 
  });
  const [isNutritionLoading, setIsNutritionLoading] = useState(false);
  
  useEffect(() => {
    if (activeTab === "fitness") {
      setIsFitnessLoading(true);
      fetchWithAuth("/api/v1/profile")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setFitnessData({
            age: data.age.toString(),
            weight: data.weight.toString(),
            height: data.height ? data.height.toString() : "",
            sex: data.sex || "male",
            fitness_goal: data.fitness_goal,
            fitness_level: data.fitness_level
          });
          setIsFitnessLoading(false);
        }).catch(() => setIsFitnessLoading(false));
    } else if (activeTab === "nutrition") {
      setIsNutritionLoading(true);
      getNutritionPreferences()
        .then(data => {
          if (data) setNutritionData({
            dietary_preference: data.dietary_preference,
            cuisine_preference: data.cuisine_preference,
            meals_per_day: data.meals_per_day,
            allergies: data.allergies || [],
            foods_liked: data.foods_liked || "",
            foods_disliked: data.foods_disliked || ""
          });
          setIsNutritionLoading(false);
        }).catch(() => setIsNutritionLoading(false));
    }
  }, [activeTab]);

  const handleFitnessSave = async () => {
    setIsSaving(true);
    try {
      await fetchWithAuth("/api/v1/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: parseInt(fitnessData.age),
          weight: parseFloat(fitnessData.weight),
          height: fitnessData.height ? parseFloat(fitnessData.height) : null,
          sex: fitnessData.sex,
          fitness_goal: fitnessData.fitness_goal,
          fitness_level: fitnessData.fitness_level
        })
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };

  // Update local name if the context name changes (e.g. on first load)
  useEffect(() => {
    if (displayName) setLocalName(displayName);
  }, [displayName]);

  const initials = useMemo(() => {
    const name = localName || email?.split("@")[0] || "User";
    return name.substring(0, 2).toUpperCase();
  }, [localName, email]);

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "fitness", label: "Fitness Profile", icon: Activity },
    { id: "nutrition", label: "Nutrition Preferences", icon: Coffee },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "privacy", label: "Privacy & Security", icon: Shield },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "devices", label: "Devices", icon: Smartphone },
    { id: "language", label: "Language", icon: Globe },
  ];

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API delay
    setTimeout(() => {
      updateProfile(localName);
      setIsSaving(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    }, 600);
  };

  return (
    <AppLayout title="Settings" subtitle="Manage your account preferences and app configuration.">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Tabs */}
        <aside className="w-full lg:w-64 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-card-elevated hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </aside>

        {/* Content Area */}
        <div className="flex-1 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          {activeTab === "profile" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Public Profile</h3>
                  <p className="text-xs text-muted-foreground">Manage how you appear to others in the community.</p>
                </div>
                {showSaved && (
                  <div className="flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-[color:var(--success)] animate-in fade-in slide-in-from-right-2">
                    <Check className="h-3 w-3" /> Changes saved
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl font-bold text-primary-foreground shadow-xl">
                    {initials}
                  </div>
                  <button className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-card-elevated border border-border flex items-center justify-center shadow-lg hover:text-primary transition-colors">
                    <Smartphone className="h-3 w-3" />
                  </button>
                </div>
                <div>
                  <h4 className="font-medium capitalize">{localName || email?.split("@")[0]}</h4>
                  <p className="text-xs text-muted-foreground">Pro Member since April 2026</p>
                  <button className="mt-2 text-xs font-medium text-primary hover:underline text-left">Change avatar</button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                  <input 
                    type="text" 
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50 capitalize" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                  <input 
                    type="email" 
                    readOnly
                    value={email || ""}
                    className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Bio</label>
                <textarea 
                  rows={3}
                  placeholder="Tell us about your fitness journey..."
                  className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50 resize-none" 
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  onClick={() => setLocalName(displayName || "")}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-card-elevated"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving || !localName}
                  className={cn(
                    "flex items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98]",
                    (isSaving || !localName) ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
                  )}
                >
                  {isSaving ? "Saving..." : <><Save className="h-4 w-4" /> Save Changes</>}
                </button>
              </div>
            </div>
          )}

          {activeTab === "fitness" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Fitness Profile</h3>
                  <p className="text-xs text-muted-foreground">Manage your body metrics and fitness goals.</p>
                </div>
                {showSaved && (
                  <div className="flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-[color:var(--success)] animate-in fade-in slide-in-from-right-2">
                    <Check className="h-3 w-3" /> Changes saved
                  </div>
                )}
              </div>

              {isFitnessLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : (
                <div className="space-y-6 mt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Age</label>
                      <input 
                        type="number" 
                        value={fitnessData.age}
                        onChange={(e) => setFitnessData({...fitnessData, age: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Weight (kg)</label>
                      <input 
                        type="number" 
                        value={fitnessData.weight}
                        onChange={(e) => setFitnessData({...fitnessData, weight: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Height (cm)</label>
                      <input 
                        type="number" 
                        value={fitnessData.height}
                        onChange={(e) => setFitnessData({...fitnessData, height: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Sex</label>
                      <select 
                        value={fitnessData.sex}
                        onChange={(e) => setFitnessData({...fitnessData, sex: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Goal</label>
                      <select 
                        value={fitnessData.fitness_goal}
                        onChange={(e) => setFitnessData({...fitnessData, fitness_goal: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      >
                        <option value="weight_loss">Weight Loss</option>
                        <option value="muscle_gain">Muscle Gain</option>
                        <option value="endurance">Endurance</option>
                        <option value="general_fitness">General Fitness</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Fitness Level</label>
                      <select 
                        value={fitnessData.fitness_level}
                        onChange={(e) => setFitnessData({...fitnessData, fitness_level: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button 
                      onClick={handleFitnessSave}
                      disabled={isSaving}
                      className={cn(
                        "flex items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98]",
                        isSaving ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
                      )}
                    >
                      {isSaving ? "Saving..." : <><Save className="h-4 w-4" /> Save Changes</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


          {activeTab === "nutrition" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Nutrition Preferences</h3>
                  <p className="text-xs text-muted-foreground">Tell FitAssist about your dietary habits to get personalized meals.</p>
                </div>
                {showSaved && (
                  <div className="flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-[color:var(--success)] animate-in fade-in slide-in-from-right-2">
                    <Check className="h-3 w-3" /> Changes saved
                  </div>
                )}
              </div>

              {isNutritionLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading preferences...</div>
              ) : (
                <div className="space-y-6 mt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Dietary Preference</label>
                      <select 
                        value={nutritionData.dietary_preference}
                        onChange={(e) => setNutritionData({...nutritionData, dietary_preference: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      >
                        <option value="no_preference">No Preference</option>
                        <option value="vegetarian">Vegetarian</option>
                        <option value="vegan">Vegan</option>
                        <option value="eggetarian">Eggetarian</option>
                        <option value="non_vegetarian">Non Vegetarian</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Cuisine Preference</label>
                      <select 
                        value={nutritionData.cuisine_preference}
                        onChange={(e) => setNutritionData({...nutritionData, cuisine_preference: e.target.value})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50" 
                      >
                        <option value="mixed">Mixed</option>
                        <option value="indian">Indian</option>
                        <option value="mediterranean">Mediterranean</option>
                        <option value="asian">Asian</option>
                        <option value="western">Western</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Meals Per Day</label>
                      <select 
                        value={nutritionData.meals_per_day}
                        onChange={(e) => setNutritionData({...nutritionData, meals_per_day: parseInt(e.target.value)})}
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50 opacity-70"
                        disabled
                      >
                        <option value={3}>3 meals</option>
                      </select>
                      <p className="text-[10px] text-muted-foreground">Phase 1 currently supports 3 core meals.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-medium text-muted-foreground">Food Allergies</label>
                    <div className="flex flex-wrap gap-2">
                      {["peanuts", "dairy", "eggs", "gluten", "soy", "none"].map(allergy => {
                        const isSelected = nutritionData.allergies.includes(allergy);
                        return (
                          <button
                            key={allergy}
                            onClick={() => {
                              let newAllergies = [...nutritionData.allergies];
                              if (allergy === "none") {
                                newAllergies = ["none"];
                              } else {
                                newAllergies = newAllergies.filter(a => a !== "none");
                                if (isSelected) newAllergies = newAllergies.filter(a => a !== allergy);
                                else newAllergies.push(allergy);
                              }
                              setNutritionData({...nutritionData, allergies: newAllergies});
                            }}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                              isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-card-elevated text-muted-foreground hover:bg-card-elevated/80"
                            )}
                          >
                            {allergy}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Foods I Like</label>
                      <textarea 
                        rows={3}
                        value={nutritionData.foods_liked}
                        onChange={(e) => setNutritionData({...nutritionData, foods_liked: e.target.value})}
                        placeholder="E.g. Paneer, rice, fruits..."
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50 resize-none" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Foods I Don't Like</label>
                      <textarea 
                        rows={3}
                        value={nutritionData.foods_disliked}
                        onChange={(e) => setNutritionData({...nutritionData, foods_disliked: e.target.value})}
                        placeholder="E.g. Mushrooms, spicy food..."
                        className="w-full rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm outline-none focus:border-primary/50 resize-none" 
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button 
                      onClick={async () => {
                        setIsSaving(true);
                        try {
                          await updateNutritionPreferences(nutritionData);
                          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                          queryClient.invalidateQueries({ queryKey: ["nutrition"] });
                          setShowSaved(true);
                          setTimeout(() => setShowSaved(false), 3000);
                        } catch(e) { console.error(e); }
                        setIsSaving(false);
                      }}
                      disabled={isSaving}
                      className={cn(
                        "flex items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98]",
                        isSaving ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
                      )}
                    >
                      {isSaving ? "Saving..." : <><Save className="h-4 w-4" /> Save Preferences</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab !== "profile" && activeTab !== "fitness" && activeTab !== "nutrition" && (
            <div className="flex h-64 flex-col items-center justify-center text-center text-muted-foreground">
              <div className="mb-4 rounded-full bg-card-elevated p-4">
                <Shield className="h-8 w-8 opacity-20" />
              </div>
              <p className="text-sm font-medium">This section is coming soon.</p>
              <p className="text-xs">We're working hard to bring you more customization options.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

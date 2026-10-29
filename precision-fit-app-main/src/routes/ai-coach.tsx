import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { 
  Bot, 
  Send, 
  Sparkles, 
  User, 
  Dumbbell, 
  Flame, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw,
  Plus,
  MessageSquare,
  History,
  Trash2,
  Clock,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  coachChat, 
  getCoachInsight, 
  getCoachSuggestions, 
  getCoachHistory,
  getCoachSessions,
  deleteCoachSession
} from "@/lib/api-client";

export const Route = createFileRoute("/ai-coach")({
  head: () => ({
    meta: [
      { title: "AI Coach — FitAssist" },
      { name: "description", content: "Chat with your personal AI fitness coach for workout, nutrition, and recovery guidance." },
    ],
  }),
  component: AICoach,
});

function formatTimeAgo(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (e) {
    return "";
  }
}

function AICoach() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<number, boolean>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(true);

  // 1. Fetch Sessions List
  const { 
    data: sessionsData, 
    isLoading: isSessionsLoading,
    refetch: refetchSessions 
  } = useQuery({
    queryKey: ["coach", "sessions"],
    queryFn: getCoachSessions,
  });

  // Automatically select the most recent session on initial load, or start fresh if no history
  useEffect(() => {
    if (activeSessionId === undefined && sessionsData?.sessions) {
      if (sessionsData.sessions.length > 0) {
        setActiveSessionId(sessionsData.sessions[0].session_id);
      } else {
        setActiveSessionId(null);
      }
    }
  }, [sessionsData, activeSessionId]);

  // 2. Fetch History for the Active Session
  const { 
    data: historyData, 
    isLoading: isHistoryLoading, 
    isError: isHistoryError,
    refetch: refetchHistory
  } = useQuery({
    queryKey: ["coach", "history", activeSessionId],
    queryFn: () => getCoachHistory(activeSessionId),
    enabled: activeSessionId !== null && activeSessionId !== undefined,
  });

  // 3. Fetch Insight
  const { 
    data: insightData, 
    isLoading: isInsightLoading, 
    isError: isInsightError,
    refetch: refetchInsight 
  } = useQuery({
    queryKey: ["coach", "insight"],
    queryFn: getCoachInsight,
  });

  // 4. Fetch Suggestions
  const { 
    data: suggestionsData,
    isLoading: isSuggestionsLoading 
  } = useQuery({
    queryKey: ["coach", "suggestions"],
    queryFn: getCoachSuggestions,
  });

  // 5. Send Message Mutation
  const chatMutation = useMutation({
    mutationFn: ({ message, sessionId }: { message: string; sessionId?: string | null }) => 
      coachChat(message, sessionId),
    onSuccess: (data) => {
      if (data?.session_id) {
        setActiveSessionId(data.session_id);
        queryClient.invalidateQueries({ queryKey: ["coach", "history", data.session_id] });
      }
      queryClient.invalidateQueries({ queryKey: ["coach", "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["coach", "insight"] });
      queryClient.invalidateQueries({ queryKey: ["coach", "suggestions"] });
    }
  });

  // 6. Delete Session Mutation
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteCoachSession(sessionId),
    onSuccess: (_, deletedSessionId) => {
      queryClient.invalidateQueries({ queryKey: ["coach", "sessions"] });
      if (activeSessionId === deletedSessionId) {
        const remaining = sessionsData?.sessions?.filter((s: any) => s.session_id !== deletedSessionId) || [];
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].session_id);
        } else {
          setActiveSessionId(null);
        }
      }
    }
  });

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [historyData, chatMutation.isPending, activeSessionId]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setExpandedReasoning({});
    setInput("");
  };

  const handleSelectSession = (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setExpandedReasoning({});
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this conversation?")) {
      deleteMutation.mutate(sessionId);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || chatMutation.isPending) return;
    setInput("");
    
    try {
      const targetSessionId = activeSessionId === null ? null : activeSessionId;
      const response = await chatMutation.mutateAsync({
        message: text,
        sessionId: targetSessionId
      });
      if (response?.session_id && activeSessionId !== response.session_id) {
        setActiveSessionId(response.session_id);
      }
    } catch (e) {
      console.error("Failed to send chat:", e);
    }
  };

  const handleAction = (action: any) => {
    if (action.type === "START_WORKOUT" && action.payload?.workout_id) {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      queryClient.invalidateQueries({ queryKey: ["workout-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/workout/$id", params: { id: action.payload.workout_id } });
    } else if (action.type === "NUTRITION_RECOMMENDATION") {
      queryClient.invalidateQueries({ queryKey: ["nutrition", "today"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "weekly"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/nutrition" });
    } else if (action.type === "VIEW_PROGRESS") {
      navigate({ to: "/progress" });
    }
  };

  const toggleReasoning = (idx: number) => {
    setExpandedReasoning(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const parseMetadata = (metaStr: string | null) => {
    if (!metaStr) return null;
    try {
      return JSON.parse(metaStr);
    } catch (e) {
      return null;
    }
  };

  const chatHistory = activeSessionId === null ? [] : (historyData?.history || []);
  const sessions = sessionsData?.sessions || [];
  const activeSession = sessions.find((s: any) => s.session_id === activeSessionId);
  const activeTitle = activeSessionId === null ? "New Conversation" : (activeSession?.title || "FitAssist Coach");

  return (
    <AppLayout title="AI Coach" subtitle="Personalized guidance, adaptive to your data.">
      <div className={`grid gap-4 h-[calc(100vh-12rem)] transition-all ${
        showHistory 
          ? "lg:grid-cols-[260px_1fr_300px]" 
          : "lg:grid-cols-[1fr_300px]"
      }`}>
        {/* Left: Previous Chat Histories Sidebar */}
        {showHistory && (
          <aside className="flex flex-col h-full rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Chat History</span>
              </div>
              <button 
                onClick={() => setShowHistory(false)}
                title="Collapse history"
                className="rounded-lg p-1 text-muted-foreground hover:bg-card-elevated hover:text-foreground transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            {/* New Chat Primary Action Button */}
            <div className="p-3 border-b border-border/50">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 active:scale-95 transition-all"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isSessionsLoading && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Loading conversations...
                </div>
              )}

              {!isSessionsLoading && sessions.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground space-y-2">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                  <p>No saved conversations yet.</p>
                  <p className="text-[11px] text-muted-foreground/70">Your chats are automatically saved and will appear here.</p>
                </div>
              )}

              {sessions.map((s: any) => {
                const isActive = s.session_id === activeSessionId;
                return (
                  <div
                    key={s.session_id}
                    onClick={() => handleSelectSession(s.session_id)}
                    className={`group relative flex items-center justify-between rounded-xl p-2.5 cursor-pointer text-xs transition-all border ${
                      isActive 
                        ? "bg-primary/10 border-primary/30 text-primary font-medium shadow-sm" 
                        : "hover:bg-card-elevated border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 pr-1 flex-1">
                      <MessageSquare className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs ${isActive ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                          {s.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span>{formatTimeAgo(s.updated_at)}</span>
                          <span>•</span>
                          <span>{s.message_count} {s.message_count === 1 ? "msg" : "msgs"}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(e, s.session_id)}
                      title="Delete conversation"
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 rounded transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Center: Active Chat Window */}
        <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
            {!showHistory && (
              <button
                onClick={() => setShowHistory(true)}
                title="Show chat history"
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-card-elevated hover:text-foreground transition-colors mr-1"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{activeTitle}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">Online · adapts to your workout & nutrition history</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* New Chat Button */}
              <button
                onClick={handleNewChat}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-all active:scale-95 shadow-sm"
                title="Start a new conversation"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Chat</span>
              </button>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-6 scroll-smooth">
            {isHistoryLoading && activeSessionId !== null && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Retrieving your chat log...
              </div>
            )}
            
            {isHistoryError && (
              <div className="flex h-full flex-col items-center justify-center text-sm text-destructive gap-3 text-center p-4">
                <p>Failed to load conversation history.</p>
                <button 
                  onClick={() => refetchHistory()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground font-medium hover:opacity-90"
                >
                  Retry
                </button>
              </div>
            )}

            {!isHistoryLoading && !isHistoryError && chatHistory.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center max-w-md mx-auto p-4 space-y-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 text-primary shadow-lg">
                  <Bot className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Start a New Conversation</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Ask your Coach for meal ideas, workout programming, form tips, or progress breakdown grounded in your database logs.
                  </p>
                </div>

                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-left">
                  {[
                    "What should I eat next?",
                    "Plan my workout for today",
                    "Help me reach my protein goal",
                    "Analyze my fitness progress"
                  ].map((starter) => (
                    <button
                      key={starter}
                      onClick={() => handleSend(starter)}
                      className="rounded-xl border border-border bg-card-elevated/70 p-2.5 text-xs text-foreground/80 hover:border-primary/40 hover:text-foreground hover:bg-card-elevated transition-all active:scale-95"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatHistory.map((m: any, i: number) => {
              const meta = parseMetadata(m.response_metadata);
              
              return (
                <div key={i} className={`flex gap-3 flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "ai" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card-elevated text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div className={`max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card-elevated text-foreground"
                    }`}>
                      <p className="whitespace-pre-line">{m.message}</p>

                      {/* Supporting Metrics Panel */}
                      {meta?.supporting_metrics && Object.keys(meta.supporting_metrics).length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
                          {Object.entries(meta.supporting_metrics).map(([key, val]: [string, any]) => (
                            <div key={key} className="flex justify-between border-b border-border/20 pb-0.5">
                              <span className="capitalize">{key.replace(/_/g, " ")}</span>
                              <span className="font-semibold text-foreground">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {m.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card-elevated">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  {/* Reasoning list dropdown & Action buttons for AI messages */}
                  {m.role === "ai" && meta && (
                    <div className="ml-11 max-w-md space-y-2">
                      {/* Explanatory Reasoning */}
                      {meta.reasoning && meta.reasoning.length > 0 && (
                        <div className="rounded-xl border border-border/50 bg-card/60 p-2 text-xs">
                          <button 
                            onClick={() => toggleReasoning(i)}
                            className="flex w-full items-center justify-between text-muted-foreground hover:text-foreground transition-colors font-medium px-1"
                          >
                            <span>Why this recommendation?</span>
                            {expandedReasoning[i] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          
                          {expandedReasoning[i] && (
                            <ul className="mt-1.5 list-disc pl-5 pr-2 space-y-1 text-muted-foreground/90 border-t border-border/20 pt-1.5">
                              {meta.reasoning.map((r: string, idx: number) => (
                                <li key={idx}>{r}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {meta.suggested_actions && meta.suggested_actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {meta.suggested_actions.map((act: any, idx: number) => (
                            <button
                              key={idx}
                              onClick={() => handleAction(act)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 active:scale-95 transition-all shadow-sm"
                            >
                              {act.type === "START_WORKOUT" ? (
                                <Dumbbell className="h-3 w-3" />
                              ) : act.type === "NUTRITION_RECOMMENDATION" ? (
                                <Flame className="h-3 w-3" />
                              ) : (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card-elevated text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl bg-card-elevated px-4 py-3 text-sm italic text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Form */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="border-t border-border p-4 bg-card"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 transition-colors">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(input);
                  }
                }}
                disabled={chatMutation.isPending}
                placeholder={chatMutation.isPending ? "Generating coach response..." : "Ask your coach anything…"}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={!input.trim() || chatMutation.isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right: Sidebar with Suggested Prompts & Today's Insight */}
        <aside className="space-y-4 overflow-y-auto">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold">Suggested prompts</p>
            <div className="mt-3 space-y-2">
              {suggestionsData?.suggestions?.map((p: string) => (
                <button 
                  key={p} 
                  onClick={() => handleSend(p)}
                  disabled={chatMutation.isPending}
                  className="block w-full rounded-xl border border-border bg-card-elevated px-3 py-2 text-left text-xs text-foreground/80 hover:border-primary/40 hover:text-foreground transition-all active:scale-95 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
              {isSuggestionsLoading && (
                <p className="text-xs text-muted-foreground">Loading suggestions...</p>
              )}
              {!isSuggestionsLoading && (!suggestionsData?.suggestions || suggestionsData.suggestions.length === 0) && (
                <p className="text-xs text-muted-foreground">No suggestions available right now.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card-elevated to-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" /> Today's insight
              </div>
              {insightData?.insight_type && insightData.insight_type !== "empty" && insightData.insight_type !== "general" && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {insightData.insight_type}
                </span>
              )}
            </div>

            {/* LOADING STATE */}
            {isInsightLoading && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                <span>Gathering logs to formulate your recommendation...</span>
              </div>
            )}

            {/* ERROR STATE & RETRY */}
            {isInsightError && !isInsightLoading && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-destructive">Could not retrieve your daily insight.</p>
                <button
                  type="button"
                  onClick={() => refetchInsight()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-all active:scale-95"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </div>
            )}

            {/* SUCCESS & EMPTY DATA STATES */}
            {!isInsightLoading && !isInsightError && insightData && (
              insightData.insight_type === "empty" ? (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {insightData.content}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    Track your workouts and nutrition to unlock personalized coaching insights.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm whitespace-pre-line text-foreground/90 leading-relaxed">
                  {insightData.content}
                </p>
              )
            )}
          </div>
        </aside>
      </div>
    </AppLayout>
  );
}

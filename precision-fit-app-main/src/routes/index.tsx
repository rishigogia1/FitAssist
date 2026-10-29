import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Mail, ArrowRight, ShieldCheck, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { sendOtpFn, verifyOtpFn } from "@/lib/auth-fns";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "FitAssist — Your AI Fitness Coach" },
      { name: "description", content: "Sign in to FitAssist with a one-time code sent to your email." },
    ],
  }),
  component: LoginPage,
}));

// ─── Animations ──────────────────────────────────────────────────────────────
const slideInStyle: React.CSSProperties = {
  animation: "slideIn 0.35s cubic-bezier(0.16,1,0.3,1) both",
};
const fadeInStyle: React.CSSProperties = {
  animation: "fadeIn 0.4s ease both",
};

// ─── Main Component ───────────────────────────────────────────────────────────
function LoginPage() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();

  // Step: "email" | "otp" | "success"
  const [step, setStep] = useState<"email" | "otp" | "success">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    try {
      const result = await sendOtpFn({ data: { email: email.trim() } as any });
      setDevMode(result.devMode);
      setStep("otp");
      setResendCooldown(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = otp.join("");
    if (code.length < 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    
    try {
      // 1. Verify OTP
      await verifyOtpFn({ data: { email, otp: code } as any });
      
      // 2. Get JWT from backend
      const res = await fetch("http://localhost:8000/api/v1/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      
      if (!res.ok) {
        throw new Error("Failed to authenticate with backend.");
      }
      
      const data = await res.json();
      const token = data.access_token;
      
      // 3. Move to success screen and update auth context
      setStep("success");
      login(email, token);
      
      // 4. Begin post-authentication flow
      await handlePostAuthentication(token);
      
    } catch (err: unknown) {
      // If we are already on the success screen, handlePostAuthentication will manage the error.
      // If we are still on the OTP screen, show the error here.
      if (step !== "success") {
        setError(err instanceof Error ? err.message : "Verification failed. Please try again.");
        setOtp(["", "", "", "", "", ""]);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
        setLoading(false);
      }
    }
  }

  // ── Post Authentication Routing ───────────────────────────────────────────
  const [initError, setInitError] = useState<string | null>(null);

  async function handlePostAuthentication(token: string) {
    console.log("[ONBOARDING DEBUG] Authentication initialization started");
    console.log("[ONBOARDING DEBUG] Auth status: authenticated");
    console.log("[ONBOARDING DEBUG] Authenticated user ID:", email);
    
    try {
      console.log("[ONBOARDING DEBUG] Profile retrieval started");
      const profileRes = await fetch("http://localhost:8000/api/v1/profile", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      console.log(`[PROFILE] Response status: ${profileRes.status}`);
      
      if (profileRes.status === 401) {
        console.log("[ROUTER] Unauthorized, redirecting back to login");
        throw new Error("Session invalid. Please sign in again.");
      }
      
      if (profileRes.status === 404) {
        console.log("[ONBOARDING DEBUG] Profile retrieval failed (404)");
        console.log("[ONBOARDING DEBUG] Profile completeness decision: INCOMPLETE");
        console.log("[ONBOARDING DEBUG] Reason: Profile does not exist");
        console.log("[ONBOARDING DEBUG] Selected destination route: /onboarding/profile");
        setTimeout(() => navigate({ to: "/onboarding/profile" }), 900);
        return;
      }
      
      if (!profileRes.ok) {
        console.log(`[ONBOARDING DEBUG] Profile retrieval failed: ${profileRes.statusText}`);
        throw new Error("Failed to load profile. Backend might be unreachable.");
      }
      
      const profileData = await profileRes.json();
      console.log("[ONBOARDING DEBUG] Profile retrieval succeeded");
      console.log("[ONBOARDING DEBUG] Retrieved profile fields relevant to onboarding:", {
        age: profileData.age, weight: profileData.weight, goal: profileData.fitness_goal, level: profileData.fitness_level, completed: profileData.profile_completed
      });
      
      const isComplete = Boolean(
        profileData.age && profileData.age > 0 &&
        profileData.weight && profileData.weight > 0 &&
        profileData.height && profileData.height > 0 &&
        profileData.fitness_goal && profileData.fitness_level
      );
      
      if (!isComplete || profileData.profile_completed === false) {
        console.log("[ONBOARDING DEBUG] Profile completeness decision: INCOMPLETE");
        console.log("[ONBOARDING DEBUG] Reason: profile_completed flag is false or required fields missing");
        console.log("[ONBOARDING DEBUG] Selected destination route: /onboarding/profile");
        setTimeout(() => navigate({ to: "/onboarding/profile" }), 900);
        return;
      }
      
      console.log("[ONBOARDING DEBUG] Profile completeness decision: COMPLETE");
      console.log("[ONBOARDING DEBUG] Reason: profile_completed flag is true and fields present");
      console.log("[ONBOARDING DEBUG] Selected destination route: /dashboard");
      setTimeout(() => navigate({ to: "/dashboard" }), 900);
      
    } catch (err: unknown) {
      console.error("[PROFILE] Error during initialization:", err);
      setInitError(err instanceof Error ? err.message : "Something went wrong while setting up your account.");
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────
  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    setOtp(["", "", "", "", "", ""]);
    try {
      const result = await sendOtpFn({ data: { email } as any });
      setDevMode(result.devMode);
      setResendCooldown(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── OTP digit input handling ──────────────────────────────────────────────
  function handleOtpChange(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[idx] = val.slice(-1);
    setOtp(newOtp);
    if (val && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
    // Auto-submit when all filled
    if (newOtp.every(Boolean) && newOtp.join("").length === 6) {
      setTimeout(() => {
        const form = document.getElementById("otp-form");
        form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }, 80);
    }
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = Array(6).fill("");
    pasted.split("").forEach((c, i) => { newOtp[i] = c; });
    setOtp(newOtp);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <style>{`
        @keyframes slideIn {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity:0; }
          to   { opacity:1; }
        }
        @keyframes pulse-ring {
          0%,100% { transform:scale(1); opacity:1; }
          50%     { transform:scale(1.08); opacity:0.7; }
        }
      `}</style>

      {/* ── LEFT PANEL ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">FitAssist</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">AI Fitness Platform</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
            Your AI Fitness Coach.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Personalized training, intelligent nutrition, and continuous progress tracking — guided by a coach that adapts to you in real time.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { k: "92%", v: "Goal accuracy" },
              { k: "1.4M", v: "Workouts run" },
              { k: "4.9★", v: "User rating" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-card/40 p-4 backdrop-blur">
                <p className="text-lg font-semibold">{s.k}</p>
                <p className="text-xs text-muted-foreground">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">© 2026 FitAssist. Built for athletes.</p>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary">
                <Activity className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">FitAssist</span>
            </div>
          </div>

          {/* ── STEP 1: Email ── */}
          {step === "email" && (
            <div key="email" style={slideInStyle}>
              <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we'll send you a login code.
              </p>

              <form onSubmit={handleSendOtp} className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Email address</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="email-input"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      placeholder="you@example.com"
                      className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-ring/40 transition"
                    />
                  </div>
                </label>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" style={fadeInStyle}>
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  id="send-otp-btn"
                  type="submit"
                  disabled={loading}
                  className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending code…</>
                  ) : (
                    <>Send login code <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>
                  )}
                </button>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">secure</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  A 6-digit code will be sent to your inbox. No password needed.
                </p>
              </form>
            </div>
          )}

          {/* ── STEP 2: OTP Verification ── */}
          {step === "otp" && (
            <div key="otp" style={slideInStyle}>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">Check your inbox</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>

              {devMode && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-[color:var(--warning)]" style={fadeInStyle}>
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span><strong>Dev mode:</strong> No SMTP configured — check your terminal for the OTP code.</span>
                </div>
              )}

              <form id="otp-form" onSubmit={handleVerify} className="mt-6 space-y-5">
                {/* 6-digit OTP boxes */}
                <div>
                  <span className="mb-3 block text-xs font-medium text-muted-foreground">Enter your code</span>
                  <div className="flex gap-2.5" onPaste={handleOtpPaste}>
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`otp-slot-${idx}`}
                        ref={(el) => { otpRefs.current[idx] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        autoComplete="one-time-code"
                        className={[
                          "h-12 w-10 rounded-xl border text-center text-lg font-semibold outline-none transition",
                          "bg-card placeholder:text-muted-foreground/30",
                          digit
                            ? "border-primary/60 text-foreground ring-2 ring-ring/30"
                            : "border-border text-foreground",
                          "focus:border-primary focus:ring-2 focus:ring-ring/40",
                        ].join(" ")}
                        style={{ flex: "1 1 0" }}
                        aria-label={`OTP digit ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive" style={fadeInStyle}>
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  id="verify-otp-btn"
                  type="submit"
                  disabled={loading || otp.join("").length < 6}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
                  ) : (
                    <>Verify & sign in <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>

                {/* Resend + change email */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setError(null); setOtp(["","","","","",""]); }}
                    className="hover:text-foreground transition"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || loading}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 3: Success ── */}
          {step === "success" && (
            <div key="success" className="text-center" style={fadeInStyle}>
              {initError ? (
                <>
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/15">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-destructive">Setup Failed</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{initError}</p>
                  
                  <div className="mt-8 flex flex-col gap-3">
                    <button
                      onClick={() => handlePostAuthentication(sessionStorage.getItem("fitassist_auth_token") || "")}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        setStep("email");
                        setInitError(null);
                        setError(null);
                        setOtp(["", "", "", "", "", ""]);
                      }}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium transition hover:bg-muted"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15"
                    style={{ animation: "pulse-ring 1s ease infinite" }}
                  >
                    <CheckCircle2 className="h-8 w-8 text-[color:var(--success)]" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">You're in!</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    ✓ Identity verified
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Setting up your FitAssist experience...
                  </p>
                  <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ animation: "slideIn 0.9s linear forwards", transformOrigin: "left", width: "100%" }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

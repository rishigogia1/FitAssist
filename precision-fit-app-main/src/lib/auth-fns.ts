import { createServerFn } from "@tanstack/react-start";
import { generateOtp, storeOtp, verifyOtp } from "./otp-store";
import { sendOtpEmail } from "./mailer";

// ─── Send OTP ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sendOtpFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { email } = ctx.data as { email: string };
    const trimmed = email?.toLowerCase?.().trim();

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error("Please enter a valid email address.");
    }

    const otp = generateOtp();
    storeOtp(trimmed, otp);
    const result = await sendOtpEmail(trimmed, otp);

    return { success: true, devMode: result.devMode };
  });

// ─── Verify OTP ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const verifyOtpFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { email, otp } = ctx.data as { email: string; otp: string };

    if (!email || !otp) {
      throw new Error("Email and OTP are required.");
    }

    const valid = verifyOtp(email.toLowerCase().trim(), otp.trim());

    if (!valid) {
      throw new Error(
        "Invalid or expired code. Please check and try again, or request a new code.",
      );
    }

    return { success: true, email: email.toLowerCase().trim() };
  });

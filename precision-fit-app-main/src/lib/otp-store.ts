// Server-side only — do NOT import in client components

declare global {
  // eslint-disable-next-line no-var
  var __fitassist_otp_store:
    | Map<string, { otp: string; expiresAt: number }>
    | undefined;
}

// Use globalThis so the Map survives HMR hot-reloads during development
const otpStore: Map<string, { otp: string; expiresAt: number }> =
  globalThis.__fitassist_otp_store ??
  (globalThis.__fitassist_otp_store = new Map());

/** Generate a cryptographically-random 6-digit OTP */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Store OTP with a 10-minute expiry window */
export function storeOtp(email: string, otp: string): void {
  const key = email.toLowerCase().trim();
  otpStore.delete(key); // remove any existing entry first
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
}

/** Verify OTP — returns true only once (one-time use, deleted on success) */
export function verifyOtp(email: string, otp: string): boolean {
  const key = email.toLowerCase().trim();
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }
  if (entry.otp !== otp.trim()) return false;
  otpStore.delete(key); // one-time use — delete after success
  return true;
}

/** Peek without consuming — used to check if OTP exists */
export function hasOtp(email: string): boolean {
  const key = email.toLowerCase().trim();
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }
  return true;
}

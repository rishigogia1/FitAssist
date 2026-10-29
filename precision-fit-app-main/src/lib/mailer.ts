import nodemailer from "nodemailer";

function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null; // dev fallback
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildHtml(otp: string, email: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your FitAssist Login Code</title>
</head>
<body style="margin:0;padding:0;background:#0b0f14;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;border:1px solid #1e293b;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e2d48,#0f1623);padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <span style="font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.5px;">⚡ FitAssist</span>
              </div>
              <p style="margin:8px 0 0;color:#64748b;font-size:13px;">AI Fitness Coach</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#f1f5f9;">Your login code</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#94a3b8;line-height:1.6;">
                Hi there! Use the code below to sign in to FitAssist. It expires in <strong style="color:#60a5fa;">10 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <div style="background:#1f2937;border:1px solid #374151;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#64748b;">Verification Code</p>
                <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:0.25em;color:#60a5fa;font-variant-numeric:tabular-nums;">
                  ${otp}
                </p>
              </div>

              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;">
                This code was requested for <strong style="color:#94a3b8;">${email}</strong>.
                If you didn't request this, you can safely ignore this email.
              </p>
              <p style="margin:0;font-size:12px;color:#475569;">
                Never share this code with anyone. FitAssist will never ask for it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #1e293b;">
              <p style="margin:0;font-size:11px;color:#475569;text-align:center;">
                © 2026 FitAssist · Built for athletes
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send an OTP email.
 * If SMTP env vars are not set, logs the OTP to the server console (dev mode).
 */
export async function sendOtpEmail(
  email: string,
  otp: string,
): Promise<{ sent: boolean; devMode: boolean }> {
  const transporter = buildTransporter();

  if (!transporter) {
    // ─── DEV MODE ──────────────────────────────────────────────────────
    console.log("\n");
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║         FitAssist — OTP (Dev Mode / No SMTP)         ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Email : ${email.padEnd(44)}║`);
    console.log(`║  Code  : ${otp.padEnd(44)}║`);
    console.log("║  Valid : 10 minutes                                  ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    console.log("\n");
    return { sent: false, devMode: true };
  }

  // ─── PRODUCTION SMTP ─────────────────────────────────────────────────
  const from =
    process.env.SMTP_FROM ??
    process.env.SMTP_USER ??
    "noreply@fitassist.io";

  await transporter.sendMail({
    from: `FitAssist <${from}>`,
    to: email,
    subject: `${otp} is your FitAssist login code`,
    html: buildHtml(otp, email),
    text: `Your FitAssist login code is: ${otp}\n\nThis code expires in 10 minutes. Never share it with anyone.`,
  });

  return { sent: true, devMode: false };
}

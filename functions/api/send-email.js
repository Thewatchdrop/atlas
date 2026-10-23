// /functions/api/send-email.js
// Atlas → Resend email sender (Cloudflare Pages Function)
//
// Env vars to set in Cloudflare Pages → Settings → Variables & Secrets:
//   RESEND_API_KEY     (secret)  from resend.com
//   SUPABASE_URL                 same URL Atlas already uses
//   SUPABASE_ANON_KEY            same anon key Atlas already uses
//   FROM_EMAIL                   e.g. "The Watch Drop <winners@thewatchdrop.co.uk>"
//   REPLY_TO                     e.g. "hello@thewatchdrop.co.uk"
//   BCC_EMAIL        (optional)  copy of every email for your records

const NAVY = "#0B1A33";
const GOLD = "#C9A961";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const SAFETY_LINE =
  "For your security: we will never ask for your card details, PIN or online banking passwords. If anything looks off, contact us through thewatchdrop.co.uk.";

// ---------- TEMPLATES ----------
const TEMPLATES = {
  // Watch / physical prize winner
  winner_congrats: {
    required: ["firstName", "prizeName", "dropName"],
    subject: (v) => `🏆 You've won the ${v.prizeName}!`,
    preview: (v) => `Congratulations ${v.firstName}. Here's what happens next.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      <p style="font-size:20px;font-weight:bold;color:${NAVY};">Congratulations. You've won the ${esc(v.prizeName)}. 🎉</p>
      <p>Your entry${v.ticketNumber ? ` (ticket <strong>#${esc(v.ticketNumber)}</strong>)` : ""} was drawn as the winner of <strong>${esc(v.dropName)}</strong>${v.drawDate ? ` in our live draw on ${esc(v.drawDate)}` : ""}.</p>
      <p><strong>What happens next:</strong></p>
      <p>Just reply to this email and confirm:</p>
      <p>• Your full name<br>• Your delivery address<br>• The best phone number to reach you</p>
      <p>Once we have those, we'll arrange fully insured delivery and keep you updated every step of the way.</p>
      <p>We'd also love to share your win with the community. Totally optional, and we'll always ask first.</p>
      <p>Enjoy this one. You earned it.</p>`,
  },

  // Cash prize – request bank details
  cash_bank_details: {
    required: ["firstName", "prizeAmount", "dropName"],
    subject: (v) => `💷 Your £${v.prizeAmount} win – let's get you paid`,
    preview: (v) => `We just need a few details to send your winnings.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      <p style="font-size:20px;font-weight:bold;color:${NAVY};">Congratulations. You've won £${esc(v.prizeAmount)}. 🎉</p>
      <p>Your entry${v.ticketNumber ? ` (ticket <strong>#${esc(v.ticketNumber)}</strong>)` : ""} won in <strong>${esc(v.dropName)}</strong>.</p>
      <p>To send your winnings by bank transfer, we just need:</p>
      <p>• Account holder name<br>• Sort code<br>• Account number</p>
      ${
        v.detailsUrl
          ? `<p style="text-align:center;margin:28px 0;">
               <a href="${esc(v.detailsUrl)}" style="background:${GOLD};color:${NAVY};padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;">Submit my details securely</a>
             </p>`
          : `<p>Just reply to this email with those three details.</p>`
      }
      <p>Payment is usually sent within ${esc(v.payoutDays || "3 working days")} of receiving your details.</p>
      <p style="font-size:13px;color:#666;">${SAFETY_LINE}</p>`,
  },
};

// ---------- LAYOUT ----------
const wrap = (preview, inner) => `<!doctype html>
<html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">${esc(preview)}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 0;"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;">
    <tr><td style="background:${NAVY};padding:24px;text-align:center;">
      <div style="color:${GOLD};font-size:22px;font-weight:bold;letter-spacing:3px;">THE WATCH DROP</div>
      <div style="color:#fff;font-size:12px;letter-spacing:2px;margin-top:6px;">DON'T JUST WATCH… WIN.</div>
    </td></tr>
    <tr><td style="padding:32px 28px;color:#222;font-size:16px;line-height:1.6;">
      ${inner}
      <p style="margin-top:28px;">Felix<br><span style="color:#666;">Founder, The Watch Drop</span></p>
    </td></tr>
    <tr><td style="background:${NAVY};padding:16px;text-align:center;color:#aab;font-size:12px;">
      thewatchdrop.co.uk
    </td></tr>
  </table>
</td></tr></table></body></html>`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ---------- HANDLER ----------
export async function onRequestPost({ request, env }) {
  // 1. Only logged-in Atlas users can send
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return json({ error: "Not signed in" }, 401);

  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!authRes.ok) return json({ error: "Session expired – sign in again" }, 401);

  // 2. Validate request
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  const { template, to, vars = {} } = payload;
  const t = TEMPLATES[template];
  if (!t) return json({ error: `Unknown template: ${template}` }, 400);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "Invalid email address" }, 400);

  const missing = t.required.filter((k) => !String(vars[k] ?? "").trim());
  if (missing.length) return json({ error: `Missing: ${missing.join(", ")}` }, 400);

  // 3. Send via Resend
  const email = {
    from: env.FROM_EMAIL,
    to: [to],
    reply_to: env.REPLY_TO,
    subject: t.subject(vars),
    html: wrap(t.preview(vars), t.body(vars)),
  };
  if (env.BCC_EMAIL) email.bcc = [env.BCC_EMAIL];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(email),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: out.message || "Email failed to send" }, 502);

  return json({ ok: true, id: out.id, sentAt: new Date().toISOString() });
}

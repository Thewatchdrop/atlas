// /functions/api/send-email.js
// Atlas → Resend email sender (Cloudflare Pages Function)
// Env vars: RESEND_API_KEY (secret), SUPABASE_URL, SUPABASE_ANON_KEY,
//           FROM_EMAIL, REPLY_TO, BCC_EMAIL (optional)

const NAVY = "#0B1A33";
const GOLD = "#C9A961";
const REVIEW_URL = "https://uk.trustpilot.com/review/thewatchdrop.co.uk";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// "500", "£500", "1500.00" → "500", "1,500"
const gbp = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return String(v ?? "");
  return n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
};

const SAFETY = `<p style="font-size:13px;color:#666;">For your security: we will never ask for your card details, PIN or online banking passwords.</p>`;
const BANK_LIST = `<p>• Account holder name<br>• Sort code<br>• Account number</p>`;
const headline = (t) => `<p style="font-size:20px;font-weight:bold;color:${NAVY};">${t}</p>`;
const button = (url, label) =>
  `<p style="text-align:center;margin:28px 0;"><a href="${esc(url)}" style="background:${GOLD};color:${NAVY};padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;">${label}</a></p>`;

// ---------- TEMPLATES ----------
const TEMPLATES = {
  // 1. Vault cash win – request bank details
  vault_cash_win: {
    required: ["firstName", "amount", "vaultName", "ticketNumber"],
    subject: (v) => `💷 You've won £${gbp(v.amount)} on the ${v.vaultName}!`,
    preview: (v) => `Congratulations ${v.firstName}. Let's get you paid.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      ${headline(`Congratulations. You've just won £${esc(gbp(v.amount))} on the ${esc(v.vaultName)}! 🎉`)}
      <p>Your winning ticket was <strong>#${esc(v.ticketNumber)}</strong>.</p>
      <p>To get your winnings over to you, just reply to this email with:</p>
      ${BANK_LIST}
      <p>Once we have those, we aim to have the money in your account <strong>within 24 hours</strong>.</p>
      ${SAFETY}`,
  },

  // 2. Bank details chaser
  vault_cash_chaser: {
    required: ["firstName", "amount", "vaultName", "ticketNumber"],
    subject: (v) => `Your £${gbp(v.amount)} is waiting for you 💷`,
    preview: () => `We just need your bank details to send it over.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      <p>Just a quick nudge. We're still holding your <strong>£${esc(gbp(v.amount))} win</strong> from the ${esc(v.vaultName)} (ticket <strong>#${esc(v.ticketNumber)}</strong>), but we haven't received your bank details yet.</p>
      <p>Reply to this email with your:</p>
      ${BANK_LIST}
      <p>As soon as we have them, we'll get your winnings sent. Usually within 24 hours.</p>
      ${SAFETY}`,
  },

  // 3. Bank details received
  bank_details_received: {
    required: ["firstName", "amount"],
    subject: (v) => `✅ Got them, your £${gbp(v.amount)} is on its way`,
    preview: () => `Keep an eye on your bank account.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      <p>Thanks for sending your details. We've got everything we need.</p>
      <p>Your <strong>£${esc(gbp(v.amount))}</strong> is being processed now. Keep an eye on your bank account, as it should land soon.</p>
      <p>Congratulations again, and good luck in the next drop. 👀</p>`,
  },

  // 4. Cash paid confirmation + Trustpilot review ask
  cash_paid: {
    required: ["firstName", "amount"],
    subject: (v) => `💷 Paid! Your £${gbp(v.amount)} has been sent`,
    preview: () => `Your winnings are on their way, plus a quick favour.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      ${headline(`Your £${esc(gbp(v.amount))} has been sent. ✅`)}
      <p>We've just transferred your winnings to the account you gave us. Depending on your bank, it can take a few hours to show. If it hasn't arrived by tomorrow, just reply and we'll look into it straight away.</p>
      <p><strong>One quick favour?</strong> If you've enjoyed winning with us, would you leave us a review on Trustpilot? It really helps other players know we're the real deal.</p>
      ${button(REVIEW_URL, "Leave a review ⭐")}
      <p>Once it's posted, reply to this email with a screenshot. There might just be a little gift from us. 🎁</p>
      <p>See you in the next drop.</p>`,
  },

  // 5. Watch win – confirm delivery address
  watch_win: {
    required: ["firstName", "watchName", "ticketNumber"],
    subject: (v) => `🏆 You've won the ${v.watchName}!`,
    preview: (v) => `Congratulations ${v.firstName}. Here's what happens next.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      ${headline(`Congratulations. You've won the ${esc(v.watchName)}! 🎉`)}
      <p>Your winning ticket was <strong>#${esc(v.ticketNumber)}</strong>${v.dropName ? ` in ${esc(v.dropName)}` : ""}.</p>
      <p><strong>What happens next:</strong><br>Your watch is on its way to our office for a full quality assurance check. Once it's passed, we'll send it straight out to you, fully insured. We aim to have it in your hands within <strong>14 working days</strong>.</p>
      <p><strong>Please reply to confirm your delivery address</strong>, including postcode, plus the best phone number for the courier.</p>
      <p>Enjoy this one. You earned it.</p>`,
  },

  // 6. Address chaser
  address_chaser: {
    required: ["firstName", "watchName"],
    subject: (v) => `Where should we send your ${v.watchName}? ⌚`,
    preview: () => `We just need your delivery address.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      <p>Quick one. Your <strong>${esc(v.watchName)}</strong> is ready to come your way, but we still haven't received your delivery address.</p>
      <p>Just reply with your full address, including postcode, and a contact number for the courier. We'll take it from there.</p>`,
  },

  // 7. Watch dispatched – tracking
  watch_dispatched: {
    required: ["firstName", "watchName", "courier", "trackingNumber"],
    subject: (v) => `📦 Your ${v.watchName} is on its way!`,
    preview: (v) => `It's passed our checks and is with ${v.courier}.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      ${headline(`Your ${esc(v.watchName)} is on its way! 📦`)}
      <p>It's passed our quality assurance check and has been sent out to you, fully insured.</p>
      <p><strong>Courier:</strong> ${esc(v.courier)}<br><strong>Tracking number:</strong> ${esc(v.trackingNumber)}</p>
      ${v.trackingUrl ? button(v.trackingUrl, "Track my watch") : ""}
      <p>Make sure someone's around to receive it. We can't wait for you to see it in person.</p>`,
  },

  // 8. Delivered – Trustpilot review
  review_request: {
    required: ["firstName", "watchName"],
    subject: (v) => `Enjoying your ${v.watchName}? ⭐`,
    preview: () => `We'd love to hear what you think.`,
    body: (v) => `
      <p>Hi ${esc(v.firstName)},</p>
      <p>We hope you're loving your new <strong>${esc(v.watchName)}</strong>.</p>
      <p>Would you take a minute to leave us a review on Trustpilot? It really helps other collectors know we're the real deal.</p>
      ${button(REVIEW_URL, "Leave a review ⭐")}
      <p>Once it's posted, reply to this email with a screenshot. There might just be a little gift from us. 🎁</p>`,
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
    <tr><td style="background:${NAVY};padding:16px;text-align:center;color:#aab;font-size:12px;">thewatchdrop.co.uk</td></tr>
  </table>
</td></tr></table></body></html>`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

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
  const { template, to, vars = {}, preview = false } = payload;
  const t = TEMPLATES[template];
  if (!t) return json({ error: `Unknown template: ${template}` }, 400);

  const missing = t.required.filter((k) => !String(vars[k] ?? "").trim());
  if (missing.length) return json({ error: `Missing: ${missing.join(", ")}` }, 400);

  const subject = t.subject(vars);
  const html = wrap(t.preview(vars), t.body(vars));

  // Preview mode: return the email without sending (for Atlas "check before send")
  if (preview) return json({ ok: true, preview: true, subject, html });

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "Invalid email address" }, 400);

  // 3. Send via Resend
  const email = { from: env.FROM_EMAIL, to: [to], reply_to: env.REPLY_TO, subject, html };
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

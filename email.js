// email.js
// Sends two kinds of email via plain SMTP (works with Gmail, SendGrid,
// Mailtrap, your host's mail server — anything that speaks SMTP):
//   1. A confirmation to the patient, if they gave an email address.
//   2. An instant notification to the front desk, for every booking/lead,
//      so staff don't have to keep checking data.json or the Sheet.
// If the SMTP env vars aren't set, every function here quietly no-ops —
// same pattern as googleSheets.js — so the app still works without email.

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;
const PRACTICE_NOTIFY_EMAIL = process.env.PRACTICE_NOTIFY_EMAIL; // front desk inbox

export const emailEnabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implicit TLS; 587/25 use STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cachedTransporter;
}

/**
 * Sends one email. Never throws — a mail outage or bad SMTP config should
 * never break a booking that already saved fine to data.json. Errors are
 * logged instead and surfaced back as { sent: false, reason }.
 */
async function sendMail({ to, subject, text }) {
  if (!emailEnabled) return { sent: false, reason: "Email not configured" };
  if (!to) return { sent: false, reason: "No recipient address" };

  try {
    await getTransporter().sendMail({ from: EMAIL_FROM, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error(`⚠️  Failed to send email to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Booking made: confirms with the patient (if they gave an email) and
 * always pings the front desk (if PRACTICE_NOTIFY_EMAIL is set), so both
 * sends are attempted independently — one failing doesn't block the other.
 */
export async function notifyBooking(booking) {
  const results = {};

  if (booking.email) {
    results.patient = await sendMail({
      to: booking.email,
      subject: `You're booked at Bright Smile Dental — ${booking.date} at ${booking.time}`,
      text:
        `Hi ${booking.name},\n\n` +
        `This confirms your appointment for ${booking.service} on ${booking.date} at ${booking.time}.\n\n` +
        `Bright Smile Dental\n142 Maple Ave, Springfield\n\n` +
        `Need to reschedule? Just reply to this email or give us a call.`,
    });
  }

  if (PRACTICE_NOTIFY_EMAIL) {
    results.practice = await sendMail({
      to: PRACTICE_NOTIFY_EMAIL,
      subject: `New booking: ${booking.name} — ${booking.date} ${booking.time}`,
      text:
        `New appointment booked via the chatbot:\n\n` +
        `Patient: ${booking.name}\n` +
        `Service: ${booking.service}\n` +
        `Date/time: ${booking.date} at ${booking.time}\n` +
        (booking.email ? `Email: ${booking.email}\n` : "") +
        (booking.phone ? `Phone: ${booking.phone}\n` : ""),
    });
  }

  return results;
}

/** New lead captured: always pings the front desk so someone follows up. */
export async function notifyLead(lead) {
  if (!PRACTICE_NOTIFY_EMAIL) return { practice: { sent: false, reason: "PRACTICE_NOTIFY_EMAIL not set" } };

  const practice = await sendMail({
    to: PRACTICE_NOTIFY_EMAIL,
    subject: `New lead: ${lead.name}`,
    text:
      `New lead captured via the chatbot:\n\n` +
      `Name: ${lead.name}\n` +
      `Phone: ${lead.phone}\n` +
      (lead.email ? `Email: ${lead.email}\n` : "") +
      `Interested in: ${lead.reason}\n`,
  });

  return { practice };
}

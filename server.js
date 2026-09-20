import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import 'dotenv/config'; // Loads .env variables BEFORE any other modules import
import fs from "fs";
import { randomUUID } from "crypto";
import { appendRow, sheetsEnabled } from "./googleSheets.js";
import { notifyBooking, notifyLead, notifyCancellation,emailEnabled, } from "./email.js";

const app = express();

// ---- CORS ----
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: ALLOWED_ORIGINS || true,
  })
);
if (!ALLOWED_ORIGINS) {
  console.warn(
    "\n⚠️  ALLOWED_ORIGINS not set — /api/chat accepts requests from any site.\n" +
    "   Fine for local dev; set ALLOWED_ORIGINS before a real deployment.\n"
  );
}

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

// ---- Rate limiting ----
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CHAT_RATE_LIMIT_PER_MIN) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages — please slow down and try again shortly." },
});

// ---- Admin auth ----
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.warn(
    "\n⚠️  No ADMIN_KEY set — /api/leads and /api/bookings are DISABLED.\n" +
    "   Set ADMIN_KEY in .env to enable them for authorized viewing only.\n"
  );
}
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(503).json({ error: "Admin endpoints are not configured on this server." });
  }
  if (req.get("x-admin-key") !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn(
    "\n⚠️  No GEMINI_API_KEY found. Copy .env.example to .env and add your key.\n" +
    "   Get a free key (no credit card) at https://aistudio.google.com/app/apikey\n"
  );
}

console.log(
  sheetsEnabled
    ? "📊 Google Sheets sync is ON — leads and bookings will also be written to your sheet."
    : "📊 Google Sheets sync is OFF — set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and " +
      "GOOGLE_PRIVATE_KEY in .env to turn it on (see README)."
);
console.log(
  emailEnabled
    ? "📧 Email notifications are ON — bookings/leads will email the front desk" +
      (process.env.PRACTICE_NOTIFY_EMAIL ? "" : " (set PRACTICE_NOTIFY_EMAIL to enable this) ") +
      ", and patients get a confirmation if they gave an email."
    : "📧 Email notifications are OFF — set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env to turn them on (see README)."
);

// ---- "Database" ----
const DATA_FILE = "./data.json";

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { leads: parsed.leads || [], bookings: parsed.bookings || [] };
  } catch {
    return { leads: [], bookings: [] };
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ leads, bookings }, null, 2));
  } catch (err) {
    console.error("⚠️  Failed to save data.json:", err);
  }
}

const { leads, bookings } = loadData();
console.log(`📂 Loaded ${leads.length} lead(s) and ${bookings.length} booking(s) from data.json`);

// ---- Office hours, used by check_availability ----
const OFFICE_HOURS = {
  1: { open: "08:00", close: "18:00" },
  2: { open: "08:00", close: "18:00" },
  3: { open: "08:00", close: "18:00" },
  4: { open: "08:00", close: "18:00" },
  5: { open: "08:00", close: "18:00" },
  6: { open: "09:00", close: "14:00" },
};
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const APPOINTMENT_LENGTH_MIN = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseTimeToMinutes(timeStr) {
  if (typeof timeStr !== "string") return null;
  const s = timeStr.trim().toLowerCase();

  let m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (m) {
    let [, h, min, ampm] = m;
    h = parseInt(h, 10);
    min = parseInt(min, 10);
    if (ampm) {
      if (h === 12) h = 0;
      if (ampm === "pm") h += 12;
    }
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  m = s.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m) {
    let [, h, ampm] = m;
    h = parseInt(h, 10);
    if (h === 12) h = 0;
    if (ampm === "pm") h += 12;
    if (h > 23) return null;
    return h * 60;
  }

  return null;
}

function minutesToClock(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---- Business Profile Prompt ----
function buildBusinessProfile() {
  const today = new Date().toISOString().split("T")[0];
  return `
You are Sam, the virtual front-desk assistant for Bright Smile Dental, a family
dental practice. You are warm, concise, and efficient — like a great receptionist,
not a generic AI. Keep replies short (2-4 sentences) unless the user asks for detail.

Today's date is ${today}. When a patient gives you a relative date ("this Friday",
"next Tuesday", "tomorrow"), work out the actual calendar date from today's date
and always pass dates to tools in YYYY-MM-DD format.

PRACTICE INFO:
- Address: 142 Maple Ave, Springfield
- Hours: Mon–Fri 8am–6pm, Sat 9am–2pm, closed Sundays
- Dentist: Dr. Elena Ruiz, DDS (12 years of practice, gentle with anxious patients)
- Services: cleanings & checkups, fillings, whitening, root canals, crowns,
  emergency same-day appointments, pediatric dentistry
- New patient exam + cleaning: $120 (includes X-rays)
- Standard cleaning (existing patient): $90
- Whitening: $250
- We accept Delta Dental, Cigna, and Aetna. No insurance? We offer a $30/month
  membership plan covering 2 cleanings/year + 15% off other services.
- Emergency dental pain: same-day slots held every day, call the number below
  or ask the bot to book one.

WHAT YOU CAN DO:
1. Answer questions about hours, services, pricing, and insurance using the info above.
2. If someone seems interested but isn't ready to book, offer to have the office follow up — collect their name and phone number (and optional email) and call capture_lead.
3. If someone wants to schedule, first call check_availability with the date to check open times. Suggest an open time slot.
4. Before calling book_appointment, you MUST ask for and collect the patient's name, phone number, AND email address. Do not book until you have all three.
5. Once you have name, date, time, and service, call book_appointment with all collected details. If book_appointment returns a conflict, apologize and ask for a different time. Once it succeeds, confirm the details back to the patient in plain language and let them know a confirmation email with a calendar invite has been sent.
6. Do not call book_appointment again for the same request once it has succeeded.
7. If a patient wants to cancel an existing appointment, ask for their name and email address (or phone number), then call cancel_appointment.
8. If a patient wants to reschedule, first call check_availability for the new date to suggest open times, then call reschedule_appointment with their name, email, new date, and new time.
9. If you don't know something, say so honestly and offer to have Dr. Ruiz's office call back.

Never invent information that isn't in this profile. Stay in character as the practice's assistant.
`;
}

// ---- Gemini Tools Definition ----
const tools = [
  {
    functionDeclarations: [
      {
        name: "check_availability",
        description:
          "Check the office's hours and which appointment times are already booked on a given date. Call this before book_appointment so you can suggest a real open time instead of guessing.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Date to check, in YYYY-MM-DD format" },
          },
          required: ["date"],
        },
      },
      {
        name: "capture_lead",
        description:
          "Log a potential patient's contact info so the front desk can follow up. Use when someone shows interest but isn't booking a specific slot right now.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "The person's name" },
            phone: { type: "STRING", description: "Their phone number" },
            reason: { type: "STRING", description: "Brief note on what they're interested in" },
            email: { type: "STRING", description: "Their email, if they gave one (optional)" },
          },
          required: ["name", "phone", "reason"],
        },
      },
      {
        name: "book_appointment",
        description: "Book a confirmed appointment slot for a patient.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Patient's name" },
            date: { type: "STRING", description: "Requested date, e.g. YYYY-MM-DD" },
            time: { type: "STRING", description: "Requested time, e.g. '2:30pm'" },
            service: { type: "STRING", description: "What the appointment is for" },
            phone: { type: "STRING", description: "Patient's phone number" },
            email: { type: "STRING", description: "Patient's email address for confirmation" },
          },
          required: ["name", "date", "time", "service", "phone", "email"],
        },
      },
      {
        name: "cancel_appointment",
        description: "Cancel an existing appointment for a patient using their name and email or phone.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Patient's name" },
            email: { type: "STRING", description: "Patient's email address" },
            phone: { type: "STRING", description: "Patient's phone number" }
          },
          required: ["name"]
        }
      },
      {
        name: "reschedule_appointment",
        description: "Change an existing appointment to a new date and time.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Patient's name" },
            email: { type: "STRING", description: "Patient's email address" },
            new_date: { type: "STRING", description: "New requested date YYYY-MM-DD" },
            new_time: { type: "STRING", description: "New requested time e.g. 2:30pm" }
          },
          required: ["name", "email", "new_date", "new_time"]
        }
      }
    ],
  },
];

// ---- Tool Execution Handler ----
async function executeTool(name, args) {
  if (name === "check_availability") {
    if (!DATE_RE.test(args.date || "")) {
      return { status: "error", message: "That date wasn't in YYYY-MM-DD format. Please convert it first." };
    }
    const d = new Date(`${args.date}T00:00:00`);
    if (isNaN(d.getTime())) {
      return { status: "error", message: "That date wasn't in a format I could read. Use YYYY-MM-DD." };
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (args.date < todayStr) {
      return { status: "error", message: "That date is in the past. Ask the patient for an upcoming date." };
    }
    const hours = OFFICE_HOURS[d.getDay()];
    if (!hours) {
      return {
        status: "success",
        open: false,
        message: `We're closed on ${WEEKDAY_NAMES[d.getDay()]}s.`,
      };
    }
    const bookedTimes = bookings.filter((b) => b.date === args.date).map((b) => b.time);
    return {
      status: "success",
      open: true,
      hours: `${hours.open}–${hours.close}`,
      bookedTimes,
      message:
        bookedTimes.length > 0
          ? `Open ${hours.open}–${hours.close} on ${args.date}. Already booked at: ${bookedTimes.join(", ")}.`
          : `Open ${hours.open}–${hours.close} on ${args.date}. Nothing booked yet that day.`,
    };
  }

  if (name === "capture_lead") {
    const lead = { id: randomUUID(), ...args, createdAt: new Date().toISOString() };
    leads.push(lead);
    saveData();
    console.log("📇 New lead captured:", lead);
    await appendRow("Leads", [lead.createdAt, lead.name, lead.phone, lead.reason]);
    notifyLead(lead).catch((err) => console.error("⚠️  notifyLead failed:", err));
    return { status: "success", message: "Lead saved. Front desk will follow up." };
  }

  if (name === "book_appointment") {
    if (!DATE_RE.test(args.date || "")) {
      return { status: "error", message: "That date wasn't in YYYY-MM-DD format. Convert it first, then retry." };
    }
    const d = new Date(`${args.date}T00:00:00`);
    if (isNaN(d.getTime())) {
      return { status: "error", message: "That date wasn't valid. Use YYYY-MM-DD." };
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (args.date < todayStr) {
      return { status: "error", message: "That date is in the past. Ask the patient for an upcoming date." };
    }

    const hours = OFFICE_HOURS[d.getDay()];
    if (!hours) {
      return { status: "error", message: `We're closed on ${WEEKDAY_NAMES[d.getDay()]}s. Ask for a different day.` };
    }

    const requestedMin = parseTimeToMinutes(args.time);
    if (requestedMin === null) {
      return { status: "error", message: "That time wasn't in a format I could parse. Ask the patient to clarify (e.g. '2:30pm')." };
    }
    const openMin = parseTimeToMinutes(hours.open);
    const closeMin = parseTimeToMinutes(hours.close);
    if (requestedMin < openMin || requestedMin + APPOINTMENT_LENGTH_MIN > closeMin) {
      return {
        status: "error",
        message: `That time is outside our hours on ${args.date} (${hours.open}–${hours.close}). Ask for a different time.`,
      };
    }

    const conflict = bookings.find((b) => {
      if (b.date !== args.date) return false;
      const existingMin = parseTimeToMinutes(b.time);
      if (existingMin === null) return false;
      return Math.abs(existingMin - requestedMin) < APPOINTMENT_LENGTH_MIN;
    });
    if (conflict) {
      return {
        status: "error",
        message: `That slot (${args.date} around ${args.time}) is too close to an existing appointment. Ask the patient for a different time.`,
      };
    }

    const booking = {
      id: randomUUID(),
      ...args,
      time: minutesToClock(requestedMin),
      createdAt: new Date().toISOString(),
    };
    bookings.push(booking);
    saveData();
    console.log("📅 New booking:", booking);
    await appendRow("Bookings", [booking.createdAt, booking.name, booking.date, booking.time, booking.service]);
    notifyBooking(booking).catch((err) => console.error("⚠️  notifyBooking failed:", err));
    return {
      status: "success",
      message: `Appointment booked for ${args.name} on ${args.date} at ${args.time} for ${args.service}.`,
    };
  }

  if (name === "cancel_appointment") {
    const index = bookings.findIndex(
      (b) =>
        b.name.toLowerCase().includes((args.name || "").toLowerCase()) ||
        (args.email && b.email === args.email) ||
        (args.phone && b.phone === args.phone)
    );

    if (index === -1) {
      return { status: "error", message: "No matching active booking was found." };
    }

    const [cancelledBooking] = bookings.splice(index, 1);
    saveData();

    notifyCancellation(cancelledBooking).catch((err) => console.error("⚠️ notifyCancellation failed:", err));

    return {
      status: "success",
      message: `Appointment for ${cancelledBooking.name} on ${cancelledBooking.date} at ${cancelledBooking.time} was successfully cancelled.`
    };
  }

  if (name === "reschedule_appointment") {
    const booking = bookings.find(
      (b) =>
        b.name.toLowerCase().includes((args.name || "").toLowerCase()) ||
        (args.email && b.email === args.email)
    );

    if (!booking) {
      return { status: "error", message: "No existing booking found under that name/email." };
    }

    const oldDate = booking.date;
    const oldTime = booking.time;
    booking.date = args.new_date;
    booking.time = args.new_time;

    saveData();

    notifyBooking(booking).catch((err) => console.error("⚠️ notifyBooking failed:", err));

    return {
      status: "success",
      message: `Appointment rescheduled from ${oldDate} @ ${oldTime} to ${booking.date} @ ${booking.time}. Updated confirmation email sent.`
    };
  }

  return { status: "error", message: "Unknown tool" };
}

// ---- Session Storage ----
const sessions = new Map();
const MAX_TURNS_PER_SESSION = 40;
const MAX_MESSAGE_LENGTH = 2000;

// ---- Main Chat Endpoint ----
app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const { sessionId: incomingSessionId, message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message (non-empty string) is required" });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    }

    const sessionId = incomingSessionId && sessions.has(incomingSessionId) ? incomingSessionId : randomUUID();
    let contents = sessions.get(sessionId) || [];

    contents.push({ role: "user", parts: [{ text: message }] });

    let finalTextResponse = "";
    let toolEvents = [];

    // Agentic loop: process Gemini function calls
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildBusinessProfile() }] },
          tools,
          contents,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API error:", errText);
        return res.status(502).json({ error: "Sorry, I'm having trouble reaching the assistant right now. Please try again shortly." });
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      contents.push({ role: "model", parts });

      const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      const textParts = parts.filter((p) => p.text).map((p) => p.text);
      finalTextResponse = textParts.join("\n");

      if (functionCalls.length === 0) {
        break; // Conversation completed
      }

      const responseParts = await Promise.all(
        functionCalls.map(async (call) => {
          const result = await executeTool(call.name, call.args);
          toolEvents.push({ tool: call.name, input: call.args, result });
          return {
            functionResponse: {
              name: call.name,
              response: result,
            },
          };
        })
      );

      contents.push({ role: "user", parts: responseParts });
    }

    if (contents.length > MAX_TURNS_PER_SESSION) {
      contents = contents.slice(contents.length - MAX_TURNS_PER_SESSION);
    }
    sessions.set(sessionId, contents);

    res.json({
      sessionId,
      reply: finalTextResponse,
      toolEvents,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our end. Please try again." });
  }
});

// ---- Admin Endpoints ----
app.get("/api/leads", requireAdmin, (req, res) => res.json(leads));
app.get("/api/bookings", requireAdmin, (req, res) => res.json(bookings));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
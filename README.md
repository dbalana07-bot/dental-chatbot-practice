# Bright Smile Dental — Chatbot Demo

A working demo chatbot for a dental practice. It answers questions about
services, hours, pricing, and insurance, and can **take real actions**:
capturing a lead's contact info or booking an appointment — using Gemini's
function-calling.

Runs on **Google's Gemini API**, which has a genuinely free tier (no credit
card needed) — good for getting this running and demo-ready at zero cost.

This is built to be shown to a client (or repurposed for a real one in
under an hour).

## What's inside

```
server.js            Backend — calls Gemini, handles function calls, owns the data store
googleSheets.js       Optional Google Sheets sync (no-ops if not configured)
public/index.html    Fake dental practice landing page — embeds the chat the same
                      way a real client site would
public/styles.css    Marketing page visual design
public/embed.js       The ENTIRE client-side integration — one <script> tag,
                      creates the resizing iframe. This is what goes on a real site.
public/widget-frame.html  The actual chat UI — lives only inside the iframe
public/widget-frame.js    Chat logic (sessions, sending, rendering)
public/widget-frame.css   Chat UI styles, fully isolated from any host page's CSS
public/admin.html    Admin dashboard shell (key gate + tables)
public/admin.js      Admin dashboard logic
public/admin.css     Admin dashboard styles
data.json             Created automatically — local record of leads/bookings
.env.example          Copy to .env and add your API key(s)
```

## 1. Run it locally

```bash
npm install
cp .env.example .env
# open .env and paste in your Gemini API key
npm start
```

Then open **http://localhost:3000** — the chat bubble is in the bottom-right.

Get a **free** API key (no credit card) at
https://aistudio.google.com/app/apikey — sign in with any Google account and
generate a key. The free tier gives you a solid daily request allowance,
plenty for building and demoing this.

## 2. Try it

Good test questions:
- "How much is a cleaning?"
- "Do you take Cigna?"
- "I have a toothache, can I come in today?"
- "I'd like to book a cleaning for Friday at 2pm, my name is Alex."

After a booking, you can check it landed correctly via the admin endpoints
(see the **Security** section below for how those work) — or just check
your Google Sheet if you set that up.

## What's new since the first version

- **`check_availability` tool** — before booking, Sam checks office hours and
  what's already taken on that date, so it suggests real open times instead
  of guessing.
- **No double-booking** — `book_appointment` now checks for a conflicting
  slot and refuses to save a duplicate; Sam will ask the patient for a
  different time instead.
- **Data survives a restart** — leads and bookings now persist to
  `data.json` next to `server.js`, instead of vanishing every time you
  restart the server. It's still not a real database (see below), but it
  won't lose your demo data mid-pitch. `data.json` is gitignored — don't
  commit real patient data to a repo.
- **Smarter typing indicator** — the widget shows "Checking the
  calendar…" or "Looking that up…" instead of a generic "typing…" when it
  detects the message is about booking or pricing, and holds the indicator
  briefly after any real action (booking, lead capture) so it doesn't feel
  instant and fake.
- **The server now owns the conversation, not the browser** — each chat
  gets a server-issued session ID; the browser only ever sends its own new
  message, never prior turns. Earlier versions trusted whatever history the
  client sent back, which meant someone hitting `/api/chat` directly could
  forge a fake prior reply or a fake "booking already succeeded" result.
- **Admin endpoints are locked** — `/api/leads` and `/api/bookings` now
  require an `ADMIN_KEY` header and fail closed (locked, not open) if one
  isn't configured. See **Security** below.
- **Rate limiting** on `/api/chat` — 20 messages per minute per IP by
  default, so a script hitting the endpoint in a loop can't silently burn
  through your Gemini quota.
- **Bookings are validated server-side**, not just trusted from the model:
  times outside office hours, in the past, or overlapping an existing
  appointment (using each service's real duration, not just an exact-time
  match) are all rejected with a clear reason Sam can relay to the patient.
- **Error responses no longer leak internal detail** to the browser — full
  errors are still logged server-side for your own debugging.
- **The chat is now a real drop-in embed, not a file you copy into a
  site.** It used to require adding a `<div>` and a script file to a page's
  HTML. Now it's one `<script>` tag loading `embed.js`, which mounts the
  entire chat UI inside an isolated `<iframe>` — see **Embedding on a real
  client's website** below.

## 3. Security — read this before showing anyone outside your own testing

**Set `ADMIN_KEY`.** `/api/leads` and `/api/bookings` return real names,
phone numbers, and reasons for contact — without a key configured, those
routes are locked entirely (they fail closed, not open). Generate one and
add it to `.env`:

```bash
node -e "console.log(require('crypto').randomUUID())"
```

**Use the admin dashboard, not raw JSON.** Visit `/admin` (e.g.
`http://localhost:3000/admin`, or `yourapp.onrender.com/admin` once
deployed). It asks for your `ADMIN_KEY` once, checks it against the server,
and then shows bookings and leads as readable tables — upcoming bookings
sorted first, a quick count of each. The key is held only in
`sessionStorage` (cleared when the tab closes), never written to disk or
sent anywhere but your own server. Both `/api/leads` and `/api/bookings`
are also rate-limited now, so the key can't be brute-forced at speed.

The dashboard page itself is safe to load without a key — it has no data
baked in, it just prompts and then fetches live from the same locked
endpoints. (You can still hit those endpoints directly with `curl` if you
prefer — `curl -H "x-admin-key: your-key" http://localhost:3000/api/leads`
— the dashboard is just a friendlier way to look at the same data.)

**Set `ALLOWED_ORIGINS` before a real deploy.** By default CORS is wide
open, which is fine while you're the only one testing. Once this is live on
a real client's site, restrict it to their actual domain(s) — see
`.env.example` for the format.

**This is not a HIPAA-compliant data store.** `data.json` and a shared
Google Sheet are fine for a pitch demo with fake data, but if this becomes
a real client's actual booking system, patient names, phone numbers, and
reasons for contact are the kind of health-adjacent information that needs
a properly compliant backend (encryption at rest, access logging, a signed
BAA with whatever's storing it, etc.) — not a flat file, a spreadsheet, or
this admin page. That's a conversation to have with the dentist client
explicitly before real patients start going through this, not something
this codebase solves on its own.

## 4. Google Sheets setup (optional, but recommended for a client demo)
`data.json`. It's the single most convincing thing to show a client — she
watches her own spreadsheet update in real time as you chat with the bot.

The app works fine without this section — skip it if you just want to keep
testing locally.

**A. Create the sheet**
1. Make a new Google Sheet.
2. Add two tabs named exactly `Leads` and `Bookings` (tab names are
   case-sensitive and must match).
3. Optional but nice: add header rows —
   `Leads` tab: `Date | Name | Phone | Reason`
   `Bookings` tab: `Booked at | Patient name | Appointment date | Time | Service`
4. Copy the **Sheet ID** out of the URL: in
   `docs.google.com/spreadsheets/d/THIS_LONG_ID_HERE/edit`, it's the long
   string between `/d/` and `/edit`.

**B. Create a service account (a "robot" Google account for this app)**
1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or reuse one).
2. Search "Google Sheets API" in the top search bar and click **Enable**.
3. Go to **IAM & Admin → Service Accounts → Create Service Account**. Any
   name is fine (e.g. "dental-bot"). You can skip the optional permission
   steps.
4. Open the new service account → **Keys → Add Key → Create new key → JSON**.
   This downloads a `.json` file — keep it private, don't commit it anywhere.

**C. Connect the two**
1. Open the downloaded JSON file. You need two values from it:
   `client_email` and `private_key`.
2. Back in your Google Sheet, click **Share**, paste in the `client_email`
   value, and give it **Editor** access. (The service account is a robot
   account — it needs to be invited like any collaborator.)
3. In your `.env` file, fill in:
   ```
   GOOGLE_SHEET_ID=the-id-from-the-url
   GOOGLE_SERVICE_ACCOUNT_EMAIL=the-client_email-value
   GOOGLE_PRIVATE_KEY="the-private_key-value, quotes and \n included exactly as in the JSON file"
   ```
4. `npm install` (pulls in the `googleapis` package), then `npm start`.

You'll see `📊 Google Sheets sync is ON` in the terminal on startup if it's
wired up correctly. Book a test appointment through the widget and watch the
row appear in your sheet within a second or two.

If a sync fails for any reason (bad credentials, sheet not shared, etc.) it's
logged to the terminal but never breaks the chatbot — the booking still saves
locally either way.

## 5. Customize for a real client (e.g. your dentist contact)

Everything specific to the business lives in **one place**: the
`buildBusinessProfile()` function near the top of `server.js`. Replace the
practice name, hours, services, pricing, and policies with the real thing.
That's usually the only edit needed to re-skin this for a new client — the
tool logic and widget don't need to change.

To go further for a real deployment:
- Connect `book_appointment` to their actual calendar (Calendly API, Google
  Calendar API) so bookings land on a real schedule instead of just
  `data.json`/Sheets.
- Add a notification (email/SMS via Resend, Twilio, etc.) so the office
  gets pinged the moment a lead or booking comes in.
- If you outgrow the free tier or want higher quality, this same code
  structure works with Claude or OpenAI too — only the request/response
  shape in `server.js` needs adapting, not the widget or the business logic.

## 6. Deploy it so you can share a live link

This repo includes a `render.yaml` file, so you can use Render's **Blueprint**
deploy instead of manually configuring a web service:

1. Push `render.yaml` to your GitHub repo (it's already in this project —
   just make sure it made it into your commit).
2. On [render.com](https://render.com), click **New → Blueprint**, and pick
   your repo. Render reads `render.yaml` and sets the build/start commands
   and free instance type automatically.
3. It'll prompt you to fill in the values marked `sync: false` —
   `GEMINI_API_KEY`, the three `GOOGLE_...` ones if you set up Sheets sync,
   plus `ADMIN_KEY` and `ALLOWED_ORIGINS` (see **Security** above for what
   these are). These stay private in Render's dashboard, never in the file
   itself. `ALLOWED_ORIGINS` can be left blank for now and filled in once
   you have a real domain to lock it to.
4. Deploy — you'll get a live URL like `yourapp.onrender.com`.

(Prefer doing it by hand instead? **New → Web Service**, connect the repo,
set Build Command to `npm install` and Start Command to `npm start`, add
the same environment variables manually, and deploy — same result.)

## 7. Embedding on a real client's website

This is the part that used to be "copy some files into their site." Now
it's one line. Once deployed, give your dentist contact (or her web
developer) this, with your real Render URL in place of the example one:

```html
<script src="https://yourapp.onrender.com/embed.js" async></script>
```

That's the entire integration. It goes anywhere in their page's HTML —
paste it right before `</body>` is the usual convention. No CSS to copy, no
build step, nothing else to install.

**How it works, briefly:** `embed.js` creates a small `<iframe>` pointed
back at your server and pins it to the bottom-right corner of whatever page
it's on. The actual chat UI (`widget-frame.html`, its CSS, its JS) lives
entirely inside that iframe — so nothing about the client's own site's
styles can accidentally clash with the chat, and nothing about the chat can
accidentally affect their page. When someone opens the chat, the page inside
the iframe tells `embed.js` to resize it from a small circle into a full
panel; when they close it, it shrinks back. The host page never has an
invisible full-panel-sized box sitting over its content.

A couple of implications worth knowing:
- Because the chat's own network requests happen *inside* the iframe (whose
  origin is always your server, never the client's site), `/api/chat` calls
  are same-origin from the chat's point of view. `ALLOWED_ORIGINS` from the
  Security section still matters for anyone hitting your API directly, but
  it's no longer something that can accidentally break the widget itself.
- The chat session ID is stored in the iframe's own `localStorage`, which
  is scoped to your server's origin, not the client's site. That means the
  same visitor gets a continuous conversation across a page reload on the
  client's site, but if your browser has strict third-party storage
  restrictions turned on (e.g. some privacy-focused browser settings), a
  returning visitor might occasionally start a fresh session instead of
  resuming — worth knowing, not something to lose sleep over for a demo.
- To test embedding for real (not just on `public/index.html`, which is
  conveniently same-origin), try dropping that `<script>` tag into literally
  any other page — a CodePen, a throwaway HTML file, whatever's handy — and
  confirm the bubble shows up and works there too.
- **If the bubble never appears on the client's site**, the most likely
  cause is something on their hosting setting an `X-Frame-Options` or
  `Content-Security-Policy: frame-ancestors` header that blocks any iframe
  from loading at all, site-wide. This project doesn't set either of those
  itself, so if it happens, it's coming from their host/CDN, not this code
  — worth a quick look in their browser console, which will show a clear
  "refused to display in a frame" error if that's what's happening.

## A note on the free tier

Free API tiers are meant for development and light demo use — rate limits
are modest and the model list changes over time as providers retire old
versions. That's fine for building this and showing it to one client, but
don't build a real paid product on a free key long-term: once you have a
paying client, budget a few dollars a month for a real API plan so the bot
doesn't hit a rate limit while their customers are trying to book.

## 8. Pitching this

When you show this to your dentist contact:
- Let her use it live rather than describing it — hand her a phone/laptop
  and let her ask it something.
- If you want to show her the leads/bookings data, open `/admin` and enter
  your `ADMIN_KEY` — a real dashboard reads much better in a pitch than a
  terminal command.
- Be upfront that this demo uses fake data — the value you're offering is
  building the real version around her actual hours, prices, and calendar.

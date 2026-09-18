// googleSheets.js
// Mirrors leads and bookings into a Google Sheet the client can watch live.
// Uses a service account (no login popup, no OAuth flow) — see README for setup.
// If the env vars aren't set, every function here quietly no-ops, so the app
// still works fine with just the local data.json store.

import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Private keys from a downloaded JSON key file contain literal "\n" sequences
// once they're pasted into a .env file as a single line — this turns them
// back into real newlines, which the auth library requires.
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const sheetsEnabled = Boolean(SHEET_ID && SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY);

let cachedClient = null;

function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

/**
 * Appends one row to the given tab (e.g. "Leads" or "Bookings").
 * Never throws — a Sheets outage or misconfiguration should never break a
 * booking that already saved fine to data.json. Errors are logged instead.
 */
export async function appendRow(tabName, rowValues) {
  if (!sheetsEnabled) return { synced: false, reason: "Google Sheets not configured" };

  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowValues] },
    });
    return { synced: true };
  } catch (err) {
    console.error(`⚠️  Failed to append to Google Sheet tab "${tabName}":`, err.message);
    return { synced: false, reason: err.message };
  }
}

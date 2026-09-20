import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const PRACTICE_NOTIFY_EMAIL = process.env.PRACTICE_NOTIFY_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || `"Bright Smile Dental" <${SMTP_USER}>`;

export const emailEnabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = emailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  : null;

// ==========================================
// ICS CALENDAR INVITE GENERATOR
// ==========================================

function generateICS(booking) {
  // Parse YYYY-MM-DD and time string
  const [year, month, day] = booking.date.split("-");
  let [hours, minutes] = [9, 0]; // Default fallback

  if (booking.time) {
    const timeMatch = booking.time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
    }
  }

  const pad = (num) => String(num).padStart(2, "0");
  
  // Calculate start time
  const dtStart = `${year}${pad(month)}${pad(day)}T${pad(hours)}${pad(minutes)}00`;

  // Calculate end time (30 minutes duration)
  let endHours = hours;
  let endMinutes = minutes + 30;
  if (endMinutes >= 60) {
    endHours += 1;
    endMinutes -= 60;
  }
  const dtEnd = `${year}${pad(month)}${pad(day)}T${pad(endHours)}${pad(endMinutes)}00`;
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bright Smile Dental//Appointment System//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:booking-${booking.id || Date.now()}@brightsmiledental.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Dental Appointment: ${booking.service}`,
    `DESCRIPTION:Appointment for ${booking.service} with Dr. Elena Ruiz at Bright Smile Dental.`,
    "LOCATION:142 Maple Ave, Springfield",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// ==========================================
// BRANDED HTML EMAIL TEMPLATES
// ==========================================

const BRAND_COLOR = "#0284c7"; // Bright Dental Blue
const ACCENT_COLOR = "#0f172a"; // Dark Slate
const BG_COLOR = "#f8fafc"; // Light Gray Background

function emailLayout({ title, content }) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${BG_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BG_COLOR}; padding: 30px 10px;">
        <tr>
          <td align="center">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background-color: ${BRAND_COLOR}; padding: 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                    🦷 Bright Smile Dental
                  </h1>
                </td>
              </tr>

              <!-- Body Content -->
              <tr>
                <td style="padding: 32px 28px;">
                  ${content}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 6px 0; font-weight: 600; color: ${ACCENT_COLOR};">Bright Smile Dental Practice</p>
                  <p style="margin: 0 0 6px 0;">142 Maple Ave, Springfield • (555) 019-2834</p>
                  <p style="margin: 0;">Hours: Mon–Fri 8am–6pm | Sat 9am–2pm</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function patientBookingTemplate(booking) {
  const content = `
    <h2 style="color: ${ACCENT_COLOR}; margin-top: 0; font-size: 20px;">Appointment Confirmed!</h2>
    <p style="font-size: 15px; line-height: 1.5; color: #475569;">
      Hello <strong>${booking.name}</strong>,<br>
      Your appointment with Dr. Elena Ruiz has been scheduled. Below are your booking details:
    </p>

    <!-- Details Card -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f9ff; border-left: 4px solid ${BRAND_COLOR}; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #334155;"><strong>Service:</strong> ${booking.service}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #334155;"><strong>Date:</strong> ${booking.date}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #334155;"><strong>Time:</strong> ${booking.time}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 14px; color: #334155;"><strong>Location:</strong> 142 Maple Ave, Springfield</td>
      </tr>
    </table>

    <p style="font-size: 14px; line-height: 1.5; color: #64748b;">
      📅 <em>A calendar invite (<code>appointment.ics</code>) is attached to this email so you can save this appointment to your calendar.</em>
    </p>

    <p style="font-size: 14px; line-height: 1.5; color: #64748b;">
      Please arrive 10 minutes prior to your scheduled time. If you need to reschedule or cancel, feel free to contact us or reply directly to this email.
    </p>
  `;
  return emailLayout({ title: "Appointment Confirmation - Bright Smile Dental", content });
}

function adminBookingTemplate(booking) {
  const content = `
    <h2 style="color: ${ACCENT_COLOR}; margin-top: 0; font-size: 20px;">📅 New Booking Received</h2>
    <p style="font-size: 15px; color: #475569;">A new appointment has been scheduled through the online assistant:</p>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Patient Name:</strong> ${booking.name}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Phone:</strong> ${booking.phone}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Email:</strong> ${booking.email}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Service:</strong> ${booking.service}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Date & Time:</strong> ${booking.date} at ${booking.time}</td></tr>
    </table>
  `;
  return emailLayout({ title: "New Booking Notification", content });
}

function adminLeadTemplate(lead) {
  const content = `
    <h2 style="color: ${ACCENT_COLOR}; margin-top: 0; font-size: 20px;">📇 New Inquiry / Follow-up Lead</h2>
    <p style="font-size: 15px; color: #475569;">A potential patient requested a follow-up:</p>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Name:</strong> ${lead.name}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Phone:</strong> ${lead.phone}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Email:</strong> ${lead.email || "Not provided"}</td></tr>
      <tr><td style="padding: 4px 0; font-size: 14px;"><strong>Inquiry/Reason:</strong> ${lead.reason}</td></tr>
    </table>
  `;
  return emailLayout({ title: "New Lead Notification", content });
}

function patientCancellationTemplate(booking) {
  const content = `
    <h2 style="color: #dc2626; margin-top: 0; font-size: 20px;">Appointment Cancelled</h2>
    <p style="font-size: 15px; line-height: 1.5; color: #475569;">
      Hello <strong>${booking.name}</strong>,<br>
      Your appointment for <strong>${booking.service}</strong> on <strong>${booking.date} at ${booking.time}</strong> has been successfully cancelled as requested.
    </p>

    <p style="font-size: 14px; line-height: 1.5; color: #64748b;">
      If you would like to book a new appointment in the future, feel free to visit our website or call us directly.
    </p>
  `;
  return emailLayout({ title: "Appointment Cancellation - Bright Smile Dental", content });
}

// ==========================================
// NOTIFICATION FUNCTIONS
// ==========================================

export async function notifyBooking(booking) {
  if (!transporter) return;

  const icsContent = generateICS(booking);

  // Send to Patient with .ics attachment
  if (booking.email) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `Appointment Confirmed: Bright Smile Dental (${booking.date})`,
      html: patientBookingTemplate(booking),
      icalEvent: {
        filename: "appointment.ics",
        method: "REQUEST",
        content: icsContent,
      },
    });
  }

  // Send to Practice Front Desk
  if (PRACTICE_NOTIFY_EMAIL) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: PRACTICE_NOTIFY_EMAIL,
      subject: `[New Booking] ${booking.name} - ${booking.date} @ ${booking.time}`,
      html: adminBookingTemplate(booking),
      icalEvent: {
        filename: "appointment.ics",
        method: "REQUEST",
        content: icsContent,
      },
    });
  }
}

export async function notifyLead(lead) {
  if (!transporter || !PRACTICE_NOTIFY_EMAIL) return;

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: PRACTICE_NOTIFY_EMAIL,
    subject: `[New Lead] ${lead.name} requested contact`,
    html: adminLeadTemplate(lead),
  });
}

export async function notifyCancellation(booking) {
  if (!transporter) return;

  if (booking.email) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: booking.email,
      subject: `Cancelled: Appointment on ${booking.date}`,
      html: patientCancellationTemplate(booking),
    });
  }

  if (PRACTICE_NOTIFY_EMAIL) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: PRACTICE_NOTIFY_EMAIL,
      subject: `[Cancelled] ${booking.name} - ${booking.date} @ ${booking.time}`,
      html: `<p>Appointment for <strong>${booking.name}</strong> on ${booking.date} at ${booking.time} was cancelled via assistant.</p>`,
    });
  }
}
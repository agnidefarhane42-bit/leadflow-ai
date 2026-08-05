import { NextRequest, NextResponse } from "next/server";
import { db, appointments, leads } from "@/lib/db";
import { eq } from "drizzle-orm";
import { google } from "googleapis";

// Generate available time slots for the next 7 days
function generateAvailableSlots(): { date: string; time: string; datetime: string }[] {
  const slots: { date: string; time: string; datetime: string }[] = [];
  const now = new Date();
  const businessHours = [9, 10, 11, 14, 15, 16, 17]; // 9h-11h, 14h-17h

  for (let day = 1; day <= 7; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    for (const hour of businessHours) {
      const slotDate = new Date(date);
      slotDate.setHours(hour, 0, 0, 0);

      const dateStr = slotDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const timeStr = `${hour}:00`;
      const datetimeStr = slotDate.toISOString();

      slots.push({ date: dateStr, time: timeStr, datetime: datetimeStr });
    }
  }

  return slots;
}

// GET: Available time slots for booking
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("leadId");

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    // Get existing appointments to exclude booked slots
    const existingAppointments = await db
      .select()
      .from(appointments)
      .where(eq(appointments.leadId, parseInt(leadId)));

    const bookedSlots = existingAppointments
      .filter((a) => a.status === "confirmed" || a.status === "pending")
      .map((a) => a.scheduledAt.toISOString());

    let slots = generateAvailableSlots();
    slots = slots.filter((s) => !bookedSlots.includes(s.datetime));

    return NextResponse.json({ slots });
  } catch (error) {
    console.error("Failed to get slots:", error);
    return NextResponse.json({ error: "Failed to get available slots" }, { status: 500 });
  }
}

// POST: Book an appointment
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadId, datetime, duration, notes } = body;

    if (!leadId || !datetime) {
      return NextResponse.json({ error: "leadId and datetime are required" }, { status: 400 });
    }

    // Create appointment in database
    const [appointment] = await db
      .insert(appointments)
      .values({
        leadId: parseInt(leadId),
        scheduledAt: new Date(datetime),
        duration: duration || 30,
        status: "confirmed",
        notes: notes || null,
      })
      .returning();

    // Try to sync with Google Calendar if credentials are available
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
        );

        // Note: Need stored tokens for this to work
        // const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        // await calendar.events.insert({
        //   calendarId: "primary",
        //   requestBody: {
        //     summary: `RDV - Lead #${leadId}`,
        //     description: notes || "Rendez-vous LeadFlow AI",
        //     start: { dateTime: datetime },
        //     end: { dateTime: new Date(new Date(datetime).getTime() + (duration || 30) * 60000).toISOString() },
        //   },
        // });
      } catch (calError) {
        console.error("Google Calendar sync failed:", calError);
        // Appointment is still saved in DB
      }
    }

    return NextResponse.json({
      success: true,
      appointment,
    });
  } catch (error) {
    console.error("Failed to create appointment:", error);
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
  }
}

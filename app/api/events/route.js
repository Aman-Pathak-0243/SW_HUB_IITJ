import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/db";
import Event from "../../../models/Event";
import { requirePermission } from "../../../lib/auth/session.mjs";

// NOTE: This is the V1 Mongo-backed events endpoint. It is fully rebuilt on
// Postgres/Prisma (content_item + event_payload) in Session 6. Until then, the
// only change made in Session 2 is closing the open-write hole (KNOWN_ISSUES #2):
// POST is now gated by the server-side RBAC utility instead of being writable by
// anyone. GET stays public (events are public content).

// GET — Fetch all events (public)
export async function GET() {
  try {
    await connectDB();
    const events = await Event.find().sort({ date: 1 });
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — Add new event (requires content.create)
export async function POST(req) {
  try {
    await requirePermission("content.create");
  } catch (e) {
    return NextResponse.json(
      { error: e.message },
      { status: e.status ?? 403 }
    );
  }

  try {
    const data = await req.json();
    await connectDB();
    const event = await Event.create(data);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
//import { connectDB } from "@/lib/db";
//import Event from "@/models/Event";
import { connectDB } from "../../../lib/db";
import Event from "../../../models/Event";

// GET — Fetch all events
export async function GET() {
  try {
    await connectDB();
    const events = await Event.find().sort({ date: 1 }); // sort by date
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — Add new event
export async function POST(req) {

  try {
    const data = await req.json();
    await connectDB();

    const event = await Event.create(data);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

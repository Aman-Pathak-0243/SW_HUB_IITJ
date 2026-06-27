import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  date: { type: Date, required: true },
  image: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Event || mongoose.model("Event", EventSchema);

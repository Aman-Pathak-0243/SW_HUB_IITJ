"use client";
import React, { useState } from "react";
import Header from "../components/Header";

const AdminPage = () => {
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    image: "",
  });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("Adding event...");

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setMessage("✅ Event added successfully!");
      setForm({ title: "", description: "", date: "", image: "" });
    } else {
      setMessage("❌ Failed to add event.");
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-3xl font-bold text-[#003f87] mb-8">Admin: Add Event</h1>
        <form
          onSubmit={handleSubmit}
          className="bg-white p-8 rounded-xl shadow-md w-full max-w-lg space-y-4"
        >
          <input
            type="text"
            name="title"
            placeholder="Event Title"
            value={form.title}
            onChange={handleChange}
            required
            className="w-full border p-3 rounded-lg"
          />
          <textarea
            name="description"
            placeholder="Description"
            value={form.description}
            onChange={handleChange}
            className="w-full border p-3 rounded-lg"
          ></textarea>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={handleChange}
            required
            className="w-full border p-3 rounded-lg"
          />
          <input
            type="text"
            name="image"
            placeholder="Image URL (optional)"
            value={form.image}
            onChange={handleChange}
            className="w-full border p-3 rounded-lg"
          />
          <button
            type="submit"
            className="w-full bg-[#003f87] text-white py-3 rounded-lg hover:bg-blue-900"
          >
            Publish Event
          </button>
          <p className="text-center text-gray-600">{message}</p>
        </form>
      </main>
    </>
  );
};

export default AdminPage;

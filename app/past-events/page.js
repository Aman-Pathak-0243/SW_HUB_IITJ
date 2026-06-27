"use client";
import React, { useState, useEffect } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import EventCard from "../components/EventCard";

const PastEvents = () => {
  const [pastEvents, setPastEvents] = useState([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch("/api/events");
        const data = await res.json();

        if (data.success) {
          const today = new Date();
          const filtered = data.events.filter((e) => new Date(e.date) < today);
          setPastEvents(filtered);
        }
      } catch (error) {
        console.error("Failed to fetch events:", error);
      }
    };

    fetchEvents();
  }, []);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-8 md:px-16">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#003f87] text-center mb-10">
            Past Events
          </h1>
          {pastEvents.length === 0 ? (
            <p className="text-center text-gray-500 text-lg">No past events yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {pastEvents.map((event) => (
                <EventCard key={event._id} event={event} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default PastEvents;

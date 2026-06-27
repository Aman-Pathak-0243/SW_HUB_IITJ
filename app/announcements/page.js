"use client";
import React, { useEffect, useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import EventCard from "../components/EventCard";

const AnnouncementsPage = () => {
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);

  useEffect(() => {
    async function fetchEvents() {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
    }
    fetchEvents();
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      const today = new Date();
      const upcoming = events.filter((e) => new Date(e.date) >= today);
      const past = events.filter((e) => new Date(e.date) < today);
      setUpcoming(upcoming);
      setPast(past);
    }
  }, [events]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@300;400;500;600&display=swap');

        .ann-page {
          font-family: 'Outfit', sans-serif;
          min-height: 100vh;
          background: #f0f4fb;
          position: relative;
          overflow-x: hidden;
        }

        /* Subtle diagonal grid background */
        .ann-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,48,135,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,48,135,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        .ann-inner {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 56px 24px 80px;
        }

        /* ── Hero heading ── */
        .ann-hero {
          text-align: center;
          margin-bottom: 64px;
        }
        .ann-hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #FF6B00;
          margin-bottom: 14px;
        }
        .ann-hero-eyebrow::before,
        .ann-hero-eyebrow::after {
          content: '';
          display: block;
          width: 32px;
          height: 1.5px;
          background: #FF6B00;
          opacity: 0.6;
          border-radius: 2px;
        }
        .ann-hero h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(2rem, 5vw, 3.2rem);
          font-weight: 700;
          color: #003087;
          letter-spacing: 0.04em;
          line-height: 1.1;
          margin-bottom: 16px;
        }
        .ann-hero-line {
          width: 72px;
          height: 3px;
          background: linear-gradient(90deg, #003087, #FF6B00);
          border-radius: 2px;
          margin: 0 auto;
        }

        /* ── Section headers ── */
        .ann-section {
          margin-bottom: 60px;
        }
        .ann-section-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }
        .ann-section-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 18px 6px 14px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .ann-section-badge.upcoming {
          background: #003087;
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(0,48,135,0.25);
        }
        .ann-section-badge.past {
          background: #fff;
          color: #003087;
          border: 1.5px solid rgba(0,48,135,0.2);
          box-shadow: 0 2px 8px rgba(0,48,135,0.08);
        }
        .ann-section-badge .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #FF6B00;
          flex-shrink: 0;
        }
        .ann-section-badge.past .dot {
          background: rgba(0,48,135,0.35);
        }
        .ann-section-divider {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(0,48,135,0.15), transparent);
        }

        /* ── Grid ── */
        .ann-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 28px;
        }

        /* ── Empty state ── */
        .ann-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 48px 24px;
          background: white;
          border-radius: 16px;
          border: 1.5px dashed rgba(0,48,135,0.15);
          color: #6b7280;
          font-size: 0.9rem;
          font-style: italic;
          letter-spacing: 0.02em;
        }

        /* ── Count pill ── */
        .count-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          font-size: 0.68rem;
          font-weight: 700;
          background: #FF6B00;
          color: white;
          flex-shrink: 0;
        }
        .ann-section-badge.past .count-pill {
          background: rgba(0,48,135,0.15);
          color: #003087;
        }

        /* Fade-in animation */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ann-hero    { animation: fadeUp 0.5s ease both; }
        .ann-section { animation: fadeUp 0.5s ease both; }
        .ann-section:nth-child(2) { animation-delay: 0.1s; }
        .ann-section:nth-child(3) { animation-delay: 0.2s; }
      `}</style>

      <Header />
      <main className="ann-page">
        <div className="ann-inner">

          {/* Hero heading */}
          <div className="ann-hero">
            <p className="ann-hero-eyebrow">Student Affairs Council</p>
            <h1>Announcements &amp; Events</h1>
            <div className="ann-hero-line" />
          </div>

          {/* Upcoming Events */}
          <section className="ann-section">
            <div className="ann-section-header">
              <div className="ann-section-badge upcoming">
                <span className="dot" />
                Upcoming
                <span className="count-pill">{upcoming.length}</span>
              </div>
              <div className="ann-section-divider" />
            </div>
            <div className="ann-grid">
              {upcoming.length ? (
                upcoming.map((event) => (
                  <EventCard key={event._id} event={event} />
                ))
              ) : (
                <p className="ann-empty">No upcoming events at the moment.</p>
              )}
            </div>
          </section>

          {/* Past Events */}
          <section className="ann-section">
            <div className="ann-section-header">
              <div className="ann-section-badge past">
                <span className="dot" />
                Past Events
                <span className="count-pill">{past.length}</span>
              </div>
              <div className="ann-section-divider" />
            </div>
            <div className="ann-grid">
              {past.length ? (
                past.map((event) => (
                  <EventCard key={event._id} event={event} />
                ))
              ) : (
                <p className="ann-empty">No past events yet.</p>
              )}
            </div>
          </section>

        </div>
      </main>
      <Footer />
    </>
  );
};

export default AnnouncementsPage;
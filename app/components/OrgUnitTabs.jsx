// Data-driven, TABBED org-unit detail renderer (M3, DL-079). Supersedes the flat
// <OrgUnitPage> (Session 5): ONE presentational component renders ANY org unit —
// council, club, hostel or mess — from the view returned by
// lib/org/public.mjs#getClubPageView. A persistent header sits above a tab bar; the
// expanded club/council tabs (Announcements / Upcoming / Past events / Achievements /
// Documents) appear only for those types (view.expanded); hostels/messes show just
// Overview (+ Resources when present). Client component (tab state); the route
// fetches the view server-side and passes it in (JSON-safe), so this stays a pure
// function of data. Markdown docs are rendered SAFELY via lib/markdown/render.mjs.
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatTime } from "../../lib/org/normalize.mjs";
import { renderMarkdown } from "../../lib/markdown/render.mjs";
import ResourcesSection from "./ResourcesSection";
import AchievementCard from "./AchievementCard";

function mediaUrl(view, id) {
  return id ? view.media?.[id]?.url ?? null : null;
}

function Section({ title, children }) {
  return (
    <section className="max-w-6xl mx-auto px-6 mt-8">
      {title && <h2 className="text-2xl font-bold text-[#003f87] mb-6">{title}</h2>}
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div className="max-w-6xl mx-auto px-6 mt-8 text-gray-500">{children}</div>;
}

function PersonCard({ member }) {
  const inner = (
    <div className="flex items-center gap-5 bg-blue-50 rounded-xl p-5">
      {member.person.photoUrl ? (
        <div className="relative w-20 h-20 rounded-full overflow-hidden shrink-0 bg-gray-100">
          <Image src={member.person.photoUrl} alt={member.person.name ?? ""} fill sizes="80px" className="object-cover" />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full shrink-0 bg-[#003f87]/10 flex items-center justify-center text-2xl text-[#003f87] font-bold">
          {(member.person.name ?? "?").trim().charAt(0)}
        </div>
      )}
      <div>
        {member.title && <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full inline-block mb-1">{member.title}</span>}
        <p className="text-lg font-semibold text-[#003f87]">{member.person.name}</p>
      </div>
    </div>
  );
  return member.person.profileUrl ? (
    <Link href={member.person.profileUrl} target="_blank" rel="noopener noreferrer" className="block hover:shadow-md transition rounded-xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function fmtDate(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

// An enriched club card (used on a council page) — logo + name + vision + PIC +
// coordinator(s), matching the /org/clubs listing card.
function ClubCard({ view, child }) {
  const logo = mediaUrl(view, child.profile?.payload?.logoMediaId);
  const pic = child.pic ?? null;
  const coordinators = child.coordinators ?? [];
  return (
    <Link href={`/org/${child.unit.typeKey}/${child.unit.slug}`} className="bg-white rounded-xl shadow hover:shadow-xl transition overflow-hidden block">
      {logo && (
        <div className="relative w-full aspect-[4/3] bg-gray-100">
          <Image src={logo} alt={child.unit.name} fill sizes="(max-width:768px) 100vw, 33vw" className="object-contain p-3" />
        </div>
      )}
      <div className="p-5">
        <h3 className="text-lg font-bold text-[#003f87]">{child.unit.name}</h3>
        {child.profile?.payload?.vision && <p className="text-sm text-gray-600 mt-2 line-clamp-3">{child.profile.payload.vision}</p>}
        {(pic || coordinators.length > 0) && (
          <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
            {pic && (
              <div className="flex items-center gap-2">
                {pic.photoUrl && <Image src={pic.photoUrl} alt="" width={24} height={24} className="rounded-full object-cover border border-gray-200 shrink-0" />}
                <p className="text-xs text-gray-700"><span className="font-semibold text-[#003f87]">PIC:</span> {pic.name}</p>
              </div>
            )}
            {coordinators.length > 0 && (
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-[#003f87]">{coordinators.length > 1 ? "Coordinators:" : "Coordinator:"}</span>{" "}
                {coordinators.map((x) => x.name).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── tab bodies ──

function OverviewTab({ view }) {
  const { unit, profile, roster = [], children = [] } = view;
  const payload = profile?.payload ?? {};
  const hasAny = payload.vision || (payload.missionPoints?.length) || payload.location || payload.capacity != null || payload.officeEmail || (payload.mealTimings?.length) || roster.length || children.length;

  return (
    <>
      {payload.vision && (
        <Section title="Vision">
          <p className="text-gray-700 max-w-3xl">{payload.vision}</p>
        </Section>
      )}

      {Array.isArray(payload.missionPoints) && payload.missionPoints.length > 0 && (
        <Section title="Mission">
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            {payload.missionPoints.map((m, i) => <li key={i}>{m.text}</li>)}
          </ul>
        </Section>
      )}

      {(payload.location || payload.capacity != null) && (
        <Section title="Details">
          <div className="space-y-2 text-gray-700">
            {payload.location && <p>📍 Location — {payload.location}</p>}
            {payload.capacity != null && <p>👥 Capacity — {payload.capacity} students</p>}
            {payload.officeEmail && <p>✉️ {payload.officeEmail}</p>}
          </div>
        </Section>
      )}
      {payload.officeEmail && !(payload.location || payload.capacity != null) && (
        <Section title="Contact"><p className="text-gray-700">✉️ {payload.officeEmail}</p></Section>
      )}

      {Array.isArray(payload.mealTimings) && payload.mealTimings.length > 0 && (
        <Section title="Mess Timings">
          <div className="flex flex-wrap gap-4">
            {payload.mealTimings.map((t, i) => (
              <div key={i} className="bg-white rounded-xl shadow px-5 py-3 text-center">
                <p className="font-bold text-[#003f87] capitalize">{t.meal}</p>
                <p className="text-sm text-gray-600">{formatTime(t.startTime)} – {formatTime(t.endTime)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {roster.length > 0 && (
        <Section title="Team">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roster.map((m) => <PersonCard key={m.id} member={m} />)}
          </div>
        </Section>
      )}

      {children.length > 0 && (
        <Section title="Clubs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map((c) => <ClubCard key={c.unit.id} view={view} child={c} />)}
          </div>
        </Section>
      )}

      {!hasAny && <Empty>No details have been published for this page yet.</Empty>}
    </>
  );
}

function EventCardLite({ ev }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      {ev.coverUrl && (
        <div className="relative w-full h-40 rounded-lg overflow-hidden mb-3 bg-gray-100">
          <Image src={ev.coverUrl} alt={ev.title ?? ""} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover" />
        </div>
      )}
      <h3 className="text-lg font-bold text-[#003f87]">{ev.title}</h3>
      <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-3">
        {fmtDate(ev.eventDate) && <span>📅 {fmtDate(ev.eventDate)}</span>}
        {ev.location && <span>📍 {ev.location}</span>}
      </div>
      {ev.summary && <p className="text-gray-700 mt-2">{ev.summary}</p>}
    </div>
  );
}

function EventsTab({ list, kind }) {
  if (!list?.length) {
    return (
      <Empty>
        {kind === "upcoming" ? "No upcoming events for this club right now." : "No past events recorded for this club yet."}
        {" "}
        <Link href="/events" className="text-[#003f87] font-semibold underline">Browse all events →</Link>
      </Empty>
    );
  }
  return (
    <Section title={null}>
      {kind === "upcoming" && (
        <p className="text-sm text-gray-500 mb-4">Register &amp; participate on the central <Link href="/events" className="text-[#003f87] font-semibold underline">Events playground</Link>.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.map((ev) => <EventCardLite key={ev.id} ev={ev} />)}
      </div>
    </Section>
  );
}

function AnnouncementCardLite({ a }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-[#003f87]">{a.title}</h3>
        {a.syncToCentral && <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">On central board</span>}
      </div>
      {fmtDate(a.publishedAt) && <p className="text-xs text-gray-500 mt-1">{fmtDate(a.publishedAt)}</p>}
      {a.body && <p className="text-gray-700 mt-2 whitespace-pre-wrap">{a.body}</p>}
    </div>
  );
}

function AnnouncementsTab({ grouped }) {
  const { upcoming = [], current = [], past = [] } = grouped ?? {};
  if (!upcoming.length && !current.length && !past.length) {
    return <Empty>No announcements for this club yet.</Empty>;
  }
  const block = (label, list) =>
    list.length > 0 && (
      <Section title={label}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {list.map((a) => <AnnouncementCardLite key={a.id} a={a} />)}
        </div>
      </Section>
    );
  return (
    <>
      {block("Current", current)}
      {block("Upcoming", upcoming)}
      {block("Past", past)}
    </>
  );
}

function DocsTab({ docs }) {
  if (!docs?.length) return <Empty>No documents have been published for this club yet.</Empty>;
  return (
    <Section title={null}>
      <div className="space-y-8">
        {docs.map((d) => (
          <article key={d.id} className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xl font-bold text-[#003f87] mb-3">{d.title}</h3>
            {d.body && (
              <div
                className="md-body prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(d.body) }}
              />
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}

function AchievementsTab({ achievements }) {
  if (!achievements?.length) {
    return (
      <Empty>
        No achievements recorded for this club yet.{" "}
        <Link href="/wall-of-fame" className="text-[#003f87] font-semibold underline">See the institute Wall of Fame →</Link>
      </Empty>
    );
  }
  return (
    <Section title={null}>
      <p className="text-sm text-gray-500 mb-4">
        This club&apos;s recognitions — part of the institute{" "}
        <Link href="/wall-of-fame" className="text-[#003f87] font-semibold underline">Wall of Fame</Link>.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {achievements.map((a) => (
          <AchievementCard key={a.id} achievement={a} compact />
        ))}
      </div>
    </Section>
  );
}

// ── shell ──

export default function OrgUnitTabs({ view }) {
  const initial = "overview";
  const [active, setActive] = useState(initial);

  if (!view) {
    return <div className="max-w-3xl mx-auto px-6 py-24 text-center text-gray-600">This page is not available for the current year.</div>;
  }

  const { unit, profile, resources = [], expanded, events, announcements, docs = [], achievements = [], memberCount = 0 } = view;
  const payload = profile?.payload ?? {};
  const heroId = payload.heroMediaId || payload.logoMediaId || payload.buildingMediaId || payload.imageMediaId;
  const heroUrl = mediaUrl(view, heroId);

  const tabs = [{ key: "overview", label: "Overview" }];
  if (expanded) {
    tabs.push({ key: "announcements", label: "Announcements" });
    tabs.push({ key: "upcoming", label: "Upcoming Events" });
    tabs.push({ key: "past", label: "Past Events" });
    tabs.push({ key: "achievements", label: "Achievements" });
  }
  if (resources.length) tabs.push({ key: "resources", label: "Resources" });
  if (expanded) tabs.push({ key: "docs", label: "Documents" });

  const activeTab = tabs.some((t) => t.key === active) ? active : "overview";

  return (
    <div className="pb-20">
      {/* Persistent header banner */}
      <section className="bg-gradient-to-r from-blue-50 to-blue-100 pt-24 pb-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center gap-8">
          {heroUrl && (
            <div className="relative w-40 h-40 rounded-2xl overflow-hidden bg-white shadow shrink-0">
              <Image src={heroUrl} alt={unit.name} fill sizes="160px" priority className="object-contain p-2" />
            </div>
          )}
          <div>
            <p className="uppercase tracking-wide text-sm text-[#003f87]/70 font-semibold">{unit.typeName}</p>
            <h1 className="text-4xl font-bold text-[#003f87]">{profile?.title ?? unit.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {expanded && memberCount > 0 && (
                <span className="text-sm font-semibold text-[#003f87] bg-white/70 px-3 py-1 rounded-full">{memberCount} member{memberCount === 1 ? "" : "s"}</span>
              )}
              {payload.instagramUrl && (
                <Link href={payload.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white bg-[#003f87] hover:bg-[#06376e] px-4 py-1.5 rounded-lg font-semibold transition text-sm">
                  Instagram
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                activeTab === t.key ? "border-[#003f87] text-[#003f87]" : "border-transparent text-gray-500 hover:text-[#003f87]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab body */}
      <div className="mt-4">
        {activeTab === "overview" && <OverviewTab view={view} />}
        {activeTab === "announcements" && <AnnouncementsTab grouped={announcements} />}
        {activeTab === "upcoming" && <EventsTab list={events?.upcoming} kind="upcoming" />}
        {activeTab === "past" && <EventsTab list={events?.past} kind="past" />}
        {activeTab === "achievements" && <AchievementsTab achievements={achievements} />}
        {activeTab === "resources" && <ResourcesSection resources={resources} />}
        {activeTab === "docs" && <DocsTab docs={docs} />}
      </div>
    </div>
  );
}

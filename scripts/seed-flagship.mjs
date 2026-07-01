// Idempotent seed of the 6 curated FLAGSHIP EVENTS (content_type='flagship_event')
// migrated from the former static /Flagship-events page. Each becomes a published CMS
// content item an editor can then edit/pin/add-to in the admin Content module.
// Idempotent by (contentType, current year, slug) — re-runs create 0. Images are the
// /public posters, registered as media-inventory assets.
//
//   npm run db:seed:flagship      (== dotenv -e .env.local -- node scripts/seed-flagship.mjs)
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { createDraft, publish } from "../lib/cms/content.mjs";
import { findOrCreateInventoryAsset } from "../lib/media/service.mjs";

const EVENTS = [
  { slug: "anhad", title: "Anhad – Techno-Cultural Fest", category: "Cultural", image: "/anhad.jpg",
    description: "Anhad is IIT Jammu’s techno-cultural fest, celebrating creativity, expression, and diversity. The festival features music, dance, drama, literary arts, fine arts, and a series of high-energy events that bring students together in a vibrant cultural showcase." },
  { slug: "nexus", title: "Nexus – Inter Branch Technical Fest", category: "Technical", image: "/nexus.jpg",
    description: "Nexus is IIT Jammu’s inter branch technical festival that promotes innovation, engineering excellence, and problem-solving. The fest includes hackathons, robotics competitions, technical workshops, research exhibitions, and events aimed at fostering scientific thinking among students." },
  { slug: "convoquer", title: "Convoquer – Inter-College Sports Tournament", category: "Sports", image: "/convoquer.jpg",
    description: "Convoquer is IIT Jammu’s premier inter-college sports tournament, bringing together athletes from institutions across the region to compete in a wide range of sporting events. The festival celebrates competitive spirit, teamwork, discipline, and excellence. With high-energy matches, enthusiastic crowds, and a vibrant sports culture, Convoquer stands as a symbol of athletic passion and unity at IIT Jammu." },
  { slug: "pragyaan", title: "Pragyaan – Academic & Research Conclave", category: "Academic", image: "/pragyaan.jpg",
    description: "Pragyaan is IIT Jammu’s academic and research festival that brings together scholars, innovators, and professionals to exchange knowledge and ideas. The event features expert talks, panel discussions, research presentations, and interactive workshops designed to ignite intellectual curiosity and promote academic excellence." },
  { slug: "udyamitsav", title: "Udyamitsav – Entrepreneurship Fest", category: "Entrepreneurship", image: "/udyamitsav.jpg",
    description: "Udyamitsav is IIT Jammu’s entrepreneurship and innovation festival dedicated to nurturing startup culture and creative problem-solving. The summit includes pitch competitions, startup showcases, mentorship programs, and sessions with industry leaders, empowering students to transform ideas into impactful ventures." },
  { slug: "pravaah", title: "Pravaah – Inter Branch Sports Meet", category: "Sports", image: "/pravaah.jpg",
    description: "Pravaah is IIT Jammu’s annual inter-branch sports meet, designed to promote healthy competition, teamwork, and athletic excellence among students. The event brings together participants from all academic branches to compete across a variety of sports, fostering unity, sportsmanship, and a vibrant sporting culture on campus." },
];

async function main() {
  const academicYearId = await getCurrentYearId();
  if (!academicYearId) { console.error("No current academic year — run npm run db:seed first."); process.exit(1); }
  const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
  const actor = dev ? { userId: dev.id } : { system: true };

  let created = 0, skipped = 0;
  for (const e of EVENTS) {
    const existing = await prisma.contentItem.findFirst({ where: { contentType: "flagship_event", academicYearId, slug: e.slug }, select: { id: true } });
    if (existing) { skipped += 1; continue; }
    let imageMediaId = null;
    try { imageMediaId = (await findOrCreateInventoryAsset(e.image))?.id ?? null; } catch { imageMediaId = null; }
    const { item } = await createDraft(
      { contentType: "flagship_event", academicYearId, slug: e.slug, title: e.title, payload: { description: e.description, imageMediaId, category: e.category } },
      actor
    );
    await publish(item.id, {}, actor);
    created += 1;
    console.log("created flagship:", e.slug);
  }
  console.log("Flagship seed complete:", JSON.stringify({ created, skipped }, null, 2));
}

main().then(async () => { await prisma.$disconnect(); }).catch(async (e) => { console.error("Flagship seed failed:", e); await prisma.$disconnect(); process.exit(1); });

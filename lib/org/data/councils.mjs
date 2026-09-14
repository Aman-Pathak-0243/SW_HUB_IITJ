// COUNCILS + CLUBS dataset (DATA_MIGRATION_REPORT §7) — the importer
// (lib/org/import.mjs) stands these up as org_units + bound profile content +
// appointments for the current year. This is plain DATA — no DB, no logic.
//
// The club/council SHELLS (name, slug, logo, vision, mission, instagram) are
// still the V1 extraction from the four near-identical V1 Clubs pages
// (app/Clubs/{General,Academic,Cultural,Sports}/page.jsx).
//
// The PEOPLE are the 2026-27 roster. Where the sources disagree the registrar's
// NOTIFICATIONS win over the intake sheet — they are the appointment of record:
//   · IITJMU/SW/11-17/2/2026/187 (15 Jul 2026) — club PICs + club associates
//   · IITJMU/SW/11-17/2/2026/203 (30 Jul 2026) — club coordinators / co-coordinators
//   · the sports-coordinator notification for the Sports Council clubs
// The intake sheet (public/your_file.xlsx) remains the source for CONTACT details
// the notifications don't carry — photos (public/images-2026-27-v1/) and the staff
// /faculty email addresses. Student emails are their institute ID, lowercased,
// at iitjammu.ac.in — the form every sheet-supplied student address takes.
//
// Two clubs are named differently by the registrar than by the club itself: this
// file keeps "Robo-sapiens Club" and "Astriaza Club" (their own branding, matching
// their Instagram handles and the live slugs), which the notifications list as
// "Robotics Club" and "Astronomy Club". Same PIC, same coordinators, same club —
// renaming would change the slug, so it is a DB migration, not a data edit.
//
// Each council → one org_unit (type 'council') + a 'council_secretary'
// appointment. Each club → one org_unit (type 'club', parent = its council) +
// a 'club_profile' content_item (vision + mission list + instagram + logo) +
// 'pic' / 'coordinator' / 'co_coordinator' / 'club_associate' appointments.
// Sports clubs have no PIC (they had none in V1), so `pic` is omitted there.
//
// PLACEHOLDERS: a role the 2026-27 sheet did not fill carries the marker name
// "<Club Name>_pic" / "<Club Name>_coordinator" (no email, no photo) rather than
// a stale 2025-26 name. Replace these as the real appointments come in — they
// are deliberately conspicuous on the public club cards.
//
// People are deduped by name across the whole import (lib/org/normalize.mjs#personKey);
// the same Dr./student appears once in `person` and gains multiple appointments.

// The institute Associate Deans, mapped to councils by DOMAIN: Sports Council →
// AD (Sports), Academic Council → AD (Academic Affairs); General/Cultural/Technical
// fall under the overarching AD (Student Affairs). (The Team page also lists
// AD-Hostel + AD-Mess, applied to the hostels/messes datasets.) Person dedup makes
// each AD one directory row no matter how many councils reference it.
const AD_STUDENT_AFFAIRS = { name: "Dr. Devi Lal", title: "Associate Dean (Student Affairs)", profileUrl: "https://iitjammu.ac.in/materials-engineering/faculty-list/~devilal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641537/WhatsApp_Image_2026-01-17_at_14.12.59_ap6x4e.jpg" };
const AD_SPORTS = { name: "Dr. Shiva S", title: "Associate Dean (Sports)", profileUrl: "https://iitjammu.ac.in/faculty/~shivas", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1772463418/ad_sports_m7hktw.jpg" };
// The Academic Council has its OWN Associate Dean rather than the AD (Student Affairs).
// No photo or profile URL supplied yet: the council page shows a monogram initial and
// the list tile omits the avatar — both render fine. Add `photo:` / `profileUrl:` later.
const AD_ACADEMIC = { name: "Dr. Ashutosh Yadav", title: "Associate Dean (Academic Affairs)" };

export const COUNCILS = [
  {
    key: "general",
    name: "General Affairs Council",
    slug: "general-affairs-council",
    secretary: { name: "Aditya Pratap Singh", email: "2024umt0162@iitjammu.ac.in", titleOverride: "General Secretary" },
    associateDean: AD_STUDENT_AFFAIRS,
    logo: "https://res.cloudinary.com/dabviijid/image/upload/v1773993041/WhatsApp_Image_2026-03-11_at_11.24.42_AM-removebg-preview_tddjlb.png",
    clubs: [
      {
        name: "Nature and Adventure Club",
        instagram: "https://www.instagram.com/nac_iitjmu",
        logo: "/NAC test.png",
        vision: "To promote environmental awareness and adventurous spirit among students.",
        mission: ["Organize treks", "Promote eco-friendly practices", "Encourage exploration"],
        pic: { name: "Dr. Ved Prakash Ranjan" },
        coordinators: [
          { name: "Nitish", email: "2025ubs0003@iitjammu.ac.in", photo: "/images-2026-27-v1/Nitish.jpg" },
          { name: "Priyanka Ramchandani", email: "2025uch0015@iitjammu.ac.in", role: "Co-Coordinator", photo: "/images-2026-27-v1/Priyanka Ramchandani.jpg" },
        ],
        associates: [{ name: "Ms. Madhu Pahal", email: "madhu.pahal@iitjammu.ac.in", photo: "/images-2026-27-v1/Madhu Pahal.jpg" }],
      },
      {
        name: "Kritash Club",
        instagram: "https://www.instagram.com/kritash_iitjammu",
        logo: "/kritash.jpg",
        vision: "To encourage creativity and innovation.",
        mission: ["Promote community service", "Organize drives", "Encourage leadership"],
        pic: { name: "Dr. Sanchita Srivastava" },
        coordinators: [
          { name: "Hardik V. Shakya", email: "2025ume0292@iitjammu.ac.in", photo: "/images-2026-27-v1/Hardik V. Shakya.jpg" },
          { name: "Ayush Chourasia", email: "2025uce0062@iitjammu.ac.in" },
        ],
        associates: [{ name: "Sumit Raj Ghosh" }],
      },
      {
        name: "RE4M Club",
        instagram: "https://www.instagram.com/re4m_iitjammu",
        logo: "/RE4M.jpg",
        vision: "To drive sustainable practices.",
        mission: ["Promote recycling", "Conduct workshops", "Encourage green initiatives"],
        pic: { name: "Dr. Moni Kumari" },
        coordinators: [{ name: "Saksham", email: "2025uep0161@iitjammu.ac.in", photo: "/images-2026-27-v1/Saksham.jpg" }],
        associates: [{ name: "Sh. Ashish Sharma", email: "ashish.sharma@iitjammu.ac.in", photo: "/images-2026-27-v1/Ashish Sharma.jpg" }],
      },
      {
        name: "Mesh Club",
        instagram: "https://www.instagram.com/mesh.iitjammu",
        logo: "/mesh.jpg",
        vision: "To inspire learning and innovation.",
        mission: ["Organize talks", "Encourage interdisciplinary learning"],
        pic: { name: "Dr. Dhanendra Kumar", email: "dhanendra.kumar@iitjammu.ac.in", profileUrl: "https://iitjammu.ac.in/faculty/~dhanendrakumar", photo: "/images-2026-27-v1/Dhanendra Kumar.jpg" },
        coordinators: [{ name: "Lavya Rastogi", email: "2025uma0228@iitjammu.ac.in", photo: "/images-2026-27-v1/Lavya Rastogi.jpg" }],
        associates: [{ name: "Sh. Desh Raj Meena" }],
      },
      {
        name: "Ek Bharat Shreshtha Bharat",
        instagram: "https://www.instagram.com/ebsb.iitjammu",
        logo: "/ebsb.jpg",
        vision: "To promote unity in diversity.",
        mission: ["Cultural programs", "Celebrate diversity"],
        pic: { name: "Dr. Padmini Singh", email: "padmini.singh@iitjammu.ac.in", photo: "/images-2026-27-v1/Dr. Padmini Singh.jpg" },
        coordinators: [{ name: "Swarup Anil Raikwar", email: "2025ubs0012@iitjammu.ac.in", photo: "/images-2026-27-v1/Swarup Anil Raikwar.jpg" }],
        associates: [{ name: "Sh. Sunil Kumar", email: "sunil.kumar1@iitjammu.ac.in", photo: "/images-2026-27-v1/Sunil Kumar.jpg" }],
      },
      {
        name: "Wellbeing Club",
        instagram: "https://www.instagram.com/wellbeing.iitjammu",
        logo: "/wellbeing.jpg",
        vision: "To foster mental and physical wellbeing.",
        mission: ["Conduct workshops", "Promote awareness"],
        pic: { name: "Dr. Ravi Kant Saini" },
        coordinators: [{ name: "Harshit Kumar", email: "2025ubs0021@iitjammu.ac.in" }],
        associates: [{ name: "Sh. Rahul Ranjan", email: "rahul.ranjan@iitjammu.ac.in", photo: "/images-2026-27-v1/Rahul Ranjan.jpg" }],
      },
    ],
  },

  {
    key: "academic",
    name: "Academic Council",
    slug: "academic-council",
    // 2026-27: the Academic Council's student lead is the Academic Secretary. Its
    // five technical clubs (Coding, SAE, Robo-sapiens, Astriaza, FinTech) now sit under
    // the Technical Council below, so this council currently runs NO clubs — it keeps
    // its unit, profile and secretary, and gains clubs again when any are chartered.
    secretary: { name: "Aradhya Sharma", email: "2024uma0200@iitjammu.ac.in", titleOverride: "Academic Secretary (UG)", photo: "/images-2026-27-v1/Aradhya Sharma.jpg" },
    associateDean: AD_ACADEMIC,
    logo: "/Academic.png",
    clubs: [],
  },

  {
    key: "cultural",
    name: "Cultural Council",
    slug: "cultural-council",
    secretary: { name: "Induj Tyagi", email: "2024ume0243@iitjammu.ac.in", titleOverride: "Cultural Secretary" },
    associateDean: AD_STUDENT_AFFAIRS,
    clubs: [
      {
        name: "Photography Club",
        instagram: "https://www.instagram.com/chitraka_iitjammu",
        logo: "/photography.jpg",
        vision: "To capture stories, emotions, and perspectives through the art of photography.",
        mission: ["Promote visual storytelling", "Conduct photography workshops", "Encourage creative expression"],
        pic: { name: "Dr. Prasun Halder", email: "prasun.halder@iitjammu.ac.in", profileUrl: "https://www.iitjammu.ac.in/faculty/~prasunhalder", photo: "/images-2026-27-v1/Prasun Halder.jpg" },
        coordinators: [{ name: "Prithvi Singh Solanki", email: "2025uch0008@iitjammu.ac.in", photo: "/images-2026-27-v1/Prithvi Singh Solanki.jpg" }],
        associates: [{ name: "Sh. Vivek Ramesh Sharma" }],
      },
      {
        name: "Literary Club",
        // "sangam.iitjammu" is the LITERARY Club's own handle, despite the name overlap
        // with the Sangam (Media) Club chartered for 2026-27 — they are separate clubs
        // and this account is not the media club's. Confirmed; do not reassign it.
        instagram: "https://www.instagram.com/sangam.iitjammu",
        logo: "/literary.jpg",
        vision: "To nurture creativity and critical thinking through literature.",
        mission: ["Encourage writing and debates", "Promote reading culture", "Organize literary events"],
        pic: { name: "Dr. Malvika Sharma" },
        coordinators: [
          { name: "Akshita Saxena", email: "2025uep0170@iitjammu.ac.in", photo: "/images-2026-27-v1/Akshita Saxena.jpg" },
          { name: "Amandeep", email: "2025uep0165@iitjammu.ac.in", photo: "/images-2026-27-v1/Amandeep.jpg" },
        ],
        associates: [{ name: "Sh. Vikrant Guleria" }],
      },
      {
        name: "Dance Club",
        instagram: "https://www.instagram.com/beat_street.iitjmu",
        logo: "/dance.jpg",
        vision: "To express emotions and culture through dance.",
        mission: ["Promote diverse dance forms", "Organize performances", "Encourage discipline and teamwork"],
        pic: { name: "Dr. Gaurav Bhaduri" },
        coordinators: [
          { name: "Mokshika Yadav", email: "2025uee0149@iitjammu.ac.in", photo: "/images-2026-27-v1/Mokshika Yadav.jpg" },
          { name: "Aditya Singh", email: "2025umt0199@iitjammu.ac.in" },
        ],
        associates: [{ name: "Sh. Bhupinder Singh" }],
      },
      {
        name: "Drama Club",
        instagram: "https://www.instagram.com/the_dramatizers_iitjammu",
        logo: "/drama.jpg",
        vision: "To bring stories to life through theatre and performance.",
        mission: ["Promote theatrical arts", "Organize stage performances", "Encourage creative storytelling"],
        pic: { name: "Dr. Parveen Kumar" },
        coordinators: [
          { name: "Kshitij Trivedi", email: "2025uep0168@iitjammu.ac.in", photo: "/images-2026-27-v1/Kshitij Trivedi.jpg" },
          { name: "Navya Gupta", email: "2025uch0012@iitjammu.ac.in", role: "Co-Coordinator" },
        ],
        associates: [{ name: "Sh. Sunil Shetty", email: "sunil.shetty@iitjammu.ac.in", photo: "/images-2026-27-v1/Dr. Sunil Shetty.jpg" }],
      },
      {
        name: "Music Club",
        instagram: "https://www.instagram.com/malang_iitjammu",
        logo: "/music.jpg",
        vision: "To inspire harmony and creativity through music.",
        mission: ["Promote musical talent", "Conduct jam sessions", "Organize concerts and competitions"],
        pic: { name: "Dr. Ankur Bansal", email: "ankur.bansal@iitjammu.ac.in", profileUrl: "https://www.iitjammu.ac.in/faculty/~ankurbansal", photo: "/images-2026-27-v1/Ankur Bansal.jpg" },
        coordinators: [{ name: "Prakhar Goyal", email: "2025uch0001@iitjammu.ac.in", photo: "/images-2026-27-v1/Prakhar Goyal.jpg" }],
        associates: [{ name: "Sh. Sumit Saini", email: "sumit.saini@iitjammu.ac.in", photo: "/images-2026-27-v1/Dr. Sumit Saini.jpg" }],
      },
      {
        name: "Fine Arts Club",
        instagram: "https://www.instagram.com/artihc.iitjammu",
        logo: "/artihc.jpg",
        vision: "To foster creativity through visual and fine arts.",
        mission: ["Encourage artistic expression", "Organize art workshops", "Promote exhibitions"],
        pic: { name: "Dr. Hardeep Singh" },
        coordinators: [{ name: "Anshu", email: "2025ucs0093@iitjammu.ac.in" }],
        associates: [{ name: "Ms. Nandini Sharma", email: "nandini.sharma@iitjammu.ac.in", photo: "/images-2026-27-v1/NANDINI SHARMA.jpg" }],
      },
      {
        name: "Anime Club",
        instagram: "https://www.instagram.com/anisoul_iitjmu",
        logo: "/anime.jpg",
        vision: "To celebrate anime culture and storytelling.",
        mission: ["Promote anime discussions", "Organize screenings", "Build a creative community"],
        pic: { name: "Dr. Kancharla Hari Krishna" },
        coordinators: [{ name: "Harshul Patel", email: "2025uch0030@iitjammu.ac.in", photo: "/images-2026-27-v1/Harshul Patel.jpg" }],
        associates: [{ name: "Sh. Mandeep Singh" }],
      },
      {
        name: "Cooking Club",
        instagram: "https://www.instagram.com/cookingclub.iitjammu",
        logo: "/cooking.jpg",
        vision: "To explore culinary creativity and culture.",
        mission: ["Promote cooking skills", "Explore global cuisines", "Encourage healthy cooking"],
        pic: { name: "Dr. Ravi Kumar Arun" },
        coordinators: [{ name: "Aryan Krishna", email: "2025umt0198@iitjammu.ac.in", photo: "/images-2026-27-v1/Aryan krishna.jpg" }],
        associates: [{ name: "Sh. Akhilesh Keshaw Singh", email: "akhilesh.singh@iitjammu.ac.in", photo: "/images-2026-27-v1/Akhilesh Keshaw Singh.jpg" }],
      },
      {
        name: "Sangam (Media) Club",
        // New for AY 2026-27 — no logo / vision / Instagram supplied yet.
        mission: [],
        pic: { name: "Dr. Ajay Gautam" },
        coordinators: [{ name: "Sangam (Media) Club_coordinator" }],
        associates: [{ name: "Communication Officer" }],
      },
    ],
  },

  {
    key: "sports",
    name: "Sports Council",
    slug: "sports-council",
    // The V1 Sports page const photo ("/sports secretary.jpeg") is dead — the page
    // actually renders this Cloudinary image, so migrate the displayed one.
    secretary: { name: "Shreysa", email: "2024uma0227@iitjammu.ac.in", titleOverride: "Sports Secretary" },
    representatives: [{ name: "Punit Kumar", email: "2025pph0023@iitjammu.ac.in", titleOverride: "PG Representative" }],
    associateDean: AD_SPORTS,
    // Only the Sports Council logo is available in the codebase (the Header emblem).
    // General / Academic / Cultural fall back to a branded initial until real logo URLs
    // are supplied (then add `logo: "..."` here + re-run db:import:org on a fresh DB).
    logo: "https://res.cloudinary.com/dabviijid/image/upload/v1774902105/Untitled_460_x_800_px_1_fglicp.png",
    // The V1 Sports page lists no Professors-in-Charge — clubs carry coordinators only.
    clubs: [
      {
        name: "Athletics Club",
        instagram: "https://www.instagram.com/athletics.iitjammu/?hl=en",
        logo: "/athletics.png",
        vision: "To develop elite athletes who excel in performance and represent IIT Jammu with distinction at Inter-IIT tournaments.",
        mission: ["Encourage participation in track and field events", "Develop endurance, speed, and discipline", "Prepare athletes for Inter-IIT and other competitions"],
        coordinators: [{ name: "Amit Kumar Saini", email: "2025uee0146@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" }],
      },
      {
        name: "Badminton Club",
        instagram: "https://www.instagram.com/badmintonclub_iitjammu/?hl=en",
        logo: "/badminton.jpg",
        vision: "To build a strong badminton culture aimed at achieving excellence at Inter-IIT tournaments.",
        mission: ["Organize regular training sessions", "Promote competitive and recreational play", "Prepare teams for Inter-IIT and inter-college tournaments"],
        coordinators: [
          { name: "Tanish Tyagi", email: "2025ucs0087@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" },
          { name: "Sachi", email: "2025uce0054@iitjammu.ac.in", titleOverride: "Coordinator (Girls)" },
        ],
      },
      {
        name: "Basketball Club",
        instagram: "https://www.instagram.com/basketball.iitjammu/?hl=en",
        logo: "/basketball.jpeg",
        vision: "To foster teamwork and competitive excellence with the goal of strong performances at Inter-IIT tournaments.",
        mission: ["Enhance technical and tactical skills", "Encourage teamwork and leadership", "Represent IIT Jammu in Inter-IIT and other leagues"],
        coordinators: [
          { name: "Yogesh Kumawat", email: "2025uce0063@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" },
          { name: "Keerthana Kundanapally", email: "2025ucs0110@iitjammu.ac.in", titleOverride: "Coordinator (Girls)" },
        ],
      },
      {
        name: "Cricket Club",
        instagram: "https://www.instagram.com/cricketiitjmu/",
        logo: "/cricket.jpeg",
        vision: "To nurture cricketing talent capable of competing at the highest level in Inter-IIT tournaments.",
        mission: ["Develop technical, tactical, and mental skills", "Encourage discipline and sportsmanship", "Compete in Inter-IIT and inter-institute competitions"],
        coordinators: [{ name: "Modalavalasa Jaswanth", email: "2025uch0028@iitjammu.ac.in" }],
      },
      {
        name: "Chess Club",
        instagram: "https://www.instagram.com/chess.iitjammu/",
        logo: "/chess.jpeg",
        vision: "To cultivate strategic thinkers who can achieve excellence at Inter-IIT chess tournaments.",
        mission: ["Promote chess culture across campus", "Organize training sessions and competitions", "Prepare players for Inter-IIT events"],
        coordinators: [
          { name: "Raunit Kumar Pal", email: "2025uep0173@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" },
          { name: "Arushi Sharma", email: "2025uma0233@iitjammu.ac.in", titleOverride: "Coordinator (Girls)" },
        ],
      },
      {
        name: "Football Club",
        instagram: "https://www.instagram.com/footballclub.iitjammu/?hl=en",
        logo: "/footballlogo.jpg",
        vision: "To build a competitive football team that performs with excellence at Inter-IIT tournaments.",
        mission: ["Develop physical fitness and tactical awareness", "Encourage teamwork and leadership", "Represent IIT Jammu in Inter-IIT and other competitions"],
        coordinators: [{ name: "Anand Patel", email: "2025uma0240@iitjammu.ac.in" }],
      },
      {
        name: "E-Sports Club",
        instagram: "https://www.instagram.com/esports.iitjammu/",
        logo: "/e sports.jpg",
        vision: "To establish a competitive e-sports ecosystem aimed at success in Inter-IIT e-sports tournaments.",
        mission: ["Organize competitive gaming sessions", "Encourage strategic and team-based play", "Prepare teams for Inter-IIT e-sports competitions"],
        coordinators: [{ name: "Md. Anas Karim", email: "2025uee0142@iitjammu.ac.in" }],
      },
      {
        name: "Table Tennis Club",
        instagram: "https://www.instagram.com/tabletennis_iitjmu/",
        logo: "/table tennis.jpg",
        vision: "To promote excellence in table tennis with a focus on strong Inter-IIT performances.",
        mission: ["Conduct structured training sessions", "Encourage competitive participation", "Prepare players for Inter-IIT tournaments"],
        coordinators: [
          { name: "Yash Gupta", email: "2025uce0045@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" },
          { name: "Tamanna Reddy", email: "2025ume0269@iitjammu.ac.in", titleOverride: "Coordinator (Girls)" },
        ],
      },
      {
        name: "Volleyball Club",
        instagram: "https://www.instagram.com/volleyball.iitjammu/",
        logo: "/volleyball.jpg",
        vision: "To build a cohesive and competitive volleyball team capable of excelling at Inter-IIT tournaments.",
        mission: ["Develop coordination, stamina, and teamwork", "Organize regular practice matches", "Compete in Inter-IIT and other tournaments"],
        coordinators: [
          { name: "Shwet Baliyan", email: "2025uch0018@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" },
          { name: "Pari Khanna", email: "2025ume0270@iitjammu.ac.in", titleOverride: "Coordinator (Girls)" },
        ],
      },
      {
        name: "Weightlifting Club",
        instagram: "https://www.instagram.com/weightlifting_iitjammu",
        logo: "/weightlifting.jpg",
        vision: "To develop strength athletes who represent IIT Jammu with excellence at Inter-IIT competitions.",
        mission: ["Promote safe and disciplined strength training", "Encourage physical fitness and performance", "Prepare lifters for Inter-IIT and national events"],
        coordinators: [{ name: "Weightlifting Club_coordinator" }],
      },
      {
        name: "Indoor Sports Club",
        instagram: "https://www.instagram.com/indoorsports.iitjammu",
        logo: "/indoor.jpg",
        vision: "To nurture talent in indoor sports with the aim of strong participation in Inter-IIT tournaments.",
        mission: ["Promote indoor games and recreational sports", "Encourage skill development and competition", "Prepare participants for Inter-IIT indoor sports events"],
        coordinators: [{ name: "Tanwar", email: "2025uep0182@iitjammu.ac.in" }],
      },
      {
        name: "Hockey Club",
        // New for AY 2026-27 — no logo / vision / Instagram supplied yet.
        mission: [],
        coordinators: [{ name: "Sidhdarth Chaurasiya", email: "2025ume0279@iitjammu.ac.in" }],
      },
      {
        name: "Squash Club",
        // New for AY 2026-27 — no logo / vision / Instagram supplied yet.
        mission: [],
        coordinators: [{ name: "Prateek Tewatia", email: "2025uep0164@iitjammu.ac.in", titleOverride: "Coordinator (Boys)" }],
      },
    ],
  },

  {
    key: "technical",
    name: "Technical Council",
    slug: "technical-council",
    // Shares the Academic Council's Associate Dean / logo, but has its OWN secretary and
    // clubs: the 2026-27 sheet gives Hriday Rana as Technical Secretary
    // (technical.secretary@iitjammu.ac.in) over Coding, SAE, Robo-Sapiens, Astriaza and
    // FinTech, so those five clubs live HERE and no longer under the Academic Council.
    // On an already-imported database the units still hang off the Academic Council —
    // scripts/sync-roster.mjs reparents them (as does the admin Organization module's
    // per-club "Move to council" control).
    secretary: { name: "Hriday Rana", email: "2024ume0241@iitjammu.ac.in", titleOverride: "Technical Secretary", photo: "/images-2026-27-v1/Hriday Rana.jpg" },
    associateDean: AD_STUDENT_AFFAIRS,
    logo: "/Academic.png",
    clubs: [
      {
        name: "Coding Club",
        instagram: "https://www.instagram.com/codeclub.iitjmu",
        logo: "/coding.jpg",
        vision: "To foster a strong culture of coding, problem-solving, and software development.",
        mission: ["Promote competitive programming", "Encourage open-source contributions", "Conduct workshops and hackathons", "Prepare students for technical careers"],
        pic: { name: "Dr. Mrinmoy Bhattacharjee", email: "mrinmoy.bhattacharjee@iitjammu.ac.in", profileUrl: "https://iitjammu.ac.in/faculty/~mrinmoybhattacharjee", photo: "/images-2026-27-v1/Mrinmoy Bhattacharjee.jpg" },
        coordinators: [
          { name: "Gursimran Singh Thukral", email: "2025uce0044@iitjammu.ac.in", photo: "/images-2026-27-v1/Gursimran Singh Thukral.jpg" },
          { name: "Raghav Pal", email: "2025uee0123@iitjammu.ac.in" },
        ],
        associates: [{ name: "Sh. Nitish Gupta" }],
      },
      {
        name: "SAE Club",
        instagram: "https://www.instagram.com/sae_iitjmu",
        logo: "/sae.jpg",
        vision: "To nurture innovation and hands-on engineering in automotive technologies.",
        mission: ["Design and build vehicles", "Participate in competitions", "Encourage teamwork and leadership"],
        pic: { name: "Dr. Ashutosh Bijalwan" },
        coordinators: [
          { name: "Divyansh Tripathi", email: "2025uch0003@iitjammu.ac.in" },
          { name: "Suryansh Jadhav", email: "2025ume0258@iitjammu.ac.in", photo: "/images-2026-27-v1/Suryansh Jadhav.jpg" },
        ],
        associates: [{ name: "Sh. Neeraj Kumar" }],
      },
      {
        name: "Robo-sapiens Club",
        instagram: "https://www.instagram.com/robosapiens_iitjammu",
        logo: "/robotics.jpg",
        vision: "To inspire excellence in robotics and automation.",
        mission: ["Develop autonomous systems", "Organize robotics workshops", "Promote innovation"],
        pic: { name: "Dr. Ankit Dubey" },
        coordinators: [
          { name: "Chiranjeev Sharma", email: "2025ume0257@iitjammu.ac.in", photo: "/images-2026-27-v1/Chiranjeev Sharma.jpg" },
          { name: "Rudra Chauhan", email: "2025uee0126@iitjammu.ac.in", photo: "/images-2026-27-v1/Rudra Chauhan.jpg" },
        ],
        associates: [{ name: "Sh. Vikash Kumar" }],
      },
      {
        name: "Astriaza Club",
        instagram: "https://www.instagram.com/astriaza_iitjmu",
        logo: "/astronomy.jpg",
        vision: "To ignite curiosity in astronomy and space sciences.",
        mission: ["Conduct stargazing sessions", "Promote astrophysics discussions", "Spread scientific awareness"],
        pic: { name: "Dr. S. R. K. Chaitanya Indukuri" },
        coordinators: [{ name: "Pranav Prabhat", email: "2025uma0234@iitjammu.ac.in", photo: "/images-2026-27-v1/Pranav Prabhat.jpg" }],
        associates: [{ name: "Sh. Rahul Agarwal" }],
      },
      {
        name: "FinTech Club",
        instagram: "https://www.instagram.com/fintech.iitjmu",
        logo: "/fintech.jpg",
        vision: "To bridge finance and technology for real-world impact.",
        mission: ["Teach fintech tools", "Encourage research", "Host finance-related events"],
        pic: { name: "Dr. Arun Kumar Verma" },
        coordinators: [{ name: "ATM Ashwath Krishna", email: "2025uch0007@iitjammu.ac.in" }],
        associates: [{ name: "Sh. Arun Kumar" }],
      },
    ],
  },
];

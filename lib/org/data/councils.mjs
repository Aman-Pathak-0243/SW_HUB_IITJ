// V1 hardcoded COUNCILS + CLUBS dataset (DATA_MIGRATION_REPORT §7), extracted
// verbatim from the four near-identical V1 Clubs pages
// (app/Clubs/{General,Academic,Cultural,Sports}/page.jsx) so the importer
// (lib/org/import.mjs) can stand them up as org_units + bound profile content +
// appointments for the current year. This is plain DATA — no DB, no logic.
//
// Each council → one org_unit (type 'council') + a 'council_secretary'
// appointment. Each club → one org_unit (type 'club', parent = its council) +
// a 'club_profile' content_item (vision + mission list + instagram + logo) +
// 'pic' / 'coordinator' / 'co_coordinator' appointments. Sports clubs had no
// PIC in V1, so `pic` is omitted there.
//
// People are deduped by name across the whole import (lib/org/normalize.mjs#personKey);
// the same Dr./student appears once in `person` and gains multiple appointments.

// The institute Associate Deans (verbatim from app/Team/page.jsx), mapped to councils
// by DOMAIN: Sports Council → AD (Sports); the other councils fall under the overarching
// AD (Student Affairs). (The Team page also lists AD-Hostel + AD-Mess, applied to the
// hostels/messes datasets.) Person dedup makes each AD one directory row.
const AD_STUDENT_AFFAIRS = { name: "Dr. Devi Lal", title: "Associate Dean (Student Affairs)", profileUrl: "https://iitjammu.ac.in/materials-engineering/faculty-list/~devilal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641537/WhatsApp_Image_2026-01-17_at_14.12.59_ap6x4e.jpg" };
const AD_SPORTS = { name: "Dr. Shiva S", title: "Associate Dean (Sports)", profileUrl: "https://iitjammu.ac.in/faculty/~shivas", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1772463418/ad_sports_m7hktw.jpg" };

export const COUNCILS = [
  {
    key: "general",
    name: "General Affairs Council",
    slug: "general-affairs-council",
    secretary: { name: "Ayush Sharma", titleOverride: "General Secretary", photo: "/general secretary.jpeg" },
    associateDean: AD_STUDENT_AFFAIRS,
    logo: "https://res.cloudinary.com/dabviijid/image/upload/v1773993041/WhatsApp_Image_2026-03-11_at_11.24.42_AM-removebg-preview_tddjlb.png",
    clubs: [
      {
        name: "Nature and Adventure Club",
        instagram: "https://www.instagram.com/nac_iitjmu",
        logo: "/NAC test.png",
        vision: "To promote environmental awareness and adventurous spirit among students.",
        mission: ["Organize treks", "Promote eco-friendly practices", "Encourage exploration"],
        pic: { name: "Dr. Shafkat Shafi Dar", profileUrl: "https://iitjammu.ac.in/faculty/~shafkatshafidar", photo: "/PIC nac.jpg" },
        coordinators: [
          { name: "Yash Agarwal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774956278/Screenshot_2026-03-31_165358_zhrrkw.png" },
          { name: "Radhika Verma", role: "Co-Coordinator", photo: "/nac co-coordinator.jpeg" },
        ],
      },
      {
        name: "Kritash Club",
        instagram: "https://www.instagram.com/kritash_iitjammu",
        logo: "/kritash.jpg",
        vision: "To encourage creativity and innovation.",
        mission: ["Promote community service", "Organize drives", "Encourage leadership"],
        pic: { name: "Dr. Sanchita Srivastava", profileUrl: "https://iitjammu.ac.in/faculty/~sanchitasrivastava", photo: "/PIC kritash.jpg" },
        coordinators: [
          { name: "Aditya Pratap Singh", photo: "/kritash coordinator-1.jpg" },
          { name: "Arshpreet Kaur", photo: "/kritash coordinator-2.jpg" },
        ],
      },
      {
        name: "RE4M Club",
        instagram: "https://www.instagram.com/re4m_iitjammu",
        logo: "/RE4M.jpg",
        vision: "To drive sustainable practices.",
        mission: ["Promote recycling", "Conduct workshops", "Encourage green initiatives"],
        pic: { name: "Dr. Chandan Yadav", profileUrl: "https://www.iitjammu.ac.in/faculty/~chandanyadav", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774956477/1704698341656_zf3tb5.jpg" },
        coordinators: [{ name: "Harsh kumar", photo: "/re4m coordinator.jpg" }],
      },
      {
        name: "Mesh Club",
        instagram: "https://www.instagram.com/mesh.iitjammu",
        logo: "/mesh.jpg",
        vision: "To inspire learning and innovation.",
        mission: ["Organize talks", "Encourage interdisciplinary learning"],
        pic: { name: "Dr. Mithu Baidya", profileUrl: "https://www.iitjammu.ac.in/bsbe/faculty.html?faculty=~mithubaidya", photo: "/PIC mesh.jpeg" },
        coordinators: [{ name: "Yaduraj Bhakar", photo: "/mesh coordinator.jpg" }],
      },
      {
        name: "Ek Bharat Shreshtha Bharat",
        instagram: "https://www.instagram.com/ebsb.iitjammu",
        logo: "/ebsb.jpg",
        vision: "To promote unity in diversity.",
        mission: ["Cultural programs", "Celebrate diversity"],
        pic: { name: "Dr. Srishilan C", profileUrl: "https://www.iitjammu.ac.in/faculty/~srishilanc", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774956399/images_yeiytj.jpg" },
        coordinators: [{ name: "Machavolu Venkata Siva Sai Subrahman", photo: "/ebsb coordinator.jpeg" }],
      },
      {
        name: "Wellbeing Club",
        instagram: "https://www.instagram.com/wellbeing.iitjammu",
        logo: "/wellbeing.jpg",
        vision: "To foster mental and physical wellbeing.",
        mission: ["Conduct workshops", "Promote awareness"],
        pic: { name: "Dr. Kishore Kumar Jagini", profileUrl: "https://www.iitjammu.ac.in/hss/faculty.html?faculty=~kishorekumarjagini", photo: "/PIC wellbeing.jpeg" },
        coordinators: [{ name: "Palak Aggarwal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941908/wellbeing_coordinator_yuazrx.jpg" }],
      },
    ],
  },

  {
    key: "academic",
    name: "Academic Council",
    slug: "academic-council",
    // V2 change: the Academic Council's student lead is titled "Technical
    // Secretary" (was "Academic Secretary" in V1).
    secretary: { name: "Aman Pathak", titleOverride: "Technical Secretary", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641536/WhatsApp_Image_2026-01-17_at_14.12.59_2_jcbwsp.jpg" },
    associateDean: AD_STUDENT_AFFAIRS,
    logo: "/Academic.png",
    clubs: [
      {
        name: "Coding Club",
        instagram: "https://www.instagram.com/codeclub.iitjmu",
        logo: "/coding.jpg",
        vision: "To foster a strong culture of coding, problem-solving, and software development.",
        mission: ["Promote competitive programming", "Encourage open-source contributions", "Conduct workshops and hackathons", "Prepare students for technical careers"],
        pic: { name: "Dr. Sumit Kumar Pandey", profileUrl: "https://iitjammu.ac.in/computer_science_engineering/faculty-list/~sumitkpandey", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941883/PIC_coding_xylort.jpg" },
        coordinators: [{ name: "Soham Kakkar", photo: "/coding coordinator.jpg" }],
      },
      {
        name: "SAE Club",
        instagram: "https://www.instagram.com/sae_iitjmu",
        logo: "/sae.jpg",
        vision: "To nurture innovation and hands-on engineering in automotive technologies.",
        mission: ["Design and build vehicles", "Participate in competitions", "Encourage teamwork and leadership"],
        pic: { name: "Dr. Arvind Kumar Rajput", profileUrl: "https://iitjammu.ac.in/faculty/~arvindkrajput", photo: "/PIC sae.jpeg" },
        coordinators: [{ name: "Rudransh Joshi", role: "Coordinator", photo: "/sae co-coordinator.jpg" }],
      },
      {
        name: "Robo-sapiens Club",
        instagram: "https://www.instagram.com/robosapiens_iitjammu",
        logo: "/robotics.jpg",
        vision: "To inspire excellence in robotics and automation.",
        mission: ["Develop autonomous systems", "Organize robotics workshops", "Promote innovation"],
        pic: { name: "Dr. Nalin Kumar Sharma", profileUrl: "https://www.iitjammu.ac.in/ee/faculty.html?faculty=~nalinkumarsharma", photo: "/PIC robotics.jpg" },
        coordinators: [{ name: "Hriday Rana", photo: "/robotics coordinator.jpg" }],
      },
      {
        name: "Astriaza Club",
        instagram: "https://www.instagram.com/astriaza_iitjmu",
        logo: "/astronomy.jpg",
        vision: "To ignite curiosity in astronomy and space sciences.",
        mission: ["Conduct stargazing sessions", "Promote astrophysics discussions", "Spread scientific awareness"],
        pic: { name: "Dr. Soumyadip Das", profileUrl: "https://iitjammu.ac.in/faculty/~soumyadipdas", photo: "/PIC astriaza.jpg" },
        coordinators: [{ name: "Vaibhav Mittal", photo: "/astriaza coordinator.jpg" }],
      },
      {
        name: "FinTech Club",
        instagram: "https://www.instagram.com/fintech.iitjmu",
        logo: "/fintech.jpg",
        vision: "To bridge finance and technology for real-world impact.",
        mission: ["Teach fintech tools", "Encourage research", "Host finance-related events"],
        pic: { name: "Dr. Vijay Kumar Pal", profileUrl: "https://iitjammu.ac.in/mechanical_engineering/faculty.html?faculty=~vijaykumarpal", photo: "/PIC fintech.jpeg" },
        coordinators: [{ name: "Khushi", photo: "/fintech coordinator.png" }],
      },
    ],
  },

  {
    key: "cultural",
    name: "Cultural Council",
    slug: "cultural-council",
    secretary: { name: "Saumya Gupta", titleOverride: "Cultural Secretary", photo: "/cultural secretary.jpeg" },
    associateDean: AD_STUDENT_AFFAIRS,
    clubs: [
      {
        name: "Photography Club",
        instagram: "https://www.instagram.com/chitraka_iitjammu",
        logo: "/photography.jpg",
        vision: "To capture stories, emotions, and perspectives through the art of photography.",
        mission: ["Promote visual storytelling", "Conduct photography workshops", "Encourage creative expression"],
        pic: { name: "Dr. Sarada Prasad Gochhayat", profileUrl: "https://www.iitjammu.ac.in/computer_science_engineering/faculty-list/~saradaprasadgochhayat", photo: "/PIC photography.jpeg" },
        coordinators: [{ name: "Manish Kumar", photo: "/photography coordinator.jpeg" }],
      },
      {
        name: "Literary Club",
        instagram: "https://www.instagram.com/sangam.iitjammu",
        logo: "/literary.jpg",
        vision: "To nurture creativity and critical thinking through literature.",
        mission: ["Encourage writing and debates", "Promote reading culture", "Organize literary events"],
        pic: { name: "Dr. Ambika Prasad Shah", profileUrl: "https://iitjammu.ac.in/faculty/~ambikaprasadshah", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941886/PIC_literary_uuruj9.jpg" },
        coordinators: [{ name: "Sparsh Dubey", photo: "/literary coordinator.jpg" }],
      },
      {
        name: "Dance Club",
        instagram: "https://www.instagram.com/beat_street.iitjmu",
        logo: "/dance.jpg",
        vision: "To express emotions and culture through dance.",
        mission: ["Promote diverse dance forms", "Organize performances", "Encourage discipline and teamwork"],
        pic: { name: "Dr. Suman Sarkar", profileUrl: "https://iitjammu.ac.in/faculty/~sumansarkar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774335119/1636437542323_kzndvd.jpg" },
        coordinators: [{ name: "Akshat Rai", photo: "/dance coordinator.png" }],
      },
      {
        name: "Drama Club",
        instagram: "https://www.instagram.com/the_dramatizers_iitjammu",
        logo: "/drama.jpg",
        vision: "To bring stories to life through theatre and performance.",
        mission: ["Promote theatrical arts", "Organize stage performances", "Encourage creative storytelling"],
        pic: { name: "Dr. Suman Sarkar", profileUrl: "https://iitjammu.ac.in/faculty/~sumansarkar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774335119/1636437542323_kzndvd.jpg" },
        coordinators: [{ name: "Anmol Ratan Srivastav", photo: "/drama coordinator.jpeg" }],
      },
      {
        name: "Music Club",
        instagram: "https://www.instagram.com/malang_iitjammu",
        logo: "/music.jpg",
        vision: "To inspire harmony and creativity through music.",
        mission: ["Promote musical talent", "Conduct jam sessions", "Organize concerts and competitions"],
        pic: { name: "Dr. Suman Sarkar", profileUrl: "https://iitjammu.ac.in/faculty/~sumansarkar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774335119/1636437542323_kzndvd.jpg" },
        coordinators: [{ name: "Nishchay Singh", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941876/music_coordinator_zllcve.jpg" }],
      },
      {
        name: "Fine Arts Club",
        instagram: "https://www.instagram.com/artihc.iitjammu",
        logo: "/artihc.jpg",
        vision: "To foster creativity through visual and fine arts.",
        mission: ["Encourage artistic expression", "Organize art workshops", "Promote exhibitions"],
        pic: { name: "Dr. Chembolu Vinay", profileUrl: "https://iitjammu.ac.in/civil_engineering/faculty-list/~chemboluvinay", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641536/WhatsApp_Image_2026-01-17_at_14.12.59_3_eufqfz.jpg" },
        coordinators: [{ name: "Hriday Jain", photo: "/fine arts coordinator.jpeg" }],
      },
      {
        name: "Anime Club",
        instagram: "https://www.instagram.com/anisoul_iitjmu",
        logo: "/anime.jpg",
        vision: "To celebrate anime culture and storytelling.",
        mission: ["Promote anime discussions", "Organize screenings", "Build a creative community"],
        pic: { name: "Dr. Sunil Kumar Kashyap", profileUrl: "https://iitjammu.ac.in/materials-engineering/faculty-list/~sunilkumarkashyap", photo: "/PIC anime.png" },
        coordinators: [{ name: "Keshav Kundan Kumar", photo: "/anime coordinator.jpeg" }],
      },
      {
        name: "Cooking Club",
        instagram: "https://www.instagram.com/cookingclub.iitjammu",
        logo: "/cooking.jpg",
        vision: "To explore culinary creativity and culture.",
        mission: ["Promote cooking skills", "Explore global cuisines", "Encourage healthy cooking"],
        pic: { name: "Dr. Arvind Kumar", profileUrl: "https://iitjammu.ac.in/mathematics/faculty-list/~arvindkumar", photo: "/PIC cooking.jpg" },
        coordinators: [{ name: "Uday Prakash Makija", photo: "/cooking coordinator.jpg" }],
      },
    ],
  },

  {
    key: "sports",
    name: "Sports Council",
    slug: "sports-council",
    // The V1 Sports page const photo ("/sports secretary.jpeg") is dead — the page
    // actually renders this Cloudinary image, so migrate the displayed one.
    secretary: { name: "Sandeep Moond", titleOverride: "Sports Secretary", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941898/sports_secretary_iqeyth.png" },
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
        coordinators: [{ name: "Sumit", photo: "/athletics coordinator.jpg" }],
      },
      {
        name: "Badminton Club",
        instagram: "https://www.instagram.com/badmintonclub_iitjammu/?hl=en",
        logo: "/badminton.jpg",
        vision: "To build a strong badminton culture aimed at achieving excellence at Inter-IIT tournaments.",
        mission: ["Organize regular training sessions", "Promote competitive and recreational play", "Prepare teams for Inter-IIT and inter-college tournaments"],
        coordinators: [
          { name: "Shivam Yadav", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774692880/47fee13c-b587-4a55-b175-a8625d2becb2_ppgipo.jpg" },
          { name: "Sneha Hansrajani", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774692882/photo_2_tfxrdg.jpg" },
        ],
      },
      {
        name: "Basketball Club",
        instagram: "https://www.instagram.com/basketball.iitjammu/?hl=en",
        logo: "/basketball.jpeg",
        vision: "To foster teamwork and competitive excellence with the goal of strong performances at Inter-IIT tournaments.",
        mission: ["Enhance technical and tactical skills", "Encourage teamwork and leadership", "Represent IIT Jammu in Inter-IIT and other leagues"],
        coordinators: [
          { name: "Rattanveer Singh", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552413/IMG_4317_zz9oiv.heic" },
          { name: "Anushka", photo: "/basketball coordinator girls.jpg" },
        ],
      },
      {
        name: "Cricket Club",
        instagram: "https://www.instagram.com/cricketiitjmu/",
        logo: "/cricket.jpeg",
        vision: "To nurture cricketing talent capable of competing at the highest level in Inter-IIT tournaments.",
        mission: ["Develop technical, tactical, and mental skills", "Encourage discipline and sportsmanship", "Compete in Inter-IIT and inter-institute competitions"],
        coordinators: [{ name: "Aditya Kumar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552412/Screenshot_20250902-214947_-_Aditya_pamnfg.jpg" }],
      },
      {
        name: "Chess Club",
        instagram: "https://www.instagram.com/chess.iitjammu/",
        logo: "/chess.jpeg",
        vision: "To cultivate strategic thinkers who can achieve excellence at Inter-IIT chess tournaments.",
        mission: ["Promote chess culture across campus", "Organize training sessions and competitions", "Prepare players for Inter-IIT events"],
        coordinators: [
          { name: "Harshit", photo: "/chess coordinator boys.jpg" },
          { name: "Priyanshi", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552417/1000075795_fkyhzu.jpg" },
        ],
      },
      {
        name: "Football Club",
        instagram: "https://www.instagram.com/footballclub.iitjammu/?hl=en",
        logo: "/footballlogo.jpg",
        vision: "To build a competitive football team that performs with excellence at Inter-IIT tournaments.",
        mission: ["Develop physical fitness and tactical awareness", "Encourage teamwork and leadership", "Represent IIT Jammu in Inter-IIT and other competitions"],
        coordinators: [{ name: "Hemant Raina", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552414/1762711246066_ncm2t0.png" }],
      },
      {
        name: "E-Sports Club",
        instagram: "https://www.instagram.com/esports.iitjammu/",
        logo: "/e sports.jpg",
        vision: "To establish a competitive e-sports ecosystem aimed at success in Inter-IIT e-sports tournaments.",
        mission: ["Organize competitive gaming sessions", "Encourage strategic and team-based play", "Prepare teams for Inter-IIT e-sports competitions"],
        coordinators: [{ name: "Ritik Singh", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552412/2cfc5302-14df-4534-aa76-838c2ac938a3_h5e1dl.jpg" }],
      },
      {
        name: "Table Tennis Club",
        instagram: "https://www.instagram.com/tabletennis_iitjmu/",
        logo: "/table tennis.jpg",
        vision: "To promote excellence in table tennis with a focus on strong Inter-IIT performances.",
        mission: ["Conduct structured training sessions", "Encourage competitive participation", "Prepare players for Inter-IIT tournaments"],
        coordinators: [{ name: "Shreysa", photo: "/tt coordinator.jpg" }],
      },
      {
        name: "Volleyball Club",
        instagram: "https://www.instagram.com/volleyball.iitjammu/",
        logo: "/volleyball.jpg",
        vision: "To build a cohesive and competitive volleyball team capable of excelling at Inter-IIT tournaments.",
        mission: ["Develop coordination, stamina, and teamwork", "Organize regular practice matches", "Compete in Inter-IIT and other tournaments"],
        coordinators: [
          { name: "Ashutosh Kunzru", photo: "/volleyball coordinator boys.jpg" },
          { name: "Garima Choudhary", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552788/IMG-20241013-WA0008_vg2pgu.jpg" },
        ],
      },
      {
        name: "Weightlifting Club",
        instagram: "https://www.instagram.com/weightlifting_iitjammu",
        logo: "/weightlifting.jpg",
        vision: "To develop strength athletes who represent IIT Jammu with excellence at Inter-IIT competitions.",
        mission: ["Promote safe and disciplined strength training", "Encourage physical fitness and performance", "Prepare lifters for Inter-IIT and national events"],
        coordinators: [{ name: "Kishan Arya", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552411/IMG-20260223-WA0005_chycak.jpg" }],
      },
      {
        name: "Indoor Sports Club",
        instagram: "https://www.instagram.com/indoorsports.iitjammu",
        logo: "/indoor.jpg",
        vision: "To nurture talent in indoor sports with the aim of strong participation in Inter-IIT tournaments.",
        mission: ["Promote indoor games and recreational sports", "Encourage skill development and competition", "Prepare participants for Inter-IIT indoor sports events"],
        coordinators: [{ name: "Divyansh Choudhary", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774552414/IMG_20260324_153102_pz3yet.jpg" }],
      },
    ],
  },

  {
    key: "technical",
    name: "Technical Council",
    slug: "technical-council",
    // A COPY of the Academic Council as a starting point (same Secretary / Associate
    // Dean / logo). An admin curates it later — e.g. MOVE the technical clubs (Coding,
    // SAE, Robotics, …) here from the Academic Council via the admin Organization
    // module's per-club "Move to council" control. Clubs start empty by design so the
    // same club is never duplicated across two councils.
    secretary: { name: "Aman Pathak", titleOverride: "Technical Secretary", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641536/WhatsApp_Image_2026-01-17_at_14.12.59_2_jcbwsp.jpg" },
    associateDean: AD_STUDENT_AFFAIRS,
    logo: "/Academic.png",
    clubs: [],
  },
];

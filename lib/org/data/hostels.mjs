// V1 hardcoded HOSTELS dataset (DATA_MIGRATION_REPORT §7), extracted verbatim
// from app/hostels/page.jsx. Each hostel → one org_unit (type 'hostel') + a
// 'hostel_profile' content_item (building image + office contact) + warden /
// wellness_warden / hostel_secretary / caretaker / attendant appointments.
//
// V1 "emails" on these people are shared role mailboxes (warden.egret@ is reused
// by two different wardens; hsec.boys@ by one secretary across four hostels), so
// they are NOT migrated onto person.email (which is UNIQUE) — see DL-034. The
// warden's mailbox is kept as the hostel's office_email (no uniqueness needed).
//
// `roles` is an ordered list so the importer can map each to a position key and
// preserve display order. `extraCaretaker` in V1 is just a second caretaker.

export const HOSTELS = [
  {
    name: "Anz Hostel (Boys)",
    slug: "anz-hostel",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1782053498/Screenshot_2026-06-21_201701_uxe8ek.png",
    officeEmail: "warden.egret@iitjammu.ac.in",
    roles: [
      { position: "warden", name: "Dr. Guru Brahmam Ramani", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1782053652/1707973890935_gjqpa7.jpg" },
      { position: "hostel_secretary", name: "Mehul Gupta", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg" },
      { position: "caretaker", name: "Mr. Ankush Kumar", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1782053795/DR_Ankush_m3qpsx.jpg" },
    ],
  },
  {
    name: "Fulgar Hostel (Boys)",
    slug: "fulgar-hostel",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774091910/IMG_4600_ywthft.jpg",
    officeEmail: "warden.fulgar@iitjammu.ac.in",
    roles: [
      { position: "warden", name: "Krishna Mohan Gupta", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709289/krishna_gmox4k.jpg" },
      { position: "hostel_secretary", name: "Mehul Gupta", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg" },
      // Canonical name (V1 wrote "Mr. Sumit Raj Ghosh" on Braeg) so this is the SAME
      // person as the Fulgar wellness warden — one directory row, one appointment each.
      { position: "wellness_warden", name: "Sumit Raj Ghosh", phone: "+91 9709111227", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709345/sumit_kikdod.jpg" },
      { position: "caretaker", name: "Majid Bashir", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709377/majid_jvbkdo.jpg" },
      { position: "caretaker", name: "Tabrez", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774933803/WhatsApp_Image_2026-03-30_at_16.44.01_vboecb.jpg" },
    ],
  },
  {
    name: "Egret Hostel (Girls)",
    slug: "egret-hostel",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774092815/IMG-20260320-WA0004.jpg_mg1dal.jpg",
    officeEmail: "warden.egret@iitjammu.ac.in",
    roles: [
      { position: "warden", name: "Dr. Riya Bhowmik", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709311/warden_egret_kbovjx.jpg" },
      { position: "hostel_secretary", name: "Mishthi Agarwal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_girls_vqu4zr.jpg" },
      { position: "caretaker", name: "Ms. Pooja Devi", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774933802/WhatsApp_Image_2026-03-30_at_16.44.01_1_rvolqn.jpg" },
    ],
  },
  {
    name: "Braeg Hostel (Boys)",
    slug: "braeg-hostel",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774091838/WhatsApp_Image_2026-03-21_at_16.46.37_wthdth.jpg",
    officeEmail: "warden.braeg@iitjammu.ac.in",
    roles: [
      { position: "warden", name: "Dr. Ved Prakash Ranjan", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747072/Ved_Prakash_jiuzku.png" },
      { position: "hostel_secretary", name: "Mehul Gupta", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg" },
      { position: "wellness_warden", name: "Sumit Raj Ghosh", phone: "+91 9709111227", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709345/sumit_kikdod.jpg" },
      { position: "caretaker", name: "Anish Koul", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709299/anish_jfjwap.jpg" },
      { position: "attendant", name: "Mr. Ajay Kumar", phone: "+91 9858145319", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709026/ajay_hx6u5j.png" },
    ],
  },
  {
    name: "Dedhar Hostel (Girls)",
    slug: "dedhar-hostel",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774186976/WhatsApp_Image_2026-03-22_at_18.22.29_m3vqyf.jpg",
    officeEmail: "warden.dedhar@iitjammu.ac.in",
    roles: [
      { position: "warden", name: "Dr. Garima Singh", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709322/warden_dedhar_f7n6dg.jpg" },
      { position: "hostel_secretary", name: "Mishthi Agarwal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_girls_vqu4zr.jpg" },
      { position: "caretaker", name: "Tasaduq Gul", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709332/caretaker_dedhar_nb0d5l.jpg" },
    ],
  },
  {
    name: "Canary Hostel (Boys)",
    slug: "canary-hostel",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774091914/IMG_5802_qenuqc.jpg",
    officeEmail: "warden.canary@iitjammu.ac.in",
    roles: [
      // Canonical name (V1 Canary hostel wrote "Akash Awale") so this is the SAME
      // person as the mess committee's "Mess Warden - Canary" — one directory row.
      { position: "warden", name: "Dr. Akash Subhash Awale", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709263/akash_a5ntu2.jpg" },
      { position: "hostel_secretary", name: "Mehul Gupta", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg" },
      { position: "caretaker", name: "Irfan Ahmad Teli", phone: "+91 6005257797", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709277/irfan_plq41j.jpg" },
    ],
  },
];

// The Associate Dean (Hostel Affairs) — ONE shared post across ALL hostels (the
// person + post don't change hostel to hostel). Verbatim from app/hostels/page.jsx
// (Dr. Yogesh Madhukarrao Nimdeo). Person dedup (DL-034) makes this one directory row
// with one appointment per hostel; the position is the seeded institute-level
// `associate_dean` (appliesToType=null → valid on a hostel unit).
export const HOSTEL_ASSOCIATE_DEAN = {
  position: "associate_dean",
  name: "Dr. Yogesh Madhukarrao Nimdeo",
  title: "Associate Dean (Hostel Affairs)",
  profileUrl: "https://iitjammu.ac.in/chemical-engineering/faculty.html?faculty=~yogeshmadhukarraonimdeo",
  photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1772463407/ad_hostel_lram8d.jpg",
};

// The hostel-affairs infrastructure PDF (one shared document across all hostels).
export const HOSTEL_INFRA_PDF = "https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Hostel_Infrastructure_Details_b5kbmv.pdf";

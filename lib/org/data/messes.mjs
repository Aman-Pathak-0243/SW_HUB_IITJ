// V1 hardcoded MESSES dataset (DATA_MIGRATION_REPORT §7), extracted verbatim
// from app/messes/page.jsx. Each mess → one org_unit (type 'mess') + a
// 'mess_profile' content_item (location + capacity + image + meal timings).
//
// MEAL TIMINGS are common to all messes in V1 (one shared banner), so the same
// normalized mealTimings list is attached to every mess profile.
//
// THE MESS COMMITTEE is a single campus-wide roster in V1 (not per-mess). The
// mess position definitions (mess_secretary, mess_committee_member) require a
// mess-type org_unit (appointment_type_guard), so the importer attaches the whole
// committee to the FIRST mess unit by sort order as the canonical committee
// roster, preserving each V1 title in title_override (DL-035). "Mess Secretary"
// maps to the singleton `mess_secretary`; everyone else to `mess_committee_member`.

export const MESS_MEAL_TIMINGS = [
  { label: "Breakfast", time: "7:20 AM – 9:20 AM" },
  { label: "Lunch", time: "12:20 PM – 2:20 PM" },
  { label: "Evening Snacks", time: "5:30 PM – 6:30 PM" },
  { label: "Dinner", time: "7:30 PM – 9:30 PM" },
];

export const MESSES = [
  { name: "Annapurna Mess (2nd Floor)", slug: "annapurna-mess-2nd-floor", location: "Fulgar – 1C", capacity: "360 students", image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3139.JPG_dhofqc.jpg" },
  { name: "Annapurna Mess (3rd Floor)", slug: "annapurna-mess-3rd-floor", location: "Fulgar – 1C", capacity: "360 students", image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3147.JPG_gb4kfv.jpg" },
  { name: "Egret Mess", slug: "egret-mess", location: "1B", capacity: "470 students", image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3178.JPG_jhfjly.jpg" },
  { name: "Canary Mess", slug: "canary-mess", location: "L-112", capacity: "240 students", image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774081543/WhatsApp_Image_2026-03-21_at_12.53.37_m1lmqn.jpg" },
  { name: "Dedhar Mess", slug: "dedhar-mess", location: "L-120", capacity: "240 students", image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3167.JPG_phxc3y.jpg" },
];

// The campus-wide mess committee (attached to the first mess unit; see header).
// `position` is the seeded position key; `title` becomes appointment.title_override.
export const MESS_COMMITTEE = [
  { title: "AD - Mess Management", name: "Dr. Arvind Kumar", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747106/arvind_kumar_gsgvrr.jpg" },
  { title: "Mess Warden - Canary", name: "Dr. Akash Subhash Awale", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709263/akash_a5ntu2.jpg" },
  { title: "Mess Warden - Fulgar", name: "Dr. Soumyadip Das", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747077/Soumyadip_Das_yuepd1.jpg" },
  { title: "Mess Warden - Dedhar", name: "Dr. Ved Prakash Ranjan", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747072/Ved_Prakash_jiuzku.png" },
  { title: "Mess Warden - Egret", name: "Dr. Riya Bhowmik", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709311/warden_egret_kbovjx.jpg" },
  { title: "Mess Manager", name: "Ms. Rehana Rasool", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747088/rehana_pic_tcrwf2.jpg" },
  { title: "Dedhar,Canary Mess", name: "Irfan Ahmad Teli", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709277/irfan_plq41j.jpg" },
  { title: "Annapurna Mess", name: "Gaurav Bhagat", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709366/gaurav_nmxuac.jpg" },
  { title: "Mess Secretary", name: "Ujjwal Gupta", position: "mess_secretary", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747073/Ujjwal_Gupta_Mess_secretary_mpxpzz.jpg" },
  { title: "Mess Committee Member", name: "Devansh Agrawal", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747101/DevanshAgrawal_2023ume0254_Fulgar2ndFloor_mp3qa5.jpg" },
  { title: "Mess Committee Member", name: "Gayatri", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747095/Gayatri_2025PMD0057_lrsn3l.jpg" },
  { title: "Mess Committee Member", name: "Gurpreet Singh", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747126/gurpreet_singh_2024ucs0091_egret_ivnsur.jpg" },
  { title: "Mess Committee Member", name: "Anish Kumar Yadav", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747114/anishyadav_scvffb.jpg" },
  { title: "Mess Committee Member", name: "Sidharth Gupta", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747081/Sidharth_Gupta_2024UMA0228_Dedhar_vrrkap.jpg" },
  { title: "Mess Committee Member", name: "Ashad Mansoori", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747106/Ashad_2023UME0247_2ndfloor_govgtu.jpg" },
  { title: "Mess Committee Member", name: "Shubham Kumar", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747505/Shubham_Kumar_page-0001_n5dzxn.jpg" },
  { title: "Mess Committee Member", name: "Riant Dadra", position: "mess_committee_member", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747123/riant_snt1l8.jpg" },
];

// The mess infrastructure PDF (one shared document across all messes).
export const MESS_INFRA_PDF = "https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Mess_Infrastructure_Details_kjxkux.pdf";

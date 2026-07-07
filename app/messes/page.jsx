"use client";

import React from "react";
import Image from "next/image";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PdfSlideshow from "../components/PdfSlideshow";

/* ================= DATA ================= */

const messes = [
  {
    name: "Annapurna Mess (2nd Floor)",
    location: "Fulgar – 1C",
    capacity: "360 students",
    image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3139.JPG_dhofqc.jpg",
  },
  {
    name: "Annapurna Mess (3rd Floor)",
    location: "Fulgar – 1C",
    capacity: "360 students",
    image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3147.JPG_gb4kfv.jpg",
  },
  {
    name: "Egret Mess",
    location: "1B",
    capacity: "470 students",
    image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3178.JPG_jhfjly.jpg",
  },
  {
    name: "Canary Mess",
    location: "L-112",
    capacity: "240 students",
    image: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774081543/WhatsApp_Image_2026-03-21_at_12.53.37_m1lmqn.jpg",
  },
  {
    name: "Dedhar Mess",
    location: "L-120",
    capacity: "240 students",
    image: "https://res.cloudinary.com/dabviijid/image/upload/v1774694949/DSCF3167.JPG_phxc3y.jpg",
  },
];

const commonTimings = [
  { icon: "", label: "Breakfast", time: "7:20 AM – 9:20 AM" },
  { icon: "", label: "Lunch",     time: "12:20 PM – 2:20 PM" },
  { icon: "", label: "Evening Snacks",     time: "5:30 PM – 6:30 PM" },
  { icon: "", label: "Dinner",    time: "7:30 PM – 9:30 PM" },
];

const committee = [
  { title: "AD - Mess Management", name: "Dr. Arvind Kumar", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747106/arvind_kumar_gsgvrr.jpg" },
  { title: "Mess Warden - Canary", name: "Dr. Akash Subhash Awale", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709263/akash_a5ntu2.jpg" },
  { title: "Mess Warden - Fulgar", name: "Dr. Soumyadip Das", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747077/Soumyadip_Das_yuepd1.jpg" },
  { title: "Mess Warden - Dedhar", name: "Dr. Ved Prakash Ranjan", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747072/Ved_Prakash_jiuzku.png" },
  { title: "Mess Warden - Egret", name: "Dr. Riya Bhowmik", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709311/warden_egret_kbovjx.jpg" },
  { title: "Mess Manager", name: "Ms. Rehana Rasool", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747088/rehana_pic_tcrwf2.jpg" },
  { title: "Dedhar,Canary Mess", name: "Irfan Ahmad Teli", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709277/irfan_plq41j.jpg" },
  { title: "Annapurna Mess", name: "Gaurav Bhagat", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709366/gaurav_nmxuac.jpg" },
  { title: "Mess Secretary", name: "Ujjwal Gupta", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747073/Ujjwal_Gupta_Mess_secretary_mpxpzz.jpg" },
  { title: "Mess Committee Member", name: "Devansh Agrawal", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747101/DevanshAgrawal_2023ume0254_Fulgar2ndFloor_mp3qa5.jpg" },
  { title: "Mess Committee Member", name: "Gayatri", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747095/Gayatri_2025PMD0057_lrsn3l.jpg" },
  { title: "Mess Committee Member", name: "Gurpreet Singh", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747126/gurpreet_singh_2024ucs0091_egret_ivnsur.jpg" },
  { title: "Mess Committee Member", name: "Anish Kumar Yadav", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747114/anishyadav_scvffb.jpg" },
  { title: "Mess Committee Member", name: "Sidharth Gupta", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747081/Sidharth_Gupta_2024UMA0228_Dedhar_vrrkap.jpg" },
  { title: "Mess Committee Member", name: "Ashad Mansoori", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747106/Ashad_2023UME0247_2ndfloor_govgtu.jpg" },
  { title: "Mess Committee Member", name: "Shubham Kumar", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747505/Shubham_Kumar_page-0001_n5dzxn.jpg" },
  { title: "Mess Committee Member", name: "Riant Dadra", img: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747123/riant_snt1l8.jpg" },
];

/* ================= CARD ================= */

const Card = ({ title, name, img }) => (
  <div className="bg-blue-50 rounded-xl shadow-md overflow-hidden text-center hover:shadow-xl transition">
    <div className="relative w-full aspect-[3/4] bg-gray-100">
      <Image src={img} alt={name} fill className="object-contain p-2" />
    </div>
    <div className="p-4">
      <h3 className="text-sm font-bold text-[#003f87]">{title}</h3>
      <p className="text-gray-700 text-sm">{name}</p>
    </div>
  </div>
);

/* ================= PAGE ================= */

export default function Page() {
  return (
    <>
      <Header />

      <section className="bg-blue-50 py-16 mt-10">
        <h1 className="text-center text-4xl font-bold text-[#003f87] mb-6">
          Our Messes
        </h1>
        <PdfSlideshow
                  pdfUrl="https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Mess_Infrastructure_Details_kjxkux.pdf"
                  driveUrl="https://drive.google.com/file/d/1OExSfM-XZd5o9Q31SEb4M75w8aexxzuU/view?usp=drive_link"
                  title="Mess Infrastructure & Details"
                />

        {/* ── Common Timings Banner ── */}
        <div className="max-w-2xl mx-auto mb-12 px-6">
          <div className="bg-white rounded-2xl shadow-md px-8 py-6">
            <h2 className="text-center text-lg font-bold text-[#003f87] mb-4 tracking-wide uppercase">
              🕐 Mess Timings (All Messes)
            </h2>
            <div className="flex flex-col sm:flex-row justify-center gap-5 text-gray-700 text-sm sm:text-base">
              {commonTimings.map(({ icon, label, time }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <span className="text-2xl">{icon}</span>
                  <span className="font-bold text-[#003f87]">{label}</span>
                  <span>{time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Individual Mess Cards ── */}
        <div className="max-w-6xl mx-auto space-y-10 px-6">
          {messes.map((mess, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-md p-6 text-center">
              <h3 className="text-2xl font-bold text-[#003f87] mb-4">{mess.name}</h3>

              <div className="relative w-full max-w-[500px] mx-auto aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden">
                <Image src={mess.image} alt={mess.name} fill className="object-cover" />
              </div>

              <div className="mt-6 space-y-2 text-gray-700">
                <p>📍 Location — {mess.location}</p>
                <p>👥 Capacity — {mess.capacity}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FULL COMMITTEE */}
      <section className="bg-white py-20">
        <h2 className="text-center text-4xl font-bold text-[#003f87] mb-12">
          Mess Administration & Committee
        </h2>

        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-10 px-6">
          {committee.map((c, i) => (
            <Card key={i} {...c} />
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PdfSlideshow from "../components/PdfSlideshow";

/* ================= DATA ================= */

const hostels = [

  {
    name: "Anz Hostel (Boys)",
    image:
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1782053498/Screenshot_2026-06-21_201701_uxe8ek.png",
    warden: {
      name: "Dr. Guru Brahmam Ramani",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1782053652/1707973890935_gjqpa7.jpg",
      email: "warden.egret@iitjammu.ac.in",
    },
    secretary: {
     name: "Mehul Gupta",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg",
      email: "hsec.boys@iitjammu.ac.in",
    },
    caretaker: {
      name: "Mr. Ankush Kumar",
      photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1782053795/DR_Ankush_m3qpsx.jpg",
      email: "caretaker.egret@iitjammu.ac.in",
    },
  },
  {
    name: "Fulgar Hostel (Boys)",
    image:
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774091910/IMG_4600_ywthft.jpg",
    warden: {
      name: "Krishna Mohan Gupta",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709289/krishna_gmox4k.jpg",
      email: "warden.fulgar@iitjammu.ac.in",
    },
    secretary: {
      name: "Mehul Gupta",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg",
      email: "hsec.boys@iitjammu.ac.in",
    },
    caretaker: {
      name: "Majid Bashir",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709377/majid_jvbkdo.jpg",
      email: "caretaker.fulgar@iitjammu.ac.in",
    },
    extraCaretaker: {
      name: "Tabrez",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774933803/WhatsApp_Image_2026-03-30_at_16.44.01_vboecb.jpg",
      email: "caretaker.fulgar@iitjammu.ac.in",
    },
    wellnessWarden: {
      name: "Sumit Raj Ghosh",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709345/sumit_kikdod.jpg",
      phone: "+91 9709111227",
      email: "sumit.ghosh@iitjammu.ac.in",
    },
  },

  {
    name: "Egret Hostel (Girls)",
    image:
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774092815/IMG-20260320-WA0004.jpg_mg1dal.jpg",
    warden: {
      name: "Dr. Riya Bhowmik",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709311/warden_egret_kbovjx.jpg",
      email: "warden.egret@iitjammu.ac.in",
    },
    secretary: {
      name: "Mishthi Agarwal",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_girls_vqu4zr.jpg",
      email: "hsec.girls@iitjammu.ac.in",
    },
    caretaker: {
      name: "Ms. Pooja Devi",
      photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774933802/WhatsApp_Image_2026-03-30_at_16.44.01_1_rvolqn.jpg",
      email: "caretaker.egret@iitjammu.ac.in",
    },
  },

  {
    name: "Braeg Hostel (Boys)",
    image:
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774091838/WhatsApp_Image_2026-03-21_at_16.46.37_wthdth.jpg",
    warden: {
      name: "Dr. Ved Prakash Ranjan",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771747072/Ved_Prakash_jiuzku.png",
      email: "warden.braeg@iitjammu.ac.in",
    },
    secretary: {
      name: "Mehul Gupta",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg",
      email: "hsec.boys@iitjammu.ac.in",
    },
    wellnessWarden: {
      name: "Mr. Sumit Raj Ghosh",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709345/sumit_kikdod.jpg",
      phone: "+91 9709111227",
      email: "sumit.ghosh@iitjammu.ac.in",
    },
    caretaker: {
      name: "Anish Koul",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709299/anish_jfjwap.jpg",
      // phone: "+91 8875875803",
      email: "caretaker.braeg@iitjammu.ac.in",
    },
    attendant: {
      name: "Mr. Ajay Kumar",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709026/ajay_hx6u5j.png",
      phone: "+91 9858145319",
    },
  },

  {
    name: "Dedhar Hostel (Girls)",
    image:
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774186976/WhatsApp_Image_2026-03-22_at_18.22.29_m3vqyf.jpg",
    warden: {
      name: "Dr. Garima Singh",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709322/warden_dedhar_f7n6dg.jpg",
      email: "warden.dedhar@iitjammu.ac.in",
    },
    secretary: {
      name: "Mishthi Agarwal",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_girls_vqu4zr.jpg",
      email: "hsec.girls@iitjammu.ac.in",
    },
    caretaker: {
      name: "Tasaduq Gul",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709332/caretaker_dedhar_nb0d5l.jpg",
      email: "caretaker.dedhar@iitjammu.ac.in",
    },
  },

  {
    name: "Canary Hostel (Boys)",
    image:
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774091914/IMG_5802_qenuqc.jpg",
    warden: {
      name: "Akash Awale",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709263/akash_a5ntu2.jpg",
      email: "warden.canary@iitjammu.ac.in",
    },
    secretary: {
      name: "Mehul Gupta",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941863/hostel_secretary_boys_ew5mqj.jpg",
      email: "hsec.boys@iitjammu.ac.in",
    },
    caretaker: {
      name: "Irfan Ahmad Teli",
      photo:
        "https://res.cloudinary.com/dveqd1vm1/image/upload/v1771709277/irfan_plq41j.jpg",
      phone: "+91 6005257797",
      email: "caretaker.canary@iitjammu.ac.in",
    },
  },
];

/* ================= PAGE ================= */

export default function Page() {
  return (
    <>
      <Header />

      <section className="bg-gradient-to-r from-blue-50 to-blue-100 py-20 mt-16">

        {/* TITLE */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-[#003f87]">
            Our Hostels
          </h2>
          <div className="w-24 h-1 bg-[#003f87] mx-auto mt-3 rounded-full" />
        </div>
          <PdfSlideshow
          pdfUrl="https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Hostel_Infrastructure_Details_b5kbmv.pdf"
          driveUrl="https://drive.google.com/file/d/1WwLhj1XQQO-zILP6D38ZCeysFEbrhdcG/view?usp=drive_link"
          title="Hostel Infrastructure & Details"
        />

        {/* ===== ADMIN BIG CARD ===== */}
        <div className="max-w-6xl mx-auto mt-16 px-4 mb-10">
          <div className="flex justify-center">

            {/* Clickable AD Hostel card */}
            <Link
              href="https://www.iitjammu.ac.in/faculty/details?id=yogesh.nimdeo"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer no-underline"
            >
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl" />

              <div className="relative z-10">
                {/* Photo with scale-on-hover */}
                <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4 transition-transform duration-300 group-hover:scale-110">
                  <Image
                    src="https://res.cloudinary.com/dveqd1vm1/image/upload/v1772463407/ad_hostel_lram8d.jpg"
                    alt="Dr. Yogesh Madhukarrao Nimdeo"
                    fill
                    className="object-cover object-top"
                  />
                </div>

                {/* Name with underline on hover */}
                <h2 className="text-2xl font-bold text-[#003f87] inline-block border-b-2 border-transparent group-hover:border-[#003f87] transition-all duration-300">
                  Dr. Yogesh Madhukarrao Nimdeo
                </h2>

                <p className="text-gray-700 mt-1">
                  Associate Dean (Hostel Affairs)
                </p>
              </div>
            </Link>

          </div>
        </div>

        {/* ===== HOSTEL INFRASTRUCTURE PDF SLIDESHOW ===== */}
      

        {/* HOSTELS */}
        <div className="max-w-6xl mx-auto space-y-10 px-6">
          {hostels.map((hostel, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-md p-6 text-center">

              <div className="relative w-full max-w-[600px] mx-auto aspect-[16/10] rounded-xl overflow-hidden mb-6">
                <Image src={hostel.image} alt={hostel.name} fill className="object-cover" />
              </div>

              <h3 className="text-2xl font-bold text-[#003f87] mb-6">
                {hostel.name}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { role: "Warden", data: hostel.warden },
                  { role: "Secretary", data: hostel.secretary },
                  { role: "Wellness Warden", data: hostel.wellnessWarden },
                  { role: "Caretaker", data: hostel.caretaker },
                  { role: "Hostel Attendant", data: hostel.attendant },
                  { role: "Caretaker", data: hostel.extraCaretaker },
                ]
                  .filter(item => item.data)
                  .map((item, i) => (
                    <div key={i} className="flex gap-4 bg-blue-50 rounded-xl p-4 text-left">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
                        <Image src={item.data.photo} alt={item.data.name} fill className="object-cover" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mb-1 inline-block">
                          {item.role}
                        </span>
                        <p className="font-semibold">{item.data.name}</p>
                        <p className="text-sm text-gray-600">{item.data.phone}</p>
                        <p className="text-sm text-gray-600">{item.data.email}</p>
                      </div>
                    </div>
                  ))}
              </div>

            </div>
          ))}
        </div>

      </section>

      <Footer />
    </>
  );
}

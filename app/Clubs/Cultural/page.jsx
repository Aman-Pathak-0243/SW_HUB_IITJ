"use client";

import React, { useState,useRef,useEffect } from "react";
import Image from "next/image";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { FaInstagram } from "react-icons/fa";
import PdfSlideshow from "../../components/PdfSlideshow";

/* -------------------- DATA -------------------- */

const clubs = [
  { name: "Photography Club", image: "/photography.jpg", link: "https://www.instagram.com/chitraka_iitjammu" },
  { name: "Literary Club", image: "/literary.jpg", link: "https://www.instagram.com/sangam.iitjammu" },
  { name: "Dance Club", image: "/dance.jpg", link: "https://www.instagram.com/beat_street.iitjmu" },
  { name: "Drama Club", image: "/drama.jpg", link: "https://www.instagram.com/the_dramatizers_iitjammu" },
  { name: "Music Club", image: "/music.jpg", link: "https://www.instagram.com/malang_iitjammu" },
  { name: "Fine Arts Club", image: "/artihc.jpg", link: "https://www.instagram.com/artihc.iitjammu" },
  { name: "Anime Club", image: "/anime.jpg", link: "https://www.instagram.com/anisoul_iitjmu" },
  { name: "Cooking Club", image: "/cooking.jpg", link: "https://www.instagram.com/cookingclub.iitjammu" }
];

const coordinators = [
  { name: "Manish Kumar", photo: "/photography coordinator.jpeg", club: "Photography Club" },
  { name: "Sparsh Dubey", photo: "/literary coordinator.jpg", club: "Literary Club" },
  { name: "Akshat Rai", photo: "/dance coordinator.png", club: "Dance Club" },
  { name: "Anmol Ratan Srivastav", photo: "/drama coordinator.jpeg", club: "Drama Club" },
  { name: "Nishchay Singh", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941876/music_coordinator_zllcve.jpg", club: "Music Club" },
  { name: "Hriday Jain", photo: "/fine arts coordinator.jpeg", club: "Fine Arts Club" },
  { name: "Keshav Kundan Kumar", photo: "/anime coordinator.jpeg", club: "Anime Club" },
  { name: "Uday Prakash Makija", photo: "/cooking coordinator.jpg", club: "Cooking Club" }
];

const PICs = [
  { name: "Dr. Sarada Prasad Gochhayat", photo: "/PIC photography.jpeg", club: "Photography Club" ,profile:"https://www.iitjammu.ac.in/computer_science_engineering/faculty-list/~saradaprasadgochhayat" },
  { name: "Dr. Ambika Prasad Shah", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941886/PIC_literary_uuruj9.jpg", club: "Literary Club",profile:"https://iitjammu.ac.in/faculty/~ambikaprasadshah" },
  { name: "Dr. Suman Sarkar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774335119/1636437542323_kzndvd.jpg", club: "Dance Club",profile:"https://iitjammu.ac.in/faculty/~sumansarkar" },
  { name: "Dr. Suman Sarkar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774335119/1636437542323_kzndvd.jpg", club: "Drama Club" ,profile:"https://iitjammu.ac.in/faculty/~sumansarkar"},
  { name: "Dr. Suman Sarkar", photo: "https://res.cloudinary.com/dabviijid/image/upload/v1774335119/1636437542323_kzndvd.jpg", club: "Music Club",profile:"https://iitjammu.ac.in/faculty/~sumansarkar" },
  { name: "Dr. Chembolu Vinay", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641536/WhatsApp_Image_2026-01-17_at_14.12.59_3_eufqfz.jpg", club: "Fine Arts Club",profile:"https://iitjammu.ac.in/civil_engineering/faculty-list/~chemboluvinay" },
  { name: "Dr. Sunil Kumar Kashyap", photo: "/PIC anime.png", club: "Anime Club",profile:"https://iitjammu.ac.in/materials-engineering/faculty-list/~sunilkumarkashyap" },
  { name: "Dr. Arvind Kumar", photo: "/PIC cooking.jpg", club: "Cooking Club",profile:"https://iitjammu.ac.in/mathematics/faculty-list/~arvindkumar" }
];

const clubVisionMission = {
  "Photography Club": {
    vision: "To capture stories, emotions, and perspectives through the art of photography.",
    mission: [
      "Promote visual storytelling",
      "Conduct photography workshops",
      "Encourage creative expression"
    ]
  },
  "Literary Club": {
    vision: "To nurture creativity and critical thinking through literature.",
    mission: [
      "Encourage writing and debates",
      "Promote reading culture",
      "Organize literary events"
    ]
  },
  "Dance Club": {
    vision: "To express emotions and culture through dance.",
    mission: [
      "Promote diverse dance forms",
      "Organize performances",
      "Encourage discipline and teamwork"
    ]
  },
  "Drama Club": {
    vision: "To bring stories to life through theatre and performance.",
    mission: [
      "Promote theatrical arts",
      "Organize stage performances",
      "Encourage creative storytelling"
    ]
  },
  "Music Club": {
    vision: "To inspire harmony and creativity through music.",
    mission: [
      "Promote musical talent",
      "Conduct jam sessions",
      "Organize concerts and competitions"
    ]
  },
  "Fine Arts Club": {
    vision: "To foster creativity through visual and fine arts.",
    mission: [
      "Encourage artistic expression",
      "Organize art workshops",
      "Promote exhibitions"
    ]
  },
  "Anime Club": {
    vision: "To celebrate anime culture and storytelling.",
    mission: [
      "Promote anime discussions",
      "Organize screenings",
      "Build a creative community"
    ]
  },
  "Cooking Club": {
    vision: "To explore culinary creativity and culture.",
    mission: [
      "Promote cooking skills",
      "Explore global cuisines",
      "Encourage healthy cooking"
    ]
  }
};

const secretary = {
  name: "Saumya Gupta",
  photo: "/cultural secretary.jpeg",
  post: "Cultural Secretary"
};

/* -------------------- PAGE -------------------- */

export default function Page() {
  const heroImages = [
    "https://res.cloudinary.com/dabviijid/image/upload/v1774553604/DSC00957_yfhuun.jpg",
    "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950087/DSC00186_lfwxza.jpg",
    "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950085/54d4710e-38fa-4c90-a29b-087069eb9a6c_bnaxik.jpg",
    "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950081/IMG-20250621-WA0015_d61mjk.jpg",
    "/hero3.jpg",
    "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950090/DSC02870_2_zkzejw.jpg",
    "https://res.cloudinary.com/dabviijid/image/upload/v1774553604/DSC06554_vg0n3f.jpg",
    "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774952029/DSC06144_lcsvbj.jpg"
  ];

  const [currentSlide, setCurrentSlide] = useState(0);

  const intervalRef = useRef(null);
  const hasUserInteracted = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!hasUserInteracted.current) {
        setCurrentSlide((prev) => (prev + 1) % heroImages.length);
      }
    }, 4000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [heroImages.length]);

  const stopAutoplay = () => {
    if (!hasUserInteracted.current) {
      hasUserInteracted.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  const nextSlide = () => {
    stopAutoplay();
    setCurrentSlide((prev) => (prev + 1) % heroImages.length);
  };

  const prevSlide = () => {
    stopAutoplay();
    setCurrentSlide(
      (prev) => (prev - 1 + heroImages.length) % heroImages.length
    );
  };

  const goToSlide = (index) => {
    stopAutoplay();
    setCurrentSlide(index);
  };
  const [selectedClub, setSelectedClub] = useState(null);

  const clubPICs = PICs.filter(p => p.club === selectedClub?.name);
  const clubCoordinators = coordinators.filter(c => c.club === selectedClub?.name);
  const visionData = clubVisionMission[selectedClub?.name];

  return (
    <>
      <Header />

<div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[75vh] overflow-hidden">
          {heroImages.map((src, index) => (
            <Image
              key={index}
              src={src}
              alt="IIT Jammu Activities"
              fill
              priority={index === 0}
              className={`object-cover transition-opacity duration-1000 ${
                index === currentSlide ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}

          <div className="absolute inset-0 bg-black/40 z-[1]" />

          {/* Left Arrow */}
          <button
            onClick={prevSlide}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-xs text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition"
          >
            ❮
          </button>

          {/* Right Arrow */}
          <button
            onClick={nextSlide}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-xs text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition"
          >
            ❯
          </button>

          {/* Dots */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {heroImages.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-3 h-3 rounded-full transition ${
                  index === currentSlide
                    ? "bg-white scale-110"
                    : "bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>

          {/* Navbar */}
          
        </div>
        <PdfSlideshow
                  pdfUrl="https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Student_Club_Activities_m39twc.pdf"
                  driveUrl="https://drive.google.com/file/d/1H9ttrd9DSwLX9kXsQ-mUQByy6UJV_iyu/view?usp=drive_link"
                  title="Student Club Activities"
                />

      {/* SECRETARY */}
     {/* ASSOCIATE DEAN + CULTURAL SECRETARY */}
<div className="max-w-6xl mx-auto mt-16 px-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

    {/* Associate Dean Card */}
    <a
    href="https://iitjammu.ac.in/materials-engineering/faculty-list/~devilal"
  target="_blank"
  rel="noopener noreferrer"
  className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer block"
>
  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>

  <div className="relative z-10">
    <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
      <Image
        src="https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641537/WhatsApp_Image_2026-01-17_at_14.12.59_ap6x4e.jpg"
        alt="Dr. Devi Lal"
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-110"
      />
    </div>
    <p className="text-2xl font-bold text-[#003f87] group-hover:underline transition">
      Dr. Devi Lal
    </p>
    <p className="text-gray-700">Associate Dean (Student Affairs)</p>
  </div>
</a>

    {/* Cultural Secretary Card */}
    <div className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer">
      
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>

      <div className="relative z-10">
        <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
          <Image
            src="/cultural secretary.jpeg"
            alt="Saumya Gupta"
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />
        </div>
        <h2 className="text-2xl font-bold text-[#003f87]">
          Saumya Gupta
        </h2>
        <p className="text-gray-700">
          Cultural Secretary
        </p>
      </div>
    </div>

  </div>
</div>

      {/* CLUBS */}
     <section className="bg-blue-50 mt-20 py-16">
             <h2 className="text-center text-4xl font-bold text-[#003f87] mb-12">
               Our Clubs
             </h2>
     
             <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
               {clubs.map((club, i) => (
                 <div key={i} className="bg-white rounded-xl shadow hover:shadow-xl transition">
                   <div
                     className="group relative w-full aspect-[4/3] sm:h-64 cursor-pointer overflow-hidden"
                     onClick={() => setSelectedClub(club)}
                   >
                     <Image
                       src={club.image}
                       alt={club.name}
                       fill
                       className="object-contain sm:object-cover transition-transform duration-300 group-hover:scale-110"
                     />
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition duration-300" />
                   </div>
     
                   <div className="p-6 flex flex-col">
                     <h3 className="text-xl font-bold text-[#003f87] mb-4">
                       {club.name}
                     </h3>
                     <a
                       href={club.link}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="mt-auto inline-flex items-center justify-center gap-2 text-white bg-[#003f87] hover:bg-[#06376e] px-4 py-2 rounded-lg font-semibold transition"
                     >
                       <FaInstagram size={20} /> See More
                     </a>
                   </div>
                 </div>
               ))}
             </div>
           </section>

      {/* MODAL */}
      {selectedClub && (
        <div
          className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center px-4"
          onClick={() => setSelectedClub(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-5xl w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* HEADER */}
            <div className="relative h-48">
              <Image src={selectedClub.image} alt={selectedClub.name} fill className="object-cover" />
              <div className="absolute inset-0 bg-black/60" />
              <h2 className="absolute bottom-4 left-6 text-3xl font-bold text-white">
                {selectedClub.name}
              </h2>
              <button
                onClick={() => setSelectedClub(null)}
                className="absolute top-4 right-4 bg-white px-3 py-1 rounded-full font-bold"
              >
                ✕
              </button>
            </div>

            {/* BODY */}
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* LEFT */}
                <div className="space-y-8">
                  <div>
                    <h3 className="text-2xl font-semibold text-[#003f87] mb-4">Professor In-Charge</h3>
                    {clubPICs.map((p, i) => (
                      <a
  
    key={i}
    href={p.profile}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex items-center gap-4 bg-blue-50 hover:bg-blue-100 p-4 rounded-xl mb-3 transition-all duration-200 hover:shadow-md cursor-pointer"
  >
    <div className="relative w-16 h-16 rounded-full overflow-hidden shrink-0">
      <Image
        src={p.photo}
        alt={p.name}
        fill
        className="object-cover object-top transition-transform duration-300 group-hover:scale-110"
      />
    </div>
    <p className="font-semibold text-[#000000] group-hover:underline group-hover:text-blue-[#003f87] transition">
      {p.name}
    </p>
  </a>
))}
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-[#003f87] mb-4">Coordinators</h3>
                    {clubCoordinators.map((c, i) => (
                      <div key={i} className="flex items-center gap-4 bg-green-50 p-4 rounded-xl mb-3">
                        <div className="relative w-16 h-16 rounded-full overflow-hidden">
                          <Image src={c.photo} alt={c.name} fill className="object-cover" />
                        </div>
                        <p className="font-semibold">{c.name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-2xl font-semibold text-[#003f87] mb-4">
                    Vision & Mission
                  </h3>
                  <p className="text-gray-700 mb-4">{visionData?.vision}</p>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    {visionData?.mission.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
"use client";

import React, { useState,useRef,useEffect } from "react";
import Image from "next/image";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { FaInstagram } from "react-icons/fa";
import PdfSlideshow from "../../components/PdfSlideshow";


/* -------------------- DATA -------------------- */

const clubs = [
  { name: "Coding Club", image: "/coding.jpg", link: "https://www.instagram.com/codeclub.iitjmu" },
  { name: "SAE Club", image: "/sae.jpg", link: "https://www.instagram.com/sae_iitjmu" },
  { name: "Robo-sapiens Club", image: "/robotics.jpg", link: "https://www.instagram.com/robosapiens_iitjammu" },
  { name: "Astriaza Club", image: "/astronomy.jpg", link: "https://www.instagram.com/astriaza_iitjmu" },
  { name: "FinTech Club", image: "/fintech.jpg", link: "https://www.instagram.com/fintech.iitjmu" }
];

const coordinators = [
  { name: "Soham Kakkar", photo: "/coding coordinator.jpg", club: "Coding Club" },
  //{ name: "Third Year", photo: "/sae coordinator.png", club: "SAE Club" },
  { name: "Rudransh Joshi", photo: "/sae co-coordinator.jpg", club: "SAE Club", role: "Coordinator" },
  { name: "Hriday Rana", photo: "/robotics coordinator.jpg", club: "Robo-sapiens Club" },
  { name: "Vaibhav Mittal", photo: "/astriaza coordinator.jpg", club: "Astriaza Club" },
  { name: "Khushi", photo: "/fintech coordinator.png", club: "FinTech Club" }
];

const PICs = [
  { name: "Dr. Sumit Kumar Pandey", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941883/PIC_coding_xylort.jpg", club: "Coding Club",profile:"https://iitjammu.ac.in/computer_science_engineering/faculty-list/~sumitkpandey" },
  { name: "Dr. Arvind Kumar Rajput", photo: "/PIC sae.jpeg", club: "SAE Club",profile:"https://iitjammu.ac.in/faculty/~arvindkrajput" },
  { name: "Dr. Nalin Kumar Sharma", photo: "/PIC robotics.jpg", club: "Robo-sapiens Club",profile:"https://www.iitjammu.ac.in/ee/faculty.html?faculty=~nalinkumarsharma" },
  { name: "Dr. Soumyadip Das", photo: "/PIC astriaza.jpg", club: "Astriaza Club",profile:"https://iitjammu.ac.in/faculty/~soumyadipdas" },
  { name: "Dr. Vijay Kumar Pal", photo: "/PIC fintech.jpeg", club: "FinTech Club",profile:"https://iitjammu.ac.in/mechanical_engineering/faculty.html?faculty=~vijaykumarpal" }
];

const clubVisionMission = {
  "Coding Club": {
    vision: "To foster a strong culture of coding, problem-solving, and software development.",
    mission: [
      "Promote competitive programming",
      "Encourage open-source contributions",
      "Conduct workshops and hackathons",
      "Prepare students for technical careers"
    ]
  },
  "SAE Club": {
    vision: "To nurture innovation and hands-on engineering in automotive technologies.",
    mission: [
      "Design and build vehicles",
      "Participate in competitions",
      "Encourage teamwork and leadership"
    ]
  },
  "Robo-sapiens Club": {
    vision: "To inspire excellence in robotics and automation.",
    mission: [
      "Develop autonomous systems",
      "Organize robotics workshops",
      "Promote innovation"
    ]
  },
  "Astriaza Club": {
    vision: "To ignite curiosity in astronomy and space sciences.",
    mission: [
      "Conduct stargazing sessions",
      "Promote astrophysics discussions",
      "Spread scientific awareness"
    ]
  },
  "FinTech Club": {
    vision: "To bridge finance and technology for real-world impact.",
    mission: [
      "Teach fintech tools",
      "Encourage research",
      "Host finance-related events"
    ]
  }
};

const associateDean = {
  name: "Dr. Devi Lal",
  photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641537/WhatsApp_Image_2026-01-17_at_14.12.59_ap6x4e.jpg",
  post: "Associate Dean (Academics)",
  profile:"https://iitjammu.ac.in/materials-engineering/faculty-list/~devilal"

};

const secretary = {
  name: "Aman Pathak",
  photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641536/WhatsApp_Image_2026-01-17_at_14.12.59_2_jcbwsp.jpg",
  post: "Academic Secretary"
};

/* -------------------- PAGE -------------------- */

export default function Page() {
  const heroImages = [
      "https://res.cloudinary.com/dabviijid/image/upload/v1774552920/IMG_1277_oc0h2b.jpg",
      
      "https://res.cloudinary.com/dabviijid/image/upload/v1774553261/474982342_18002231990735627_4552736978353083988_n_zsoxsx.jpg",
      "https://res.cloudinary.com/dabviijid/image/upload/v1774553603/DSC07950_youbpr.jpg",
      "https://res.cloudinary.com/dabviijid/image/upload/v1774552919/IMG-20251002-WA0024_zs8ox8.jpg",
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

      {/* ASSOCIATE DEAN + SECRETARY */}
     {/* ASSOCIATE DEAN + SECRETARY */}
<div className="max-w-6xl mx-auto mt-16 px-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

   {[associateDean].map((person, i) => (
  <a
    key={i}
    href="https://iitjammu.ac.in/materials-engineering/faculty-list/~devilal"
    target="_blank"
    rel="noopener noreferrer"
    className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer block"
  >
    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>
    <div className="relative z-10">
      <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
        <Image
          src={person.photo}
          alt={person.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-110 object-top"
        />
      </div>
      <p className="text-2xl font-bold text-[#003f87] group-hover:underline group-hover:text-[#003f87] transition">
        {person.name}
      </p>
      <p className="text-gray-700">{person.post}</p>
    </div>
  </a>
))}
    {[secretary].map((person, i) => (
      <div
        key={i}
        className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer"
      >
        {/* Dark Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>

        <div className="relative z-10">
          <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
            <Image
              src={person.photo}
              alt={person.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-110"
            />
          </div>
<h2 className="text-2xl font-bold text-[#003f87]">
            {person.name}
          </h2>

          <p className="text-gray-700">
            {person.post}
          </p>
        </div>
      </div>
    ))}

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
            onClick={(e) => e.stopPropagation()}
          >
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

            <div className="p-6 max-h-[70vh] overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* PIC + Coordinators */}
              <div>
                <h3 className="text-2xl font-semibold text-[#003f87] mb-4">
                  Professor In-Charge
                </h3>
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

                <h3 className="text-2xl font-semibold text-[#003f87] mt-6 mb-4">
                  Coordinators
                </h3>
                {clubCoordinators.map((c, i) => (
                  <div key={i} className="flex items-center gap-4 bg-green-50 p-4 rounded-xl mb-3">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden">
                      <Image src={c.photo} alt={c.name} fill className="object-cover" />
                    </div>
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-gray-600">
                        {c.role || "Coordinator"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Vision */}
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
      )}

      <Footer />
    </>
  );
}
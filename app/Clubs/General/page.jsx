"use client";
import React, { useState,useRef,useEffect } from "react";
import Image from "next/image";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { FaInstagram } from "react-icons/fa";
import PdfSlideshow from "../../components/PdfSlideshow";

/* -------------------- DATA -------------------- */

const clubs = [
  { name: "Nature and Adventure Club", image: "/NAC test.png", link: "https://www.instagram.com/nac_iitjmu" },
  { name: "Kritash Club", image: "/kritash.jpg", link: "https://www.instagram.com/kritash_iitjammu" },
  { name: "RE4M Club", image: "/RE4M.jpg", link: "https://www.instagram.com/re4m_iitjammu" },
  { name: "Mesh Club", image: "/mesh.jpg", link: "https://www.instagram.com/mesh.iitjammu" },
  { name: "Ek Bharat Shreshtha Bharat", image: "/ebsb.jpg", link: "https://www.instagram.com/ebsb.iitjammu" },
  { name: "Wellbeing Club", image: "/wellbeing.jpg", link: "https://www.instagram.com/wellbeing.iitjammu" }
];

const coordinators = [
  { name: "Yash Agarwal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774956278/Screenshot_2026-03-31_165358_zhrrkw.png", club: "Nature and Adventure Club" },
  { name: "Radhika Verma", photo: "/nac co-coordinator.jpeg", club: "Nature and Adventure Club", role: "Co-Coordinator" },
  { name: "Aditya Pratap Singh", photo: "/kritash coordinator-1.jpg", club: "Kritash Club" },
  { name: "Arshpreet Kaur", photo: "/kritash coordinator-2.jpg", club: "Kritash Club" },
  { name: "Harsh kumar", photo: "/re4m coordinator.jpg", club: "RE4M Club" },
  { name: "Yaduraj Bhakar", photo: "/mesh coordinator.jpg", club: "Mesh Club" },
  { name: "Machavolu Venkata Siva Sai Subrahman", photo: "/ebsb coordinator.jpeg", club: "Ek Bharat Shreshtha Bharat" },
  { name: "Palak Aggarwal", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941908/wellbeing_coordinator_yuazrx.jpg", club: "Wellbeing Club" }
];

const PICs = [
  { name: "Dr. Shafkat Shafi Dar", photo: "/PIC nac.jpg", club: "Nature and Adventure Club",profile:"https://iitjammu.ac.in/faculty/~shafkatshafidar" },
  { name: "Dr. Sanchita Srivastava", photo: "/PIC kritash.jpg", club: "Kritash Club",profile:"https://iitjammu.ac.in/faculty/~sanchitasrivastava" },
  { name: "Dr. Chandan Yadav", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774956477/1704698341656_zf3tb5.jpg", club: "RE4M Club",profile:"https://www.iitjammu.ac.in/faculty/~chandanyadav" },
  { name: "Dr. Mithu Baidya", photo: "/PIC mesh.jpeg", club: "Mesh Club",profile:"https://www.iitjammu.ac.in/bsbe/faculty.html?faculty=~mithubaidya" },
  { name: "Dr. Srishilan C", photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774956399/images_yeiytj.jpg", club: "Ek Bharat Shreshtha Bharat" ,profile:"https://www.iitjammu.ac.in/faculty/~srishilanc"},
  { name: "Dr. Kishore Kumar Jagini", photo: "/PIC wellbeing.jpeg", club: "Wellbeing Club",profile:"https://www.iitjammu.ac.in/hss/faculty.html?faculty=~kishorekumarjagini" }
];

const clubVisionMission = {
  "Nature and Adventure Club": {
    vision: "To promote environmental awareness and adventurous spirit among students.",
    mission: ["Organize treks", "Promote eco-friendly practices", "Encourage exploration"]
  },
  "Kritash Club": {
    vision: "To encourage creativity and innovation.",
    mission: ["Promote community service", "Organize drives", "Encourage leadership"]
  },
  "RE4M Club": {
    vision: "To drive sustainable practices.",
    mission: ["Promote recycling", "Conduct workshops", "Encourage green initiatives"]
  },
  "Mesh Club": {
    vision: "To inspire learning and innovation.",
    mission: ["Organize talks", "Encourage interdisciplinary learning"]
  },
  "Ek Bharat Shreshtha Bharat": {
    vision: "To promote unity in diversity.",
    mission: ["Cultural programs", "Celebrate diversity"]
  },
  "Wellbeing Club": {
    vision: "To foster mental and physical wellbeing.",
    mission: ["Conduct workshops", "Promote awareness"]
  }
};

const associateDean = {
  name: "Dr. Devi Lal",
  photo: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641537/WhatsApp_Image_2026-01-17_at_14.12.59_ap6x4e.jpg",
  post: "Associate Dean (Student Affairs)"
};

const secretary = {
  name: "Ayush Sharma",
  photo: "/general secretary.jpeg",
  post: "General Secretary"
};

export default function Page() {
  const heroImages = [
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950088/0f0e36fa-95b8-4abf-aa7b-97cc372cf560_qpkok6.jpg",
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950086/DSC07662_ws4wcm.jpg",
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950087/IMG_1005_wgtbhc.jpg",
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1775559506/IMG_1882_lxk0sj.jpg",
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774950087/2b460805-be4e-48cb-92c3-6d5f168e71df_vaidw8.jpg",
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774951590/IMG_20250928_000137125_HDR_epm8ag.jpg",
      //"/hero6.jpg",
      
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
      
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-black/60 z-[1]" />
      
                {/* Hero Text */}
                {/* <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center text-center px-4">
                  <div className="animate-fadeInUp">
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
                      Student Affairs Council
                    </h1>
                    <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto">
                      Empowering Students • Building Leaders • Creating Excellence
                    </p>
                  </div>
                </div> */}
      
                {/* Left Arrow */}
                <button
                  onClick={prevSlide}
                  className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-xs text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition hover:scale-110"
                >
                  ❮
                </button>
      
                {/* Right Arrow */}
                <button
                  onClick={nextSlide}
                  className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 bg-white/20 hover:bg-white/40 backdrop-blur-xs text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition hover:scale-110"
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
              </div>

      {/* HERO */}
      {/* LOGO CARD */}

<PdfSlideshow
                  pdfUrl="https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Student_Club_Activities_m39twc.pdf"
                  driveUrl="https://drive.google.com/file/d/1H9ttrd9DSwLX9kXsQ-mUQByy6UJV_iyu/view?usp=drive_link"
                  title="Student Club Activities"
                />
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

              <div>
                <h3 className="text-2xl font-semibold text-[#003f87] mb-4">Professor In-Charge</h3>
                {clubPICs.map((p, i) => (
                  <a
  
    key={i}
    href={p.profile}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex items-center gap-4 bg-blue-50 hover:bg- p-4 rounded-xl mb-3 transition-all duration-200 hover:shadow-md cursor-pointer"
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

                <h3 className="text-2xl font-semibold text-[#003f87] mt-6 mb-4">Coordinators</h3>
                {clubCoordinators.map((c, i) => (
                  <div key={i} className="flex items-center gap-4 bg-green-50 p-4 rounded-xl mb-3">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden">
                      <Image src={c.photo} alt={c.name} fill className="object-cover" />
                    </div>
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-gray-600">{c.role || "Coordinator"}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-2xl font-semibold text-[#003f87] mb-4">Vision & Mission</h3>
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
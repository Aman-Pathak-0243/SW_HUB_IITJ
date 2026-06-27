"use client";
import React, { useState,useEffect,useRef } from 'react'
import Image from 'next/image'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import { FaInstagram } from 'react-icons/fa'
import PdfSlideshow from "../../components/PdfSlideshow";


const clubs = [
  { name: 'Athletics Club', image: '/athletics.png', link: 'https://www.instagram.com/athletics.iitjammu/?hl=en' },
  { name: 'Badminton Club', image: '/badminton.jpg', link: 'https://www.instagram.com/badmintonclub_iitjammu/?hl=en' },
  { name: 'Basketball Club', image: '/basketball.jpeg', link: 'https://www.instagram.com/basketball.iitjammu/?hl=en' },
  { name: 'Cricket Club', image: '/cricket.jpeg', link: 'https://www.instagram.com/cricketiitjmu/' },
  { name: 'Chess Club', image: '/chess.jpeg', link: 'https://www.instagram.com/chess.iitjammu/' },
  { name: 'Football Club', image: '/footballlogo.jpg', link: 'https://www.instagram.com/footballclub.iitjammu/?hl=en' },
  { name: 'E-Sports Club', image: '/e sports.jpg', link: 'https://www.instagram.com/esports.iitjammu/' },
  { name: 'Table Tennis Club', image: '/table tennis.jpg', link: 'https://www.instagram.com/tabletennis_iitjmu/' },
  { name: 'Volleyball Club', image: '/volleyball.jpg', link: 'https://www.instagram.com/volleyball.iitjammu/' },
  { name: 'Weightlifting Club', image: '/weightlifting.jpg', link: 'https://www.instagram.com/weightlifting_iitjammu' },
  { name: 'Indoor Sports Club', image: '/indoor.jpg', link: 'https://www.instagram.com/indoorsports.iitjammu' }
]

const coordinators = [
  { name: 'Sumit', photo: '/athletics coordinator.jpg', club: 'Athletics Club' },
  { name: 'Shivam Yadav ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774692880/47fee13c-b587-4a55-b175-a8625d2becb2_ppgipo.jpg', club: 'Badminton Club' },
  { name: ' Sneha Hansrajani ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774692882/photo_2_tfxrdg.jpg', club: 'Badminton Club' },
  { name: 'Rattanveer Singh', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552413/IMG_4317_zz9oiv.heic', club: 'Basketball Club' },
  { name: 'Anushka ', photo: '/basketball coordinator girls.jpg', club: 'Basketball Club' },
  { name: 'Aditya Kumar ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552412/Screenshot_20250902-214947_-_Aditya_pamnfg.jpg', club: 'Cricket Club' },
  { name: 'Harshit', photo: '/chess coordinator boys.jpg', club: 'Chess Club' },
  { name: 'Priyanshi', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552417/1000075795_fkyhzu.jpg', club: 'Chess Club' },
  { name: 'Hemant Raina ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552414/1762711246066_ncm2t0.png', club: 'Football Club' },
  { name: 'Ritik Singh ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552412/2cfc5302-14df-4534-aa76-838c2ac938a3_h5e1dl.jpg', club: 'E-Sports Club' },
  { name: 'Shreysa', photo: '/tt coordinator.jpg', club: 'Table Tennis Club' },
  { name: 'Ashutosh Kunzru ', photo: '/volleyball coordinator boys.jpg', club: 'Volleyball Club' },
  { name: 'Garima Choudhary ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552788/IMG-20241013-WA0008_vg2pgu.jpg', club: 'Volleyball Club' },
  { name: 'Kishan Arya ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552411/IMG-20260223-WA0005_chycak.jpg', club: 'Weightlifting Club' },
  { name: 'Divyansh Choudhary ', photo: 'https://res.cloudinary.com/dabviijid/image/upload/v1774552414/IMG_20260324_153102_pz3yet.jpg', club: 'Indoor Sports Club' }
]
/* ---------------- VISION & MISSION ---------------- */

const clubVisionMission = {
  "Athletics Club": {
    vision:
      "To develop elite athletes who excel in performance and represent IIT Jammu with distinction at Inter-IIT tournaments.",
    mission: [
      "Encourage participation in track and field events",
      "Develop endurance, speed, and discipline",
      "Prepare athletes for Inter-IIT and other competitions"
    ]
  },

  "Badminton Club": {
    vision:
      "To build a strong badminton culture aimed at achieving excellence at Inter-IIT tournaments.",
    mission: [
      "Organize regular training sessions",
      "Promote competitive and recreational play",
      "Prepare teams for Inter-IIT and inter-college tournaments"
    ]
  },

  "Basketball Club": {
    vision:
      "To foster teamwork and competitive excellence with the goal of strong performances at Inter-IIT tournaments.",
    mission: [
      "Enhance technical and tactical skills",
      "Encourage teamwork and leadership",
      "Represent IIT Jammu in Inter-IIT and other leagues"
    ]
  },

  "Cricket Club": {
    vision:
      "To nurture cricketing talent capable of competing at the highest level in Inter-IIT tournaments.",
    mission: [
      "Develop technical, tactical, and mental skills",
      "Encourage discipline and sportsmanship",
      "Compete in Inter-IIT and inter-institute competitions"
    ]
  },

  "Chess Club": {
    vision:
      "To cultivate strategic thinkers who can achieve excellence at Inter-IIT chess tournaments.",
    mission: [
      "Promote chess culture across campus",
      "Organize training sessions and competitions",
      "Prepare players for Inter-IIT events"
    ]
  },

  "Football Club": {
    vision:
      "To build a competitive football team that performs with excellence at Inter-IIT tournaments.",
    mission: [
      "Develop physical fitness and tactical awareness",
      "Encourage teamwork and leadership",
      "Represent IIT Jammu in Inter-IIT and other competitions"
    ]
  },

  "E-Sports Club": {
    vision:
      "To establish a competitive e-sports ecosystem aimed at success in Inter-IIT e-sports tournaments.",
    mission: [
      "Organize competitive gaming sessions",
      "Encourage strategic and team-based play",
      "Prepare teams for Inter-IIT e-sports competitions"
    ]
  },

  "Table Tennis Club": {
    vision:
      "To promote excellence in table tennis with a focus on strong Inter-IIT performances.",
    mission: [
      "Conduct structured training sessions",
      "Encourage competitive participation",
      "Prepare players for Inter-IIT tournaments"
    ]
  },

  "Volleyball Club": {
    vision:
      "To build a cohesive and competitive volleyball team capable of excelling at Inter-IIT tournaments.",
    mission: [
      "Develop coordination, stamina, and teamwork",
      "Organize regular practice matches",
      "Compete in Inter-IIT and other tournaments"
    ]
  },

  "Weightlifting Club": {
    vision:
      "To develop strength athletes who represent IIT Jammu with excellence at Inter-IIT competitions.",
    mission: [
      "Promote safe and disciplined strength training",
      "Encourage physical fitness and performance",
      "Prepare lifters for Inter-IIT and national events"
    ]
  },

  "Indoor Sports Club": {
    vision:
      "To nurture talent in indoor sports with the aim of strong participation in Inter-IIT tournaments.",
    mission: [
      "Promote indoor games and recreational sports",
      "Encourage skill development and competition",
      "Prepare participants for Inter-IIT indoor sports events"
    ]
  }
};

const secretary = {
  name: "Sandeep Moond",
  photo: "/sports secretary.jpeg",
  post: "Sports Secretary"
}

const Page = () => {
  

// inside Page component, add alongside existing useState:
const heroImages = [
  "https://res.cloudinary.com/dabviijid/image/upload/v1774292353/DSC04261_akopkh.jpg",
  "https://res.cloudinary.com/dabviijid/image/upload/v1774292352/DSC09239_c5iaqq.jpg",
  "https://res.cloudinary.com/dabviijid/image/upload/v1774292349/DSC_0257_je3tc8.jpg",
  "https://res.cloudinary.com/dabviijid/image/upload/v1774292352/DSC03566_vkp7j0.jpg",
  "https://res.cloudinary.com/dabviijid/image/upload/v1774292698/DSC09658_1_bobjt1.jpg"
]

const [currentSlide, setCurrentSlide] = useState(0)
const intervalRef = useRef(null)
const hasUserInteracted = useRef(false)

useEffect(() => {
  intervalRef.current = setInterval(() => {
    if (!hasUserInteracted.current) {
      setCurrentSlide((prev) => (prev + 1) % heroImages.length)
    }
  }, 4000)
  return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
}, [heroImages.length])

const stopAutoplay = () => {
  if (!hasUserInteracted.current) {
    hasUserInteracted.current = true
    if (intervalRef.current) clearInterval(intervalRef.current)
  }
}
const nextSlide = () => { stopAutoplay(); setCurrentSlide((prev) => (prev + 1) % heroImages.length) }
const prevSlide = () => { stopAutoplay(); setCurrentSlide((prev) => (prev - 1 + heroImages.length) % heroImages.length) }
const goToSlide = (index) => { stopAutoplay(); setCurrentSlide(index) }
  const [selectedClub, setSelectedClub] = useState(null)

  const clubCoordinators = coordinators.filter(c => c.club === selectedClub?.name)
  const visionData = clubVisionMission[selectedClub?.name]

  return (
    <>
      <Header />

     {/* SLIDESHOW — replaces logo card */}
     
<div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[75vh] overflow-hidden">
  {heroImages.map((src, index) => (
    <Image
      key={index}
      src={src}
      alt="Sports Council"
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
          index === currentSlide ? "bg-white scale-110" : "bg-white/50 hover:bg-white/80"
        }`}
      />
    ))}
  </div>
</div>
<PdfSlideshow
                  pdfUrl="https://res.cloudinary.com/dabviijid/image/upload/v1782030226/Sports_Infrastructure_Details_al7nk0.pdf"
                  driveUrl="https://drive.google.com/file/d/1WMJgm0D_VJr0a2OrjgiS-FtGkQ9_ZV5v/view?usp=drive_link"
                  title="Sports Infrastructure & Details"
                />
      {/* Secretary */}
      {/* ASSOCIATE DEAN + SPORTS SECRETARY */}
      
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          {/* Associate Dean Card */}
          <a
          href="https://iitjammu.ac.in/mechanical_engineering/faculty.html?faculty=~shivas"
  target="_blank"
  rel="noopener noreferrer"
  className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer block"
>
  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>

  <div className="relative z-10">
    <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
      <Image
        src="https://res.cloudinary.com/dabviijid/image/upload/v1774292852/Shiva_S_0_nihh5d.jpg"
        alt="Dr. Shiva S"
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-110 object-top"
      />
    </div>
    <p className="text-2xl font-bold text-[#003f87] group-hover:underline transition">
      Dr. Shiva S
    </p>
    <p className="text-gray-700">Associate Dean (Sports)</p>
  </div>
</a>
<a
          href="https://www.iitjammu.ac.in/faculty/~deepakyadav"
  target="_blank"
  rel="noopener noreferrer"
  className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer block"
>
  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>
  <div className="relative z-10">
    <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
      <Image
        src="https://res.cloudinary.com/dabviijid/image/upload/v1774292962/deepak_yadav_kpxkw9.jpg"
        alt="Dr. Deepak Yadav"
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-110 object-top"
      />
    </div>
    <p className="text-2xl font-bold text-[#003f87] group-hover:underline transition">
      Dr. Deepak Yadav
    </p>
    <p className="text-gray-700">FIC (Inter-Sports)</p>
  </div>
</a>
        <a
           href="https://iitjammu.irins.org/profile/616088"
  target="_blank"
  rel="noopener noreferrer"
  className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer block"
>
  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>
  <div className="relative z-10">
    <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
      <Image
        src="https://res.cloudinary.com/dabviijid/image/upload/v1774293592/616088_eb4zqd.jpg"
        alt="Dr. Abhishek Kumar"
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-110"
      />
    </div>
    <p className="text-2xl font-bold text-[#003f87] group-hover:underline transition">
      Dr. Abhishek Kumar
    </p>
    <p className="text-gray-700">FIC (Intra-Sports)</p>
  </div>
</a>

<div className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer">

            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>

            <div className="relative z-10">
              <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
                <Image
                  src="https://res.cloudinary.com/dabviijid/image/upload/v1774903860/WhatsApp_Image_2026-03-30_at_4.51.16_PM_ru4sqr.jpg"
                  alt="Sandeep Moond"
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110 object-top"
                />
              </div>
              <h2 className="text-2xl font-bold text-[#003f87]">
                Mr. Raj Srivastava
              </h2>
              <p className="text-gray-700">
              Assistant Sports Officer
              </p>
            </div>
            
          </div>

          {/* Sports Secretary Card */}
          <div className="relative group bg-blue-50 rounded-xl p-8 text-center shadow transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer">

            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition duration-300 rounded-xl"></div>

            <div className="relative z-10">
              <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden mb-4">
                <Image
                  src="https://res.cloudinary.com/dveqd1vm1/image/upload/v1767941898/sports_secretary_iqeyth.png"
                  alt="Sandeep Moond"
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                />
              </div>
              <h2 className="text-2xl font-bold text-[#003f87]">
                Sandeep Moond
              </h2>
              <p className="text-gray-700">
                Sports Secretary
              </p>
            </div>
            
          </div>
  

          

        </div>
      </div>
      
      {/* Clubs */}
      <section className="bg-blue-50 mt-20 py-16">
        <h2 className="text-center text-4xl font-bold text-[#003f87] mb-12">
          Our Clubs
        </h2>

        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
          {clubs.map((club, i) => (
            <div key={i} className="bg-white rounded-xl shadow hover:shadow-xl transition">
              <div
                className="group relative w-full aspect-[4/3] sm:h-64 cursor-pointer overflow-hidden bg-white"  
                onClick={() => setSelectedClub(club)}
              >
                <Image
                  src={club.image}
                  alt={club.name}
                  fill
                  className="object-contain transition-transform duration-300 group-hover:scale-110" 
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

      {/* Modal */}
      {selectedClub && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center px-4" onClick={() => setSelectedClub(null)}>
          <div className="bg-white rounded-2xl max-w-5xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="relative h-48">
              <Image src={selectedClub.image} alt={selectedClub.name} fill className="object-cover" />
              <div className="absolute inset-0 bg-black/60" />
              <h2 className="absolute bottom-4 left-6 text-3xl font-bold text-white">{selectedClub.name}</h2>
              <button onClick={() => setSelectedClub(null)} className="absolute top-4 right-4 bg-white px-3 py-1 rounded-full font-bold">✕</button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* LEFT */}
                <div>
                  <h3 className="text-2xl font-semibold text-[#003f87] mb-4">Coordinators</h3>
                  {clubCoordinators.map((c, i) => (
                    <div key={i} className="flex items-center gap-4 bg-blue-50 p-4 rounded-xl mb-3">
                      <div className="relative w-16 h-16 rounded-full overflow-hidden">
                        <Image src={c.photo} alt={c.name} fill className="object-cover" />
                      </div>
                      <p className="font-semibold">{c.name}</p>
                    </div>
                  ))}
                </div>

                {/* RIGHT */}
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
        </div>
      )}

      <Footer />
    </>
  )
}

export default Page
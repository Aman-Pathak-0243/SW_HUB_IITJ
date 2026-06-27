"use client";

import React, { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Image from "next/image";

const Page = () => {
  /* ================= HERO SLIDES ================= */
  const heroImages = [
    "/hero1.jpg",
    "/hero2.jpg",
    "/hero3.jpg",
    "https://res.cloudinary.com/dveqd1vm1/image/upload/v1774952432/DSC02425_jafklj.jpg",
    "/hero7.jpg",
    "/hero5.jpg",
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

  /* ================= MOTIVATIONAL QUOTES ================= */
  const quotes = [
    "Believe in yourself and all that you are becoming.",
    "Every challenge is an opportunity to grow stronger.",
    "Learning today shapes the leader you become tomorrow.",
    "Consistency and effort matter more than perfection.",
    "Your journey at IIT Jammu is building more than a degree — it's building you.",
  ];

  const [activeQuote, setActiveQuote] = useState(0);
  const quoteInterval = useRef(null);
  const quoteUserInteracted = useRef(false);

  useEffect(() => {
    quoteInterval.current = setInterval(() => {
      if (!quoteUserInteracted.current) {
        setActiveQuote((prev) => (prev + 1) % quotes.length);
      }
    }, 5000);

    return () => {
      if (quoteInterval.current) clearInterval(quoteInterval.current);
    };
  }, [quotes.length]);

  const goToQuote = (index) => {
    quoteUserInteracted.current = true;
    if (quoteInterval.current) clearInterval(quoteInterval.current);
    setActiveQuote(index);
  };

  return (
    <>
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInLeft {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes fadeInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes marquee-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
          
          
        
        .animate-fadeInUp {
          animation: fadeInUp 0.8s ease-out;
        }
        
        .animate-fadeInLeft {
          animation: fadeInLeft 0.8s ease-out;
        }
        
        .animate-fadeInRight {
          animation: fadeInRight 0.8s ease-out;
        }
        
        .hover-scale {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .hover-scale:hover {
          transform: scale(1.02);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        
        .quote-card {
          background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);
        }
      `}</style>

      <Header />

      <main className="relative mt-1">
        {/* ================= HERO SLIDESHOW ================= */}
        <div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[65vh] overflow-hidden">
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
        {/* ================= WELCOME MARQUEE ================= */}
<div className="w-full overflow-hidden bg-[#003f87] border-t-[3px] border-b-[3px] border-[#FF6B00] h-12 flex items-center">
  <div
    className="flex items-center whitespace-nowrap"
    style={{
      animation: "marquee-scroll 22s linear infinite",
    }}
  >
    {[0, 1].map((copy) => (
      <span key={copy} className="inline-flex items-center">
        <span className="inline-flex items-center gap-2 px-12 text-white text-sm font-medium tracking-widest uppercase">
          <span className="inline-flex items-center bg-[#FF6B00] text-white text-xs px-3 py-0.5 rounded-sm mr-1">IIT JAMMU</span>
          Welcome to Student Affairs Council, IIT Jammu
          <span className="w-2 h-2 bg-[#FF6B00] rounded-full inline-block" />
        </span>
        <span className="inline-flex items-center gap-2 px-12 text-white text-sm font-medium tracking-widest uppercase">
          <span className="w-2 h-2 bg-[#FF6B00] rounded-full inline-block" />
          Empowering Students &bull; Building Leaders &bull; Creating Excellence
          <span className="w-2 h-2 bg-[#FF6B00] rounded-full inline-block" />
        </span>
        <span className="inline-flex items-center gap-2 px-12 text-white text-sm font-medium tracking-widest uppercase">
          <span className="w-2 h-2 bg-[#FF6B00] rounded-full inline-block" />
          General &bull; Academic &bull; Cultural &bull;  Sports Councils
          <span className="w-2 h-2 bg-[#FF6B00] rounded-full inline-block" />
        </span>
      </span>
    ))}
  </div>
</div>

        {/* ================= VISION SECTION ================= */}
        <section className="px-4 sm:px-8 md:px-16 py-20 bg-gradient-to-br from-blue-50 to-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[#FF6B00] font-semibold text-sm tracking-wider uppercase">Our Direction</span>
              <h2 className="text-3xl md:text-4xl font-bold text-[#003f87] mt-2 mb-4">
                Vision & Mission
              </h2>
              <div className="w-20 h-1 bg-[#FF6B00] mx-auto"></div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* Vision Card */}
              <div className="bg-white rounded-2xl p-8 shadow-lg hover-scale animate-fadeInLeft">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-[#003f87] mb-4">Our Vision</h3>
                <p className="text-gray-700 leading-relaxed">
                  To be a premier student affairs division that nurtures holistic development, 
                  fosters innovation, and creates responsible global leaders who contribute 
                  meaningfully to society.
                </p>
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500 italic">
                    &quot;Empowering the leaders of tomorrow, today.&quot;
                  </p>
                </div>
              </div>
              
              {/* Mission Card */}
              <div className="bg-white rounded-2xl p-8 shadow-lg hover-scale animate-fadeInRight">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-[#003f87] mb-4">Our Mission</h3>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF6B00] font-bold mt-1">•</span>
                    <span>Foster academic excellence and intellectual growth</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF6B00] font-bold mt-1">•</span>
                    <span>Promote cultural diversity and creative expression</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF6B00] font-bold mt-1">•</span>
                    <span>Develop leadership skills through student governance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF6B00] font-bold mt-1">•</span>
                    <span>Encourage sportsmanship and physical well-being</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#FF6B00] font-bold mt-1">•</span>
                    <span>Build a supportive and inclusive campus community</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ================= WELCOME ================= */}
        <section className="px-4 sm:px-8 md:px-16 py-16 bg-white">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-[#003f87] mb-6">
              Welcome to IIT Jammu Student Councils
            </h2>
            <p className="text-gray-700 leading-relaxed text-lg max-w-4xl mx-auto">
              The Student Affairs division at IIT Jammu fosters holistic
              development and leadership among students through various councils
              and initiatives.
            </p>
          </div>
        </section>

        {/* ================= MESSAGE FROM DEAN STUDENT AFFAIRS ================= */}
        <section className="px-4 sm:px-8 md:px-16 py-20 bg-gradient-to-br from-gray-50 to-blue-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[#FF6B00] font-semibold text-sm tracking-wider uppercase">From the Desk</span>
              <h2 className="text-3xl md:text-4xl font-bold text-[#003f87] mt-2 mb-4">
                Message from Dean
              </h2>
              <div className="w-20 h-1 bg-[#FF6B00] mx-auto"></div>
              <p className="text-gray-600 mt-4 max-w-2xl mx-auto">
                Student Affairs • IIT Jammu
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 items-center">
              {/* Dean Photo */}
              <div className="flex justify-center animate-fadeInLeft">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#FF6B00] to-[#003f87] rounded-2xl blur-lg opacity-50"></div>
                  <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl">
                    <Image
                      src="https://res.cloudinary.com/dveqd1vm1/image/upload/v1768641536/WhatsApp_Image_2026-01-17_at_14.12.59_1_bselui.jpg"
                      alt="Dean Student Affairs - IIT Jammu"
                      width={300}
                      height={350}
                      className="object-cover w-full h-auto"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://via.placeholder.com/300x350/003f87/ffffff?text=Dean+Student+Affairs";
                      }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                      <p className="text-white font-semibold text-center">Dean, Student Affairs</p>
                      <p className="text-white/80 text-sm text-center">IIT Jammu</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Message Content */}
              <div className="md:col-span-2 animate-fadeInRight">
                <div className="bg-white rounded-2xl p-8 shadow-lg hover-scale">
                  <div className="flex items-center gap-2 mb-6">
                    <svg className="w-8 h-8 text-[#FF6B00]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4 4h16v2H4V4zm2 4h12v2H6V8zm14-4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4h2v12h12V4h2z"/>
                    </svg>
                    <span className="text-[#FF6B00] font-semibold">Dear Students,</span>
                  </div>
                  
                  <div className="space-y-4 text-gray-700 leading-relaxed">
                    <p>
                      Welcome to the Student Affairs Council at IIT Jammu! As Dean of Student Affairs, 
                      it is my privilege to witness the incredible energy, creativity, and determination 
                      that each of you brings to our campus.
                    </p>
                    <p>
                      Our council is dedicated to ensuring that your time at IIT Jammu is not just about 
                      academic excellence, but also about holistic growth. We believe that true education 
                      extends beyond the classroom, encompassing leadership, cultural appreciation, 
                      sportsmanship, and community engagement.
                    </p>
                    <p>
                      Through our various councils - Academic, Cultural, General, and Sports - we provide 
                      platforms for you to explore your passions, develop new skills, and create lasting 
                      memories. Whether you&apos;re organizing a tech symposium, performing at cultural fest, 
                      representing our institute in sports, or leading student initiatives, you&apos;ll find 
                      opportunities to grow and shine.
                    </p>
                    <p>
                      I encourage each of you to actively participate, take initiative, and make the most 
                      of the resources available. Remember, this is your journey, and we are here to 
                      support you every step of the way.
                    </p>
                  </div>
                  
                  <div className="mt-8 pt-4 border-t border-gray-100">
                    <p className="font-semibold text-[#003f87]">With warm regards,</p>
                    <a
  href="https://iitjammu.ac.in/faculty/~anupshukla"
  target="_blank"
  rel="noopener noreferrer"
>
  <p className="text-2xl font-bold text-[#003f87] hover:underline transition">
    Dr. Anup Shukla
  </p>
</a>
                    <p className="text-gray-500 text-sm">Dean, Student Affairs</p>
                    <p className="text-gray-500 text-sm">Indian Institute of Technology Jammu</p>
                  </div>
                  
                  {/* Contact Info */}
                  <div className="mt-6 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                      dean.sw@iitjammu.ac.in
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                      </svg>
                      Office: Room No. 5041, Pushkar Building, Indian Institute of Technology Jammu
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= MOTIVATIONAL QUOTES ================= */}
        <section className="bg-gradient-to-b from-white to-gray-50 py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#003f87] mb-8">
              A Thought for Every Student
            </h2>

            <div className="quote-card rounded-2xl shadow-xl px-8 py-10 transition hover:shadow-2xl">
              <svg className="w-10 h-10 text-[#FF6B00] mx-auto mb-4 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p className="text-lg sm:text-xl italic text-gray-700 leading-relaxed">
                “{quotes[activeQuote]}”
              </p>
            </div>

            <div className="flex justify-center gap-3 mt-6">
              {quotes.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToQuote(index)}
                  className={`w-3 h-3 rounded-full transition ${
                    index === activeQuote
                      ? "bg-[#FF6B00] scale-125"
                      : "bg-[#003f87]/30 hover:bg-[#003f87]/50"
                  }`}
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Page;
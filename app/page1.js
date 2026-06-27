"use client";
import React from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Image from "next/image";
import Link from "next/link";

const Page = () => {
  const navItems = [
    { label: "Academic Council", href: "/Clubs/Academic" },
    { label: "Cultural Council", href: "/Clubs/Cultural" },
    { label: "Wellness Council", href: "/Clubs/Wellness" },
    { label: "Sports Council", href: "/Clubs/Sports" },
    { label: "Student Life", href: "/student-life" },
    { label: "Announcements", href: "/announcements" },
   // { label: "Past Events", href: "/past-events" },
  ];

  return (
    <>
      <Header />

      <main className="relative">
        {/* === Hero Image Section === */}
        <div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[65vh] overflow-hidden">
          <Image
            className="object-cover w-full h-full"
            src="/mainiit.png"
            alt="IIT Main Building"
            fill
            priority
          />

          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/40"></div>

          {/* === Horizontal Navbar (Always in one line, scrollable on small screens) === */}
          <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 w-[95%] sm:w-auto z-10">
            <nav
              className="
                flex justify-center items-center gap-4 sm:gap-6 md:gap-10 
                px-4 sm:px-6 py-3 rounded-full bg-white/10 backdrop-blur-md shadow-lg
                overflow-x-auto scrollbar-hide whitespace-nowrap
              "
            >
              {navItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  className="text-white text-sm sm:text-base md:text-lg font-semibold hover:text-[#ffcc00] transition-colors duration-300"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Hero Text (Optional placeholder) */}
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center px-4 sm:px-6 md:px-10">
            {/* Example: */}
            {/* <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white drop-shadow-lg">
              Office of Student Affairs
            </h1> */}
          </div>
        </div>

        {/* === Page Content === */}
        <section className="px-4 sm:px-8 md:px-16 py-10 sm:py-14 md:py-20 bg-white">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#003f87] mb-6">
              Welcome to IIT Jammu Student Councils
            </h2>

            <p className="text-gray-700 leading-relaxed text-justify text-sm sm:text-base md:text-lg max-w-5xl mx-auto">
              The Student Affairs division at IIT Jammu fosters holistic development and
              leadership among students through various councils and initiatives.
              Each council is committed to nurturing excellence, creativity, and teamwork
              while building a vibrant and inclusive campus community.
            </p>

            <p className="text-gray-700 leading-relaxed text-justify text-sm sm:text-base md:text-lg max-w-5xl mx-auto mt-6">
              Whether it’s the Academic Council guiding educational policies, the Cultural
              Council organizing vibrant festivals, the Technical Council driving innovation,
              or the Sports Council promoting athletic spirit — every student finds an avenue
              to explore, express, and excel at IIT Jammu.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Page;

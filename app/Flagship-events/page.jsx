"use client";

import React from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Image from "next/image";

const flagshipEvents = [
  {
    title: "Anhad – Techno-Cultural Fest",
    image: "/anhad.jpg",
    description:
      "Anhad is IIT Jammu’s techno-cultural fest, celebrating creativity, expression, and diversity. The festival features music, dance, drama, literary arts, fine arts, and a series of high-energy events that bring students together in a vibrant cultural showcase.",
  },
  {
    title: "Nexus – Inter Branch Technical Fest",
    image: "/nexus.jpg",
    description:
      "Nexus is IIT Jammu’s inter branch technical festival that promotes innovation, engineering excellence, and problem-solving. The fest includes hackathons, robotics competitions, technical workshops, research exhibitions, and events aimed at fostering scientific thinking among students.",
  },
  {
    title: "Convoquer – Inter-College Sports Tournament",
    image: "/convoquer.jpg",
    description:
      "Convoquer is IIT Jammu’s premier inter-college sports tournament, bringing together athletes from institutions across the region to compete in a wide range of sporting events. The festival celebrates competitive spirit, teamwork, discipline, and excellence. With high-energy matches, enthusiastic crowds, and a vibrant sports culture, Convoquer stands as a symbol of athletic passion and unity at IIT Jammu.",
  },
  {
    title: "Pragyaan – Academic & Research Conclave",
    image: "/pragyaan.jpg",
    description:
      "Pragyaan is IIT Jammu’s academic and research festival that brings together scholars, innovators, and professionals to exchange knowledge and ideas. The event features expert talks, panel discussions, research presentations, and interactive workshops designed to ignite intellectual curiosity and promote academic excellence.",
  },
  {
    title: "Udyamitsav – Entrepreneurship Fest",
    image: "/udyamitsav.jpg",
    description:
      "Udyamitsav is IIT Jammu’s entrepreneurship and innovation festival dedicated to nurturing startup culture and creative problem-solving. The summit includes pitch competitions, startup showcases, mentorship programs, and sessions with industry leaders, empowering students to transform ideas into impactful ventures.",
  },
  {
    title: "Pravaah – Inter Branch Sports Meet",
    image: "/pravaah.jpg",
    description:
      "Pravaah is IIT Jammu’s annual inter-branch sports meet, designed to promote healthy competition, teamwork, and athletic excellence among students. The event brings together participants from all academic branches to compete across a variety of sports, fostering unity, sportsmanship, and a vibrant sporting culture on campus.",
  },
];

const Page = () => {
  return (
    <>
      <Header />

      <main className="bg-white min-h-screen py-12 px-4 sm:px-8 md:px-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center text-[#003f87] mb-12">
          Flagship Events of IIT Jammu
        </h1>

        <div className="max-w-7xl mx-auto grid gap-10 md:gap-14">
          {flagshipEvents.map((event, index) => (
            <div
              key={index}
              className="
                flex flex-col md:flex-row items-center gap-8
                bg-[#f5f8ff] shadow-md rounded-2xl p-6 md:p-10
                border border-[#d9e4f5]
              "
            >
              <div className="w-full md:w-1/3">
                <Image
                  src={event.image}
                  alt={`${event.title} poster`}
                  width={500}
                  height={300}
                  className="rounded-xl shadow-lg object-cover"
                  priority={index === 0}
                />
              </div>

              <div className="w-full md:w-2/3">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#003f87] mb-4">
                  {event.title}
                </h2>
                <p className="text-gray-700 text-sm sm:text-base md:text-lg leading-relaxed text-justify">
                  {event.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </>
  );
};

export default Page;

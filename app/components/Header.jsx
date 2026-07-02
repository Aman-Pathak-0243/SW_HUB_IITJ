"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { FiMenu, FiX } from "react-icons/fi";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const WavingFlag = () => {
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <div style={{
        width: 130,
        height: 87,
        marginTop: 2,
        overflow: "hidden",
        borderRadius: "4px",
        transformOrigin: "left center",
        animation: "flagWave 2s ease-in-out infinite",
        boxShadow: "2px 4px 12px rgba(0,0,0,0.15)",
      }}>
        <img
          src="https://res.cloudinary.com/dabviijid/image/upload/v1774949735/unnamed_rz4g5g.gif"
          alt="Indian Flag"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
      <style>{`
        @keyframes flagWave {
          0%   { transform: perspective(200px) rotateY(0deg) skewY(0deg); }
          20%  { transform: perspective(200px) rotateY(8deg) skewY(1.5deg); }
          40%  { transform: perspective(200px) rotateY(0deg) skewY(0deg); }
          60%  { transform: perspective(200px) rotateY(-6deg) skewY(-1deg); }
          80%  { transform: perspective(200px) rotateY(4deg) skewY(0.8deg); }
          100% { transform: perspective(200px) rotateY(0deg) skewY(0deg); }
        }
      `}</style>
    </div>
  );
};

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  // Auth-aware nav CTA: signed-in users get a "Profile" link, everyone else "Login".
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The 4 councils collapse into ONE "Councils" dropdown; Clubs / Events / Resources
  // are top-level; Hostels/Messes point at the data-driven /org/* pages. All links
  // render the live current year (they populate once db:import:org has run).
  const councilItems = [
    { label: "General Affairs Council", href: "/org/councils/general-affairs-council" },
    { label: "Academic Council",        href: "/org/councils/academic-council" },
    { label: "Technical Council",       href: "/org/councils/technical-council" },
    { label: "Cultural Council",        href: "/org/councils/cultural-council" },
    { label: "Sports Council",          href: "/org/councils/sports-council" },
  ];
  const navItems = [
    { label: "Home",            href: "/" },
    // "Councils" (dropdown) is rendered explicitly between Home and Clubs below.
    { label: "Clubs",           href: "/org/clubs" },
    { label: "Events",          href: "/events" },
    { label: "Resources",       href: "/resources" },
    { label: "Hostels",         href: "/org/hostels" },
    { label: "Messes",          href: "/org/messes" },
    { label: "Flagship Events", href: "/Flagship-events" },
    { label: "Announcements",   href: "/announcements" },
    { label: "Wall of Fame",    href: "/wall-of-fame" },
    { label: "Team",            href: "/Team" },
    { label: "Contact Us",      href: "/Contact-Us" },
  ];
  const isCouncilActive = pathname?.startsWith("/org/councils");

  return (
    <>
      <style>{`
        :root {
          --iitj-blue:       #003f87;
          --iitj-blue-dark:  #001f5c;
          --iitj-blue-mid:   #00419e;
          --iitj-saffron:    #FF6B00;
          --iitj-saffron-lt: #FF8C3A;
          --iitj-white:      #ffffff;
          --iitj-offwhite:   #f4f7ff;
          --iitj-text-nav:   rgba(255,255,255,0.88);
        }

        .sac-header * { box-sizing: border-box; margin: 0; padding: 0; }

        .sac-header {
          font-family: var(--font-outfit), 'Outfit', sans-serif;
          position: sticky; top: 0; z-index: 100;
          background: var(--iitj-white);
          transition: box-shadow 0.4s ease;
        }
        .sac-header.scrolled     { box-shadow: 0 6px 32px rgba(0,48,135,0.18); }
        .sac-header:not(.scrolled) { box-shadow: 0 2px 12px rgba(0,48,135,0.10); }

        .tricolor-bar { display:flex; height:4px; }
        .tricolor-bar span { flex:1; }
        .tricolor-bar .tc-saffron { background:#FF9933; }
        .tricolor-bar .tc-white   { background:#fff; border-top:1px solid #e0e0e0; }
        .tricolor-bar .tc-green   { background:#138808; }

        .header-top {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 14px 36px;
          background: var(--iitj-white);
        }

        .left-slot  { justify-self: start; display:flex; align-items:center; }
        .right-slot { justify-self: end;   display:flex; align-items:center; }

        .iit-logo-link { display:block; transition:transform 0.28s ease; }
        .iit-logo-link:hover { transform:scale(1.05); }

        .slot-inner {
          opacity:0; transform: scale(0.88);
          transition: opacity 0.38s ease, transform 0.38s ease;
          pointer-events:none;
        }
        .slot-inner.visible {
          opacity:1; transform:scale(1); pointer-events:auto;
        }

        .brand-center { display:flex; align-items:center; gap:18px; }
        .logo-wrap { display:flex; align-items:center; justify-content:center; width:95px; height:95px; flex-shrink:0; }
        .brand-text-block { display:flex; flex-direction:column; align-items:center; gap:6px; }
        .brand-title {
          font-family:var(--font-cormorant),'Cormorant Garamond',serif;
          font-size:1.3rem; font-weight:700; letter-spacing:0.22em;
          color:var(--iitj-blue); text-align:center; line-height:1; white-space:nowrap;
        }
        .brand-sub {
          display:flex; align-items:center; gap:8px;
          font-size:0.62rem; font-weight:600; letter-spacing:0.3em;
          text-transform:uppercase; color:var(--iitj-saffron); white-space:nowrap;
        }
        .brand-sub::before,.brand-sub::after {
          content:''; display:block; width:24px; height:1.5px;
          background:var(--iitj-saffron); opacity:0.6; border-radius:2px;
        }
        .logo-label {
          font-size:0.52rem; font-weight:600; letter-spacing:0.12em;
          text-transform:uppercase; color:var(--iitj-blue);
          text-align:center; margin-top:4px; opacity:0.7;
        }
        .logo-col { display:flex; flex-direction:column; align-items:center; }

        .right-slot .logo-wrap { width:110px; height:110px; }

        .mobile-header { display:none; }
        .mobile-menu-btn {
          display:flex; align-items:center; justify-content:center;
          background:var(--iitj-offwhite); border:1.5px solid rgba(0,48,135,0.2);
          border-radius:10px; padding:8px; cursor:pointer; color:var(--iitj-blue);
          transition:all 0.22s ease; flex-shrink:0;
        }
        .mobile-menu-btn:hover { background:var(--iitj-blue); border-color:var(--iitj-blue); color:white; }

        .nav-band {
          background: linear-gradient(135deg, var(--iitj-blue-dark) 0%, var(--iitj-blue) 60%, var(--iitj-blue-mid) 100%);
          /* overflow must stay VISIBLE so the Councils dropdown (which opens BELOW the
             band) isn't clipped; the decorative ::before/::after use inset:0 so they
             never bleed past the band regardless. */
          position:relative; overflow:visible;
        }
        .nav-band::before {
          content:''; position:absolute; inset:0;
          background: repeating-linear-gradient(-55deg,transparent,transparent 40px,rgba(255,255,255,0.015) 40px,rgba(255,255,255,0.015) 80px);
          pointer-events:none;
        }
        .nav-band::after {
          content:''; position:absolute; top:0; left:0; right:0; height:2px;
          background: linear-gradient(90deg,transparent,var(--iitj-saffron) 20%,var(--iitj-saffron-lt) 50%,var(--iitj-saffron) 80%,transparent);
          opacity:0.7;
        }
        .desktop-nav {
          display:flex; justify-content:center; flex-wrap:wrap;
          gap:2px; padding:4px 32px 5px; position:relative;
        }
        .nav-link {
          position:relative; font-size:0.78rem; font-weight:400;
          letter-spacing:0.04em; padding:6px 14px; border-radius:5px;
          color:var(--iitj-text-nav); text-decoration:none;
          transition:color 0.2s ease, background 0.2s ease;
        }
        .nav-link::after {
          content:''; position:absolute; bottom:2px; left:50%;
          transform:translateX(-50%) scaleX(0); width:55%; height:2px;
          background:var(--iitj-saffron); border-radius:2px; transition:transform 0.25s ease;
        }
        .nav-link:hover { color:#fff; background:rgba(255,255,255,0.1); }
        .nav-link:hover::after { transform:translateX(-50%) scaleX(1); }
        .nav-link.active {
          color:#fff; font-weight:600; background:rgba(255,255,255,0.14);
          border:1px solid rgba(255,255,255,0.22);
          box-shadow:0 2px 12px rgba(0,0,0,0.15),inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .nav-link.active::after { transform:translateX(-50%) scaleX(1); }

        /* Councils dropdown (hover on desktop) */
        .nav-dropdown { position:relative; display:inline-flex; }
        .nav-dropdown-trigger { cursor:pointer; display:inline-flex; align-items:center; gap:5px; }
        .nav-dropdown-caret { font-size:0.6rem; transition:transform 0.2s ease; }
        .nav-dropdown:hover .nav-dropdown-caret { transform:rotate(180deg); }
        .nav-dropdown-menu {
          position:absolute; top:100%; left:50%; transform:translateX(-50%) translateY(6px);
          min-width:230px; background:#fff; border-radius:10px; padding:6px;
          box-shadow:0 12px 34px rgba(0,48,135,0.24); border:1px solid rgba(0,48,135,0.1);
          opacity:0; visibility:hidden; transition:opacity 0.18s ease, transform 0.18s ease; z-index:200;
        }
        .nav-dropdown:hover .nav-dropdown-menu { opacity:1; visibility:visible; transform:translateX(-50%) translateY(2px); }
        .nav-dropdown-menu a {
          display:block; padding:9px 14px; border-radius:7px; font-size:0.8rem; font-weight:500;
          color:var(--iitj-blue-dark); text-decoration:none; transition:background 0.15s ease, color 0.15s ease; white-space:nowrap;
        }
        .nav-dropdown-menu a:hover { background:var(--iitj-offwhite); color:var(--iitj-blue); }
        .nav-dropdown-menu a.active { background:rgba(0,48,135,0.08); color:var(--iitj-blue); font-weight:700; }

        /* Login button (stands out at the end of the nav) */
        .nav-login-btn {
          margin-left:10px; padding:6px 18px; border-radius:6px; font-size:0.78rem; font-weight:700;
          letter-spacing:0.04em; color:var(--iitj-blue-dark); text-decoration:none;
          background:linear-gradient(135deg,var(--iitj-saffron) 0%,var(--iitj-saffron-lt) 100%);
          box-shadow:0 2px 10px rgba(255,107,0,0.35); transition:transform 0.18s ease, box-shadow 0.18s ease;
        }
        .nav-login-btn:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(255,107,0,0.5); color:#fff; }
        .mob-council-label { font-size:0.7rem; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
          color:rgba(255,255,255,0.55); padding:10px 32px 2px; width:82%; text-align:center; }
        .mobile-nav-link.sub { font-size:0.82rem; opacity:0.92; }
        .mobile-nav-link.login {
          margin-top:8px; background:linear-gradient(135deg,var(--iitj-saffron),var(--iitj-saffron-lt));
          color:var(--iitj-blue-dark); font-weight:700; width:60%;
        }

        .mobile-menu {
          background:linear-gradient(180deg,var(--iitj-blue) 0%,var(--iitj-blue-dark) 100%);
          border-top:2px solid var(--iitj-saffron); padding:14px 0 22px;
          animation:slideDown 0.26s ease;
        }
        @keyframes slideDown {
          from { opacity:0; transform:translateY(-8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .mobile-menu-inner { display:flex; flex-direction:column; align-items:center; gap:2px; }
        .mobile-nav-link {
          font-size:0.88rem; font-weight:400; color:rgba(255,255,255,0.82);
          text-decoration:none; padding:10px 32px; border-radius:8px;
          width:82%; text-align:center; letter-spacing:0.04em;
          transition:background 0.2s, color 0.2s;
        }
        .mobile-nav-link:hover { background:rgba(255,255,255,0.1); color:#fff; }
        .mobile-nav-link.active {
          background:rgba(255,255,255,0.15); color:#fff; font-weight:600;
          border:1px solid rgba(255,255,255,0.22);
        }

        @media (max-width: 900px) {
          .brand-center { gap:10px; }
          .logo-wrap { width:75px; height:75px; }
          .brand-title { font-size:1rem; letter-spacing:0.14em; }
          .right-slot .logo-wrap { width:90px; height:90px; }
        }

        @media (max-width: 768px) {
          .header-top  { display:none; }
          .desktop-nav { display:none; }
          .mobile-header {
            display:flex; flex-direction:column; background:var(--iitj-white);
          }
          .mob-top-bar {
            display:flex; align-items:center; padding:10px 14px;
            min-height:72px; position:relative;
          }
          .mob-left  { flex:1; display:flex; justify-content:flex-start; align-items:center; }
          .mob-right { flex:1; display:flex; justify-content:flex-end; align-items:center; padding-right:52px; }
          .mob-flag-wrap { display:flex; align-items:flex-start; }
          .mob-council-ring {
            width:72px; height:72px; border-radius:50%; overflow:hidden;
            background:white; box-shadow:0 2px 14px rgba(0,48,135,0.18);
            border:2px solid rgba(0,48,135,0.15);
            display:flex; align-items:center; justify-content:center;
            animation:fadeIn 0.3s ease;
          }
          @keyframes fadeIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
          .mob-hamburger {
            position:absolute; right:14px; top:50%; transform:translateY(-50%);
          }
          .mob-brand-row {
            display:flex; align-items:center; justify-content:center; gap:14px;
            padding:8px 16px 12px; border-top:1px solid rgba(0,48,135,0.07);
          }
          .mob-logo-wrap { width:58px; height:58px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
          .mob-brand-text { display:flex; flex-direction:column; align-items:center; gap:3px; }
          .mob-brand-title {
            font-family:var(--font-cormorant),'Cormorant Garamond',serif; font-size:0.95rem; font-weight:700;
            letter-spacing:0.14em; color:var(--iitj-blue); text-align:center; line-height:1.15; white-space:nowrap;
          }
          .mob-brand-sub {
            display:flex; align-items:center; gap:6px; font-size:0.56rem; font-weight:600;
            letter-spacing:0.22em; text-transform:uppercase; color:var(--iitj-saffron); white-space:nowrap;
          }
          .mob-brand-sub::before,.mob-brand-sub::after {
            content:''; display:block; width:14px; height:1.5px;
            background:var(--iitj-saffron); opacity:0.6; border-radius:2px;
          }
          .mob-logo-label {
            font-size:0.44rem; font-weight:600; letter-spacing:0.1em;
            text-transform:uppercase; color:var(--iitj-blue); text-align:center; margin-top:2px; opacity:0.65;
          }
        }

        @media (max-width: 360px) {
          .mob-logo-wrap   { width:48px; height:48px; }
          .mob-brand-title { font-size:0.82rem; }
          .mob-brand-sub   { display:none; }
          .mob-council-ring { width:56px; height:56px; }
        }
      `}</style>

      <header className={`sac-header${scrolled ? " scrolled" : ""}`}>

        <div className="tricolor-bar">
          <span className="tc-saffron"/><span className="tc-white"/><span className="tc-green"/>
        </div>

        {/* ══ DESKTOP ══ */}
        <div className="header-top">

          {/* LEFT SLOT: IIT Jammu logo */}
          <div className="left-slot">
            <div className="slot-inner visible">
              <Link href="https://www.iitjammu.ac.in/" target="_blank" rel="noopener noreferrer" className="iit-logo-link">
                <Image
                  src="https://res.cloudinary.com/dabviijid/image/upload/v1765904866/fpaupa6aw4eid7vza2h4.png"
                  alt="IIT Jammu Logo" width={180} height={100} priority
                />
              </Link>
            </div>
          </div>

          {/* CENTER: SAC logo + brand text + Sports logo */}
          <div className="brand-center">
            <div className="logo-col">
              <div className="logo-wrap">
                <Image
                  src="https://res.cloudinary.com/dabviijid/image/upload/v1773993041/WhatsApp_Image_2026-03-11_at_11.24.42_AM-removebg-preview_tddjlb.png"
                  alt="SAC Logo" width={120} height={120}
                />
              </div>
              <span className="logo-label">Student Affairs</span>
            </div>
            <div className="brand-text-block">
              <p className="brand-title">STUDENT AFFAIRS</p>
              <p className="brand-sub">IIT Jammu</p>
            </div>
            <div className="logo-col">
              <div className="logo-wrap">
                <Image
                  src="https://res.cloudinary.com/dabviijid/image/upload/v1774902105/Untitled_460_x_800_px_1_fglicp.png"
                  alt="Sports Council Logo" width={85} height={85}
                />
              </div>
              <span className="logo-label">Sports Council</span>
            </div>
          </div>

          {/* RIGHT SLOT: waving national flag */}
          <div className="right-slot">
            <div className="slot-inner visible">
              <WavingFlag />
            </div>
          </div>
        </div>

        {/* ══ MOBILE ══ */}
        <div className="mobile-header">
          <div className="mob-top-bar">

            {/* Mobile LEFT: IIT Jammu logo */}
            <div className="mob-left">
              <Link href="https://www.iitjammu.ac.in/" target="_blank" rel="noopener noreferrer">
                <Image
                  src="https://res.cloudinary.com/dabviijid/image/upload/v1765904866/fpaupa6aw4eid7vza2h4.png"
                  alt="IIT Jammu Logo" width={120} height={66} priority
                />
              </Link>
            </div>

            {/* Mobile RIGHT: waving national flag */}
            <div className="mob-right">
              <div className="mob-flag-wrap" style={{ transform: "scale(0.72)", transformOrigin: "right center" }}>
                <WavingFlag />
              </div>
            </div>

            <button className="mobile-menu-btn mob-hamburger" onClick={() => setIsMobileMenuOpen(o => !o)} aria-label="Toggle menu">
              {isMobileMenuOpen ? <FiX size={22}/> : <FiMenu size={22}/>}
            </button>
          </div>

          {/* Mobile brand row */}
          <div className="mob-brand-row">
            <div className="logo-col">
              <div className="mob-logo-wrap">
                <Image src="https://res.cloudinary.com/dabviijid/image/upload/v1773993041/WhatsApp_Image_2026-03-11_at_11.24.42_AM-removebg-preview_tddjlb.png" alt="SAC Logo" width={58} height={58}/>
              </div>
              <span className="mob-logo-label">Student Activity Council</span>
            </div>
            <div className="mob-brand-text">
              <p className="mob-brand-title">STUDENT AFFAIRS</p>
              <p className="mob-brand-sub">IIT Jammu</p>
            </div>
            <div className="logo-col">
              <div className="mob-logo-wrap">
                <Image src="https://res.cloudinary.com/dabviijid/image/upload/v1774902105/Untitled_460_x_800_px_1_fglicp.png" alt="Sports Council Logo" width={58} height={58}/>
              </div>
              <span className="mob-logo-label">Sports Council</span>
            </div>
          </div>
        </div>

        {/* ══ Nav band ══ */}
        <div className="nav-band">
          <nav className="desktop-nav">
            <Link href="/" className={`nav-link${pathname === "/" ? " active" : ""}`}>Home</Link>

            {/* Councils dropdown (replaces the 4 separate council links) */}
            <div className="nav-dropdown">
              <Link href="/org/councils" className={`nav-link nav-dropdown-trigger${isCouncilActive ? " active" : ""}`}>
                Councils <span className="nav-dropdown-caret">▾</span>
              </Link>
              <div className="nav-dropdown-menu">
                <Link href="/org/councils" className={pathname === "/org/councils" ? "active" : ""}>All councils</Link>
                {councilItems.map((c, i) => (
                  <Link key={i} href={c.href} className={pathname === c.href ? "active" : ""}>{c.label}</Link>
                ))}
              </div>
            </div>

            {navItems.filter((i) => i.href !== "/").map((item, idx) => (
              <Link key={idx} href={item.href} className={`nav-link${pathname === item.href ? " active" : ""}`}>
                {item.label}
              </Link>
            ))}

            {isAuthed ? (
              <Link href="/profile" className="nav-login-btn">
                {firstName ? `Hi, ${firstName}` : "Profile"}
              </Link>
            ) : (
              <Link href="/login" className="nav-login-btn">Login</Link>
            )}
          </nav>
        </div>

        {/* ══ Mobile dropdown ══ */}
        {isMobileMenuOpen && (
          <div className="mobile-menu">
            <div className="mobile-menu-inner">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)}
                className={`mobile-nav-link${pathname === "/" ? " active" : ""}`}>Home</Link>

              {/* Councils group (inline on mobile) */}
              <span className="mob-council-label">Councils</span>
              <Link href="/org/councils" onClick={() => setIsMobileMenuOpen(false)}
                className={`mobile-nav-link sub${pathname === "/org/councils" ? " active" : ""}`}>All councils</Link>
              {councilItems.map((c, i) => (
                <Link key={i} href={c.href} onClick={() => setIsMobileMenuOpen(false)}
                  className={`mobile-nav-link sub${pathname === c.href ? " active" : ""}`}>{c.label}</Link>
              ))}

              {navItems.filter((i) => i.href !== "/").map((item, idx) => (
                <Link key={idx} href={item.href} onClick={() => setIsMobileMenuOpen(false)}
                  className={`mobile-nav-link${pathname === item.href ? " active" : ""}`}>
                  {item.label}
                </Link>
              ))}

              {isAuthed ? (
                <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="mobile-nav-link login">
                  {firstName ? `Hi, ${firstName} — My Profile` : "My Profile"}
                </Link>
              ) : (
                <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="mobile-nav-link login">Login</Link>
              )}
            </div>
          </div>
        )}

      </header>
    </>
  );
};

export default Header;
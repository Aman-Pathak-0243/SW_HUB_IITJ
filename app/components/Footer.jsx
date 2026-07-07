import Link from 'next/link';
import Image from 'next/image';

const Footer = () => {
  return (
    <footer className="text-gray-300 mt-2" style={{ backgroundColor: '#003f87', fontFamily: "var(--font-cormorant), 'Georgia', serif" }}>

      {/* Top accent line — matches the orange from header */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #e07b00, #f5a623, #e07b00)' }} />

      <div className="container mx-auto px-6 py-4">

        {/* ── Main Row ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 md:space-x-8">

          {/* 1. Logo + Copyright */}
          <div className="flex flex-col items-start space-y-1 w-full md:w-auto">
            <Link href="/" className="flex items-center transition duration-150 ease-in-out hover:opacity-80">
              <Image
                src="/iit3.png"
                alt="College Logo"
                width={220}
                height={36}
                priority
              />
            </Link>
            <p className="text-xs" style={{ color: 'rgba(220,230,255,0.7)', letterSpacing: '0.01em' }}>
              Copyright &copy; 2026 IIT Jammu, all rights reserved.
            </p>
          </div>

          {/* 2. Contact Cards */}
          <div className="flex flex-col sm:flex-row sm:space-x-6 space-y-3 sm:space-y-0 w-full md:w-auto">

            {/* HOS */}
            <div
              className="flex flex-col px-4 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <h3 className="text-sm font-semibold text-white">HOS – Student Affairs</h3>
              <p className="text-xs" style={{ color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Students Welfare</p>
              <a href="tel:01912570286" className="text-blue-300 hover:text-white transition duration-150 text-xs mt-0.5">
                0191-257-0286
              </a>
            </div>

            {/* Student Welfare Office */}
            <div
              className="flex flex-col px-4 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <h3 className="text-sm font-semibold text-white">Student Welfare Office</h3>
              <p className="text-xs" style={{ color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Students Welfare</p>
              <a href="tel:01912570697" className="text-blue-300 hover:text-white transition duration-150 text-xs mt-0.5">
                0191-257-0697
              </a>
            </div>

          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ margin: '12px 0 10px', borderTop: '1px solid rgba(255,255,255,0.12)' }} />

        {/* ── Credits Bar — orange accent matching header ── */}
        <div
          className="rounded-lg px-4 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, rgba(229,123,0,0.12) 0%, rgba(245,166,35,0.07) 100%)',
            border: '1px solid rgba(229,123,0,0.35)',
          }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
            <span style={{ color: '#f5a623', fontWeight: '600', marginRight: '5px' }}>✦ Architected &amp; Engineered by</span>
            <a href="https://amanpathak.dev" target="_blank" rel="noopener noreferrer" className="text-white font-semibold" style={{ textDecoration: 'underline', textDecorationColor: 'rgba(245,166,35,0.6)' }}>Aman Pathak</a>
            <span style={{ color: 'rgba(245,166,35,0.65)', marginLeft: '4px', fontStyle: 'italic' }}>— Lead Developer &amp; Architect</span>
          </p>

          <span className="hidden sm:inline" style={{ color: 'rgba(229,123,0,0.4)', fontSize: '14px' }}>·</span>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
            <span style={{ color: '#f5a623', fontWeight: '600', marginRight: '5px' }}>✦ Developed by</span>
            <span className="text-white font-semibold">Tushar Singh</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 5px' }}>&amp;</span>
            <span className="text-white font-semibold">Apaar Gupta</span>
          </p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
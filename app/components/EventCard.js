import Image from "next/image";

const EventCard = ({ event }) => {
  const { title, description, date, image } = event;

  // Tolerate a missing/invalid date: `new Date(null)` is the 1970 epoch (not
  // "Invalid Date"), so guard explicitly and hide the date badge when absent.
  const dateObj = date != null ? new Date(date) : null;
  const hasDate = dateObj && !Number.isNaN(dateObj.getTime());
  const day = hasDate ? dateObj.toLocaleDateString("en-IN", { day: "2-digit" }) : "";
  const month = hasDate ? dateObj.toLocaleDateString("en-IN", { month: "short" }).toUpperCase() : "";
  const year = hasDate ? dateObj.toLocaleDateString("en-IN", { year: "numeric" }) : "";

  return (
    <>
      <style>{`
        .event-card {
          font-family: var(--font-outfit), 'Outfit', sans-serif;
          background: #ffffff;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(0, 48, 135, 0.08);
          box-shadow: 0 4px 24px rgba(0, 48, 135, 0.07), 0 1px 4px rgba(0,0,0,0.04);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .event-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 16px 48px rgba(0, 48, 135, 0.14), 0 4px 12px rgba(0,0,0,0.06);
        }

        /* Top saffron accent line */
        .event-card-accent {
          height: 3px;
          background: linear-gradient(90deg, #003f87, #FF6B00 60%, #FF9933);
          flex-shrink: 0;
        }

        /* Image area */
        .event-card-img {
          position: relative;
          width: 100%;
          height: 190px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .event-card-img img {
          transition: transform 0.5s ease;
        }
        .event-card:hover .event-card-img img {
          transform: scale(1.05);
        }
        /* Gradient overlay on image */
        .event-card-img::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,20,70,0.55) 0%, transparent 60%);
          pointer-events: none;
        }

        /* No-image placeholder */
        .event-card-placeholder {
          height: 90px;
          background: linear-gradient(135deg, #f0f4fb 0%, #e8eef9 100%);
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          opacity: 0.4;
        }

        /* Body */
        .event-card-body {
          padding: 20px 22px 22px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
        }

        /* Date badge */
        .event-date-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          align-self: flex-start;
        }
        .event-date-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #001f5c, #003f87);
          color: #fff;
          border-radius: 10px;
          padding: 6px 10px;
          min-width: 46px;
          box-shadow: 0 3px 10px rgba(0,48,135,0.25);
        }
        .event-date-day {
          font-size: 1.15rem;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.01em;
        }
        .event-date-month {
          font-size: 0.55rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.75);
          margin-top: 2px;
        }
        .event-date-year {
          font-size: 0.72rem;
          color: #9ca3af;
          font-weight: 400;
          letter-spacing: 0.04em;
        }

        /* Title */
        .event-card-title {
          font-family: var(--font-cormorant), 'Cormorant Garamond', serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #003f87;
          letter-spacing: 0.02em;
          line-height: 1.2;
        }

        /* Divider */
        .event-card-divider {
          height: 1px;
          background: linear-gradient(90deg, rgba(0,48,135,0.12), transparent);
          border: none;
          margin: 0;
        }

        /* Description */
        .event-card-desc {
          font-size: 0.82rem;
          color: #6b7280;
          line-height: 1.6;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Footer tag */
        .event-card-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          margin-top: auto;
          padding-top: 4px;
        }
        .event-card-tag {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #FF6B00;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .event-card-tag::before {
          content: '';
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #FF6B00;
          opacity: 0.7;
        }
      `}</style>

      <div className="event-card">
        {/* Top accent stripe */}
        <div className="event-card-accent" />

        {/* Image or placeholder */}
        {image ? (
          <div className="event-card-img">
            <Image
              src={image}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="event-card-placeholder">🎓</div>
        )}

        {/* Body */}
        <div className="event-card-body">

          {/* Date badge */}
          {hasDate && (
            <div className="event-date-badge">
              <div className="event-date-block">
                <span className="event-date-day">{day}</span>
                <span className="event-date-month">{month}</span>
              </div>
              <span className="event-date-year">{year}</span>
            </div>
          )}

          {/* Title */}
          <h3 className="event-card-title">{title}</h3>

          {/* Divider */}
          <hr className="event-card-divider" />

          {/* Description */}
          {description && (
            <p className="event-card-desc">{description}</p>
          )}

          {/* Footer */}
          <div className="event-card-footer">
            <span className="event-card-tag">SAC · IIT Jammu</span>
          </div>

        </div>
      </div>
    </>
  );
};

export default EventCard;
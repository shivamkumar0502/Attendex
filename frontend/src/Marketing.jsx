import React from "react";
export default function Marketing({ onAuth, onDemo }) {
  return (
    <div className="marketing">
      <div className="landing">
        <nav className="row between">
          <div className="brand">
            <span className="logo">a</span>attendex.
          </div>
          <div className="marketing-links">
            <a href="#workflow">How it works</a>
            <a href="#why-attendex">Why Attendex</a>
            <a
              href="https://github.com/shivamkumar0502/Attendex"
              target="_blank"
              rel="noreferrer"
            >
              Source ↗
            </a>
          </div>
          <button onClick={() => onAuth(false)}>Open workspace ↗</button>
        </nav>
        <section className="hero">
          <div>
            <span className="pill">
              <i className="live-dot" /> A little more present.
            </span>
            <h1>
              Great classes
              <br />
              start with
              <br />
              <em>showing up.</em>
            </h1>
            <p>
              Give attendance a smaller part in your day. One thoughtful
              workspace for class check-ins, voice-assisted roll-call and
              records you can actually use.
            </p>
            <div className="row">
              <button onClick={() => onAuth(true)}>
                Create your classroom ↗
              </button>
              <button className="ghost" onClick={onDemo}>
                Explore live demo ▷
              </button>
            </div>
            <div className="hero-note">
              <span className="stacked-avatars">
                <span>A</span>
                <span>K</span>
                <span>D</span>
              </span>
              <small>
                Designed for the people
                <br />
                <strong>on both sides of the classroom.</strong>
              </small>
            </div>
          </div>
          <div className="product-preview">
            <div className="preview-top">
              <span>
                <i className="live-dot" /> CLASSROOM WORKSPACE
              </span>
              <span>↗</span>
            </div>
            <div className="preview-heading">
              <small>THURSDAY · SECTION A</small>
              <h2>A good day to learn.</h2>
              <p>Introduction to AI</p>
            </div>
            <div className="preview-stats">
              <div>
                <strong>32</strong>
                <small>Enrolled</small>
              </div>
              <div>
                <strong>28</strong>
                <small>Confirmed</small>
              </div>
              <div>
                <strong>3</strong>
                <small>In review</small>
              </div>
            </div>
            <div className="mini">
              <div className="row between">
                <h3>Attendance register</h3>
                <span className="tag">Sample preview</span>
              </div>
              {[
                ["AS", "Aarav Sharma", "Present"],
                ["AK", "Ananya Kapoor", "In review"],
                ["DP", "Diya Patel", "Present"],
              ].map(([a, n, s]) => (
                <div className="person" key={n}>
                  <span className="avatar">{a}</span>
                  <span style={{ flex: 1 }}>{n}</span>
                  <span
                    className={"tag " + (s === "In review" ? "pending" : "")}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>
            <div className="preview-bottom">
              <span className="wave">▂ ▅ ▃ ▇ ▂</span>
              <span>
                Voice assisted.
                <br />
                <strong>Teacher confirmed.</strong>
              </span>
            </div>
            <div className="floating-note">
              <span>✓</span>Less roll-call.
              <br />
              <strong>More possibility.</strong>
            </div>
          </div>
        </section>
        <div className="value-strip">
          <span>SCHOOLS & COLLEGES</span>
          <span>One shared class</span>
          <span>Two clear roles</span>
          <span>Every record reviewed</span>
          <span>Built for every screen</span>
        </div>
        <section id="workflow" className="workflow-section">
          <span className="eyebrow">A ROUTINE THAT FITS YOUR DAY</span>
          <div className="row between">
            <h2>
              From “good morning”
              <br />
              to a complete register.
            </h2>
            <p>
              Keep your attention on the room.
              <br />
              We’ll keep the details in one place.
            </p>
          </div>
          <div className="features">
            {[
              [
                "01",
                "Open the door.",
                "Create a class and share an invitation. Students join with their own accounts.",
                "↗",
              ],
              [
                "02",
                "Make everyone count.",
                "Start a session, collect check-ins or run voice-assisted roll-call. Review before confirming.",
                "◎",
              ],
              [
                "03",
                "See the bigger picture.",
                "Explore class attendance, spot incomplete records and export your register.",
                "▥",
              ],
            ].map(([n, t, b, i]) => (
              <article className="card" key={n}>
                <div className="row between">
                  <small>{n} / YOUR CLASSROOM</small>
                  <span className="feature-icon">{i}</span>
                </div>
                <h3>{t}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="why-attendex" className="story-section">
          <div>
            <span className="eyebrow">THOUGHTFUL BY DESIGN</span>
            <h2>
              Built for real classrooms.
              <br />
              <em>And real people.</em>
            </h2>
            <p>
              A student’s check-in isn’t a final verdict. Teachers keep control
              of the record, with clear pending, present, late and absent
              states.
            </p>
            <button className="lime" onClick={onDemo}>
              See the workflow →
            </button>
          </div>
          <div className="story-list">
            {[
              [
                "01",
                "On the device you have.",
                "Use a phone, tablet or laptop. Camera and microphone permissions remain in your control.",
              ],
              [
                "02",
                "Clarity over guesswork.",
                "Unmarked records stay unmarked. Class reports explain which sessions they include.",
              ],
              [
                "03",
                "A product you can inspect.",
                "Open source implementation, documented limitations and no made-up customer or accuracy claims.",
              ],
            ].map(([n, t, b]) => (
              <div className="action-item" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="closing-cta">
          <span className="pill">A FRESH START, EVERY CLASS</span>
          <h2>
            Let teaching take
            <br />
            the front seat.
          </h2>
          <div className="row">
            <button onClick={() => onAuth(true)}>Start your workspace ↗</button>
            <button className="ghost" onClick={onDemo}>
              Try without signing up
            </button>
          </div>
          <p>No credit card. No pretend results. Just your next classroom.</p>
        </section>
        <footer className="row between">
          <div className="brand">attendex.</div>
          <span>More time for what matters.</span>
          <a
            href="https://github.com/shivamkumar0502/Attendex"
            target="_blank"
            rel="noreferrer"
          >
            Explore the source ↗
          </a>
        </footer>
      </div>
    </div>
  );
}

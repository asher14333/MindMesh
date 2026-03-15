import Link from "next/link";

import styles from "./landing.module.css";

export default function LandingPage() {
  return (
    <div className={`${styles.page} ${styles.dots}`}>
      <div className={styles.shell}>
        <header className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="MindMesh home">
            <span className={styles.mark} aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* A simple “spark” mark to match the rest of the app’s logo vibe */}
                <path
                  d="M12 2v4m0 12v4M4 12H2m20 0h-2M5.05 5.05l2.83 2.83m8.24 8.24 2.83 2.83M18.95 5.05l-2.83 2.83M7.88 16.12l-2.83 2.83"
                  stroke="rgba(255,255,255,0.92)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="2.5" fill="rgba(255,255,255,0.92)" />
              </svg>
            </span>
            <span className={styles.brandText}>MindMesh</span>
          </Link>

          <nav className={styles.navLinks} aria-label="Primary">
            <a className={styles.navLink} href="#product">
              Product
            </a>
            <a className={styles.navLink} href="#workflow">
              Workflow
            </a>
            <a className={styles.navLink} href="#why">
              Why MindMesh
            </a>
          </nav>

          <div className={styles.navCtas}>
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/join">
              Join Session
            </Link>
          </div>
        </header>

        <main>
          <section className={styles.hero}>
            <div>
              <h1 className={styles.heroTitle}>
                Turn meetings into <span className={styles.accent}>living diagrams</span>
              </h1>
              <p className={styles.heroSub}>
                MindMesh listens to the conversation, understands intent, and builds an evolving
                visual map in near real time so your team can align faster and stop drowning in
                notes.
              </p>

              <div className={styles.heroCtas}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/join">
                  Join a Meeting
                </Link>
                <a className={styles.btn} href="#product">
                  See how it works
                </a>
              </div>
            </div>

            <div className={styles.shot} aria-label="MindMesh preview">
              <div className={styles.shotInner}>
                <div className={styles.shotGrid} aria-hidden="true" />
                <div className={`${styles.pill} ${styles.pillA}`}>Sales handoff</div>
                <div className={`${styles.pill} ${styles.pillB}`}>Security review</div>
                <div className={`${styles.pill} ${styles.pillC}`}>Go live</div>
                <div className={styles.camBadge}>Camera + Mic</div>
              </div>
            </div>
          </section>

          <section id="why" className={styles.section}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Stop losing the thread. See the big picture.</h2>
              <p className={styles.panelSub}>
                MindMesh turns messy, fast-moving conversations into a single shared diagram that
                updates when it matters, not on every token. The result is less cognitive load and a
                clearer path forward.
              </p>
              <ul className={styles.list}>
                <li>Near-real-time idea mapping driven by transcript events.</li>
                <li>Incremental updates with patch events, so the UI stays stable.</li>
                <li>Multiple diagram modes: flowchart, timeline, mindmap, org chart.</li>
              </ul>

              <div className={styles.cards} id="product">
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Visual Canvas</h3>
                  <p className={styles.cardBody}>
                    Ideas become nodes as your meeting unfolds, with server-owned IDs and layout.
                  </p>
                </div>
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Live Collaboration</h3>
                  <p className={styles.cardBody}>
                    Everyone shares the same evolving map, staying aligned without constant
                    “recap” moments.
                  </p>
                </div>
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Integrated Video</h3>
                  <p className={styles.cardBody}>
                    Camera and mic live alongside the diagram so teams can talk and build context
                    together.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section id="workflow" className={styles.section}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>The workflow</h2>
              <p className={styles.panelSub}>
                A lightweight loop designed for hackathon speed: connect, speak, visualize.
              </p>

              <div className={styles.workflow}>
                <div className={styles.step}>
                  <div className={styles.stepNum}>1</div>
                  <div>
                    <p className={styles.stepTitle}>Start a session</p>
                    <p className={styles.stepBody}>
                      Enter any session ID for now and jump into the meeting UI.
                    </p>
                  </div>
                </div>
                <div className={styles.step}>
                  <div className={styles.stepNum}>2</div>
                  <div>
                    <p className={styles.stepTitle}>Speak naturally</p>
                    <p className={styles.stepBody}>
                      Transcript events stream in; the backend buffers and triggers at the right
                      moments.
                    </p>
                  </div>
                </div>
                <div className={styles.step}>
                  <div className={styles.stepNum}>3</div>
                  <div>
                    <p className={styles.stepTitle}>Watch the map evolve</p>
                    <p className={styles.stepBody}>
                      The frontend consumes `diagram.replace` and `diagram.patch` events to keep the
                      diagram crisp and stable.
                    </p>
                  </div>
                </div>
              </div>

              <div className={styles.ctaRow}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/join">
                  Join a Session
                </Link>
              </div>
            </div>
          </section>

          <footer className={styles.footer}>
            <span>MindMesh</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

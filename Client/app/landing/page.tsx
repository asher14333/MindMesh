import Image from "next/image";
import Link from "next/link";
import styles from "./landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="MindMesh home">
            <Image
              src="/horizontalIconTransparent.png"
              alt="MindMesh"
              width={160}
              height={42}
              priority
              style={{ objectFit: "contain" }}
            />
          </Link>
          <Link className={`${styles.btn} ${styles.btnDark}`} href="/join">
            Open app
          </Link>
        </header>

        <main className={styles.main}>
          <div className={styles.copy}>
            <h1 className={styles.heroTitle}>
              Meetings that<br />think with you
            </h1>
            <p className={styles.heroSub}>
              MindMesh turns spoken conversation into a live diagram your whole team shares.
              Speak naturally — the structure appears on its own.
            </p>
            <Link className={`${styles.btn} ${styles.btnDark} ${styles.btnLg}`} href="/join">
              Start a session
            </Link>
          </div>

          <div className={styles.preview} aria-hidden="true">
            <div className={styles.diagramCard}>
              {/* toolbar */}
              <div className={styles.toolbar}>
                <div className={styles.dots3}>
                  <span className={styles.dotRed} />
                  <span className={styles.dotYellow} />
                  <span className={styles.dotGreen} />
                </div>
                <span className={styles.toolbarTitle}>Enterprise Onboarding</span>
                <span className={styles.toolbarBadge}>
                  <span className={styles.liveDot} />
                  Live
                </span>
              </div>

              <svg viewBox="0 0 580 420" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.diagram}>
                <defs>
                  <filter id="nodeShadow" x="-6%" y="-6%" width="112%" height="124%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.10" />
                  </filter>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <path d="M0 0L10 3.5L0 7" fill="#555" />
                  </marker>
                </defs>

                {/* dot grid bg */}
                <pattern id="dotGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="0.7" fill="#ddd" />
                </pattern>
                <rect width="580" height="420" fill="url(#dotGrid)" />

                {/* ── edges ── */}
                {/* Root → Deal Review */}
                <path d="M260 62 C260 93, 110 93, 110 124" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Root → SE Intro */}
                <path d="M290 62 C290 93, 290 93, 290 124" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Root → Security */}
                <path d="M320 62 C320 93, 475 93, 475 124" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Deal Review → Pricing */}
                <path d="M110 164 C110 204, 80 204, 80 248" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* SE Intro → Legal */}
                <path d="M272 164 C272 204, 222 204, 222 248" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* SE Intro → Integration */}
                <path d="M308 164 C308 204, 370 204, 370 248" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Security → Sign-off */}
                <path d="M475 164 C475 204, 510 204, 510 248" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Legal → Provisioning */}
                <path d="M222 288 C222 322, 222 322, 222 356" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Integration → CS Notified */}
                <path d="M370 288 C370 322, 370 322, 370 356" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />

                {/* ── nodes ── */}

                {/* Root: Sales Handoff */}
                <g filter="url(#nodeShadow)">
                  <rect x="215" y="24" width="150" height="38" rx="10" fill="#111" />
                  <text x="290" y="49" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Sales Handoff</text>
                </g>

                {/* L1: Deal Review */}
                <g filter="url(#nodeShadow)">
                  <rect x="50" y="124" width="120" height="40" rx="10" fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="1.4" />
                  <circle cx="68" cy="144" r="4" fill="#818cf8" />
                  <text x="80" y="149" fill="#1e1b4b" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Deal Review</text>
                </g>

                {/* L1: SE Intro */}
                <g filter="url(#nodeShadow)">
                  <rect x="230" y="124" width="120" height="40" rx="10" fill="#fffbeb" stroke="#fcd34d" strokeWidth="1.4" />
                  <circle cx="248" cy="144" r="4" fill="#f59e0b" />
                  <text x="260" y="149" fill="#78350f" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">SE Intro</text>
                </g>

                {/* L1: Security Review */}
                <g filter="url(#nodeShadow)">
                  <rect x="410" y="124" width="130" height="40" rx="10" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.4" />
                  <circle cx="428" cy="144" r="4" fill="#ef4444" />
                  <text x="440" y="149" fill="#7f1d1d" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Security Review</text>
                </g>

                {/* L2: Pricing Align */}
                <g filter="url(#nodeShadow)">
                  <rect x="18" y="248" width="122" height="40" rx="10" fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="1.4" />
                  <circle cx="36" cy="268" r="4" fill="#818cf8" />
                  <text x="48" y="273" fill="#1e1b4b" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Pricing Align</text>
                </g>

                {/* L2: Legal MSA */}
                <g filter="url(#nodeShadow)">
                  <rect x="162" y="248" width="120" height="40" rx="10" fill="#ecfdf5" stroke="#6ee7b7" strokeWidth="1.4" />
                  <circle cx="180" cy="268" r="4" fill="#10b981" />
                  <text x="192" y="273" fill="#064e3b" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Legal MSA</text>
                </g>

                {/* L2: Integration */}
                <g filter="url(#nodeShadow)">
                  <rect x="310" y="248" width="120" height="40" rx="10" fill="#fffbeb" stroke="#fcd34d" strokeWidth="1.4" />
                  <circle cx="328" cy="268" r="4" fill="#f59e0b" />
                  <text x="340" y="273" fill="#78350f" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Integration</text>
                </g>

                {/* L2: Sign-off */}
                <g filter="url(#nodeShadow)">
                  <rect x="450" y="248" width="116" height="40" rx="10" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.4" />
                  <circle cx="468" cy="268" r="4" fill="#ef4444" />
                  <text x="480" y="273" fill="#7f1d1d" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Sign-off</text>
                </g>

                {/* L3: Provisioning */}
                <g filter="url(#nodeShadow)">
                  <rect x="162" y="356" width="120" height="40" rx="10" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1.4" strokeDasharray="4 3" />
                  <text x="222" y="382" textAnchor="middle" fill="#555" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Provisioning</text>
                </g>

                {/* L3: CS Notified */}
                <g filter="url(#nodeShadow)">
                  <rect x="310" y="356" width="120" height="40" rx="10" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1.4" strokeDasharray="4 3" />
                  <text x="370" y="382" textAnchor="middle" fill="#555" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">CS Notified</text>
                </g>
              </svg>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

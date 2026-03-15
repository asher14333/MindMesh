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

              <svg viewBox="0 0 520 380" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.diagram}>
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
                <rect width="520" height="380" fill="url(#dotGrid)" />

                {/* ── edges (smooth bezier curves) ── */}
                {/* root → Deal Review */}
                <path d="M200 62 C200 90, 100 90, 100 118" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* root → SE Intro */}
                <path d="M260 62 C260 82, 260 82, 260 118" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* root → Security */}
                <path d="M300 62 C300 90, 420 90, 420 118" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Deal Review → Pricing */}
                <path d="M100 158 C100 180, 100 180, 100 212" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* SE Intro → Legal */}
                <path d="M240 158 C240 180, 190 180, 190 212" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* SE Intro → Integration */}
                <path d="M280 158 C280 180, 330 180, 330 212" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Security → Sign-off */}
                <path d="M420 158 C420 180, 420 180, 420 212" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Legal → Provisioning */}
                <path d="M190 252 C190 274, 190 274, 190 304" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />
                {/* Integration → CS Notified */}
                <path d="M330 252 C330 274, 340 274, 340 304" stroke="#888" strokeWidth="1.6" fill="none" markerEnd="url(#arrowhead)" />

                {/* ── nodes ── */}

                {/* Root: Sales Handoff */}
                <g filter="url(#nodeShadow)">
                  <rect x="185" y="24" width="150" height="38" rx="10" fill="#111" />
                  <text x="260" y="49" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Sales Handoff</text>
                </g>

                {/* L1: Deal Review */}
                <g filter="url(#nodeShadow)">
                  <rect x="42" y="118" width="116" height="40" rx="10" fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="1.4" />
                  <circle cx="60" cy="138" r="4" fill="#818cf8" />
                  <text x="72" y="143" fill="#1e1b4b" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Deal Review</text>
                </g>

                {/* L1: SE Intro */}
                <g filter="url(#nodeShadow)">
                  <rect x="202" y="118" width="116" height="40" rx="10" fill="#fffbeb" stroke="#fcd34d" strokeWidth="1.4" />
                  <circle cx="220" cy="138" r="4" fill="#f59e0b" />
                  <text x="232" y="143" fill="#78350f" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">SE Intro</text>
                </g>

                {/* L1: Security Review */}
                <g filter="url(#nodeShadow)">
                  <rect x="362" y="118" width="116" height="40" rx="10" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.4" />
                  <circle cx="380" cy="138" r="4" fill="#ef4444" />
                  <text x="392" y="143" fill="#7f1d1d" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Security Review</text>
                </g>

                {/* L2: Pricing Align */}
                <g filter="url(#nodeShadow)">
                  <rect x="42" y="212" width="116" height="40" rx="10" fill="#f5f3ff" stroke="#c4b5fd" strokeWidth="1.4" />
                  <circle cx="60" cy="232" r="4" fill="#818cf8" />
                  <text x="72" y="237" fill="#1e1b4b" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Pricing Align</text>
                </g>

                {/* L2: Legal MSA */}
                <g filter="url(#nodeShadow)">
                  <rect x="132" y="212" width="116" height="40" rx="10" fill="#ecfdf5" stroke="#6ee7b7" strokeWidth="1.4" />
                  <circle cx="150" cy="232" r="4" fill="#10b981" />
                  <text x="162" y="237" fill="#064e3b" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Legal MSA</text>
                </g>

                {/* L2: Integration */}
                <g filter="url(#nodeShadow)">
                  <rect x="272" y="212" width="116" height="40" rx="10" fill="#fffbeb" stroke="#fcd34d" strokeWidth="1.4" />
                  <circle cx="290" cy="232" r="4" fill="#f59e0b" />
                  <text x="302" y="237" fill="#78350f" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Integration</text>
                </g>

                {/* L2: Sign-off */}
                <g filter="url(#nodeShadow)">
                  <rect x="362" y="212" width="116" height="40" rx="10" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.4" />
                  <circle cx="380" cy="232" r="4" fill="#ef4444" />
                  <text x="392" y="237" fill="#7f1d1d" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Sign-off</text>
                </g>

                {/* L3: Provisioning */}
                <g filter="url(#nodeShadow)">
                  <rect x="132" y="304" width="116" height="40" rx="10" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1.4" strokeDasharray="4 3" />
                  <text x="190" y="330" textAnchor="middle" fill="#555" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">Provisioning</text>
                </g>

                {/* L3: CS Notified */}
                <g filter="url(#nodeShadow)">
                  <rect x="282" y="304" width="116" height="40" rx="10" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1.4" strokeDasharray="4 3" />
                  <text x="340" y="330" textAnchor="middle" fill="#555" fontSize="11" fontWeight="600" fontFamily="-apple-system, system-ui, sans-serif">CS Notified</text>
                </g>

                {/* live cursor indicator */}
                <g>
                  <rect x="212" y="46" width="6" height="12" rx="1" fill="#22c55e">
                    <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" />
                  </rect>
                </g>
              </svg>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

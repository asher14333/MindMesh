"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./join.module.css";

function safeRandomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `session-${Math.random().toString(16).slice(2)}`;
  }
}

export default function JoinForm() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(safeRandomId());
  }, []);

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const id = (sessionId || "").trim() || safeRandomId();
    router.push(`/app?sessionId=${encodeURIComponent(id)}`);
  }

  return (
    <form onSubmit={onJoin} className={styles.card}>
      {/* Logo */}
      <div className={styles.logoRow}>
        <span className={styles.logoMark}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2v4m0 12v4M4 12H2m20 0h-2M5.05 5.05l2.83 2.83m8.24 8.24 2.83 2.83M18.95 5.05l-2.83 2.83M7.88 16.12l-2.83 2.83" />
            <circle cx="12" cy="12" r="2.5" fill="#fff" />
          </svg>
        </span>
        <span className={styles.logoText}>MindMesh</span>
      </div>

      <h1 className={styles.title}>Join a session</h1>
      <p className={styles.sub}>
        Paste a session ID to join a team, or create a new one instantly.
      </p>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="sessionId">
          Session ID
        </label>
        <input
          id="sessionId"
          className={styles.input}
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="e.g. demo-session"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
        />
      </div>

      <div className={styles.buttons}>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
          Join session
        </button>
        <Link href="/" className={styles.btn}>
          Back
        </Link>
      </div>

      {/* Feature pills */}
      <div className={styles.features}>
        <span className={styles.featurePill}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4m0 12v4M4 12H2m20 0h-2" /><circle cx="12" cy="12" r="2" /></svg>
          Live diagrams
        </span>
        <span className={styles.featurePill}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
          Voice-powered
        </span>
        <span className={styles.featurePill}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Real-time collab
        </span>
      </div>
    </form>
  );
}

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

    // Placeholder only for now. We still pass it through so it can be wired later.
    router.push(`/app?sessionId=${encodeURIComponent(id)}`);
  }

  return (
    <form onSubmit={onJoin} className={styles.card}>
      <h1 className={styles.title}>Join MindMesh</h1>
      <p className={styles.sub}>
        Enter any session ID.
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
          Join
        </button>
        <Link href="/" className={styles.btn}>
          Back
        </Link>
      </div>
    </form>
  );
}

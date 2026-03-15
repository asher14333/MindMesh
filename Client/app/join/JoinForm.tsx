"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./join.module.css";

const ADJECTIVES = ["Swift", "Bright", "Bold", "Cool", "Sharp", "Calm", "Quick", "Wise", "Kind", "Keen"];
const ANIMALS    = ["Fox", "Hawk", "Wolf", "Bear", "Lynx", "Owl", "Deer", "Crane", "Puma", "Raven"];

function randomDisplayName() {
  const adj    = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

function safeRandomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `session-${Math.random().toString(16).slice(2)}`;
  }
}

export default function JoinForm() {
  const router = useRouter();
  const [sessionId,    setSessionId]    = useState("");
  const [displayName,  setDisplayName]  = useState("");

  useEffect(() => {
    setSessionId(safeRandomId());
    // Reuse saved name or generate a fresh random one
    const saved = sessionStorage.getItem("mm-display-name");
    setDisplayName(saved ?? randomDisplayName());
  }, []);

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const id   = (sessionId   || "").trim() || safeRandomId();
    const name = (displayName || "").trim() || randomDisplayName();

    sessionStorage.setItem("mm-display-name", name);
    router.push(`/app?sessionId=${encodeURIComponent(id)}`);
  }

  return (
    <form onSubmit={onJoin} className={styles.card}>
      <h1 className={styles.title}>Join MindMesh</h1>
      <p className={styles.sub}>Enter a session ID to get started.</p>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="displayName">
          Display Name
        </label>
        <input
          id="displayName"
          className={styles.input}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Swift Fox"
          autoComplete="nickname"
          spellCheck={false}
        />
      </div>

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

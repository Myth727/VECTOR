// pages/index.tsx
import React, { useEffect, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import dynamic from 'next/dynamic';

// Load VECTOR client-side only — uses browser APIs
const VECTOR = dynamic(() => import('../components/VECTOR'), { ssr: false });

// ── window.storage polyfill ─────────────────────────────────────
// VECTOR uses window.storage (Claude artifact API).
// This maps it to localStorage so all persist/restore calls work unchanged.
function installStoragePolyfill() {
  if (typeof window === 'undefined') return;
  if ((window as any).storage) return; // already installed
  (window as any).storage = {
    get: async (key: string) => {
      const val = localStorage.getItem(key);
      if (val === null) throw new Error(`Key not found: ${key}`);
      return { key, value: val, shared: false };
    },
    set: async (key: string, value: string) => {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    },
    delete: async (key: string) => {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    list: async (prefix?: string) => {
      const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
      return { keys, shared: false };
    },
  };
}

const Home: NextPage = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    installStoragePolyfill();
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{
        background: '#0E1C2A', height: '100vh', width: '100vw',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Courier New, monospace', color: '#2E5070',
        fontSize: 12, letterSpacing: 2,
      }}>
        LOADING VECTOR...
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>VECTOR — Volatility-Sensitive Correction Engine</title>
        <meta name="description" content="Real-time volatility detection and correction for any sequential generative process. GARCH, Kalman, SDE, AutoTune, feedback learning — Hudson & Perry Research." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <VECTOR />
    </>
  );
};

export default Home;

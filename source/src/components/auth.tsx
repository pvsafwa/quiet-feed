import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store';
import { renderGoogleButton, hasClientId } from '../lib/auth';
import { IPlay } from './states';

export function LoadingScreen() {
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand-mark big"><IPlay /></div>
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    </div>
  );
}

export function Login() {
  const signIn = useStore(s => s.signIn);
  const btnRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (btnRef.current) {
      renderGoogleButton(btnRef.current, (cred) => signIn(cred)).catch((e) => { if (mounted) setErr(e.message); });
    }
    return () => { mounted = false; };
  }, [signIn]);

  return (
    <div className="login">
      <motion.div className="login-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="brand-mark big"><IPlay /></div>
        <h1 className="login-title">quiet <i>feed</i></h1>
        <p className="login-sub">Only your channels · no rabbit holes.<br />Sign in to see your feed and pick up where you left off.</p>
        <div ref={btnRef} className="gbtn" />
        {!hasClientId()
          ? <div className="login-warn">Google sign-in isn’t configured — the site was built without <code>VITE_GOOGLE_CLIENT_ID</code>.</div>
          : err && <div className="login-warn">{err}</div>}
        <p className="login-fine">By continuing you agree to let this app read the curated YouTube channels and save your watch progress.</p>
      </motion.div>
    </div>
  );
}

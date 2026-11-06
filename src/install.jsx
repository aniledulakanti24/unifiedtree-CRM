import React, { useEffect, useState } from 'react';
import { Badge, Btn, Card } from './ui';

// Browsers offer installing once, early, so it's caught here and kept for when someone asks.
let deferred = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });

const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export function InstallCard() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  const install = async () => {
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    tick((n) => n + 1);
  };
  const hosted = location.protocol.startsWith('http');
  return (
    <Card title="Mobile app" sub="Put the CRM on your phone or computer, with its own icon and window.">
      <div className="stack-s">
        {installed() && <div><Badge tone="good">Installed on this device</Badge></div>}
        {!installed() && deferred && <div><Btn kind="primary" icon="Download" onClick={install}>Install the app</Btn></div>}
        {!installed() && !deferred && isIos() && <div className="small">On iPhone or iPad, open this page in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</div>}
        {!installed() && !deferred && !isIos() && (hosted
          ? <div className="small">In your browser's menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On Android, use Chrome.</div>
          : <div className="small">Installing needs the CRM to be hosted on a website. It isn't available when the file is opened directly.</div>)}
        <div className="small muted">It's the same CRM, not a separate store app. Your data stays on the device you use it on until there's a server.</div>
      </div>
    </Card>
  );
}

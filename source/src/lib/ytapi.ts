// Loads YouTube's IFrame Player API once and resolves when ready.
declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}
let _p: Promise<void> | null = null;
export function ytReady(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_p) return _p;
  _p = new Promise<void>((res, rej) => {
    let settled = false;
    const fail = (msg: string) => { if (settled) return; settled = true; _p = null; rej(new Error(msg)); };
    const timer = setTimeout(() => fail('YouTube’s player took too long to load.'), 12000);
    window.onYouTubeIframeAPIReady = () => { if (settled) return; settled = true; clearTimeout(timer); res(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(timer); s.remove(); fail('Couldn’t load YouTube’s player — it may be blocked by an ad-blocker, extension, or network.'); };
    document.head.appendChild(s);
  });
  return _p;
}

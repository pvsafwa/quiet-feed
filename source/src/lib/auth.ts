// Google Identity Services (GIS) loader + sign-in button renderer.
// The client id is injected at build time via Vite (VITE_GOOGLE_CLIENT_ID).
const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;

let _loaded: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if ((window as any).google?.accounts?.id) return Promise.resolve();
  if (_loaded) return _loaded;
  _loaded = new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    s.onerror = () => { _loaded = null; rej(new Error('Could not load Google Sign-In.')); };
    document.head.appendChild(s);
  });
  return _loaded;
}

export const hasClientId = (): boolean => !!CLIENT_ID;

// Render the official Google button into `el` and call `onCredential` with the ID token.
export async function renderGoogleButton(el: HTMLElement, onCredential: (idToken: string) => void): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID at build time).');
  await loadGis();
  const g = (window as any).google;
  g.accounts.id.initialize({ client_id: CLIENT_ID, callback: (resp: any) => { if (resp?.credential) onCredential(resp.credential); } });
  el.innerHTML = '';
  g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: 280 });
}

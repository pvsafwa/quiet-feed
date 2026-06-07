// Native Google Sign-In (Android Credential Manager) — NOT a WebView, so Google permits
// it. Returns an ID token whose audience is the Web client ID, which the backend verifies.
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  configured = true;
}

export async function googleSignIn(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res: any = await GoogleSignin.signIn();
  // v13+ returns { type, data: { idToken } }; older versions return a flat object.
  const idToken: string | undefined = res?.data?.idToken ?? res?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return an ID token.');
  return idToken;
}

export async function googleSignOut(): Promise<void> {
  try { ensureConfigured(); await GoogleSignin.signOut(); } catch { /* ignore */ }
}

import { OAuth2Client } from 'google-auth-library';
import { env } from '../env';
import type { GoogleProfile } from '../repos/users';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// Verify a Google Identity Services ID token (the `credential` from the Sign-In
// button) and return the user's profile. Throws if invalid or email unverified.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Google token missing required fields');
  }
  if (payload.email_verified === false) {
    throw new Error('Google account email is not verified');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

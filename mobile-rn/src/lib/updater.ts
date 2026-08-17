import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export const CURRENT_APP_VERSION = '1.0.34';
export const CURRENT_VERSION_CODE = 38;

const SNOOZE_KEY = 'qf_update_snooze_until';
const GITHUB_REPO = 'pvsafwa/quiet-feed';
const COOL_OFF_HOURS = 24;

export interface AppRelease {
  version: string;
  name: string;
  releaseNotes: string;
  apkUrl: string;
  fileName: string;
  publishedAt: string;
}

export function compareSemver(v1: string, v2: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').trim();
  const parts1 = clean(v1).split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean(v2).split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export function isNewerVersion(current: string, candidate: string): boolean {
  return compareSemver(candidate, current) > 0;
}

export async function fetchLatestRelease(): Promise<AppRelease | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'QuietFeed-Android',
      },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const data = await res.json();
    const rawTag = (data.tag_name || '').trim();
    const cleanVersion = rawTag.replace(/^v/i, '');

    // Search for an attached .apk in the release assets
    const apkAsset = (data.assets || []).find((a: any) =>
      typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
    );

    if (!cleanVersion || !apkAsset) {
      return null;
    }

    return {
      version: cleanVersion,
      name: data.name || `Quiet Feed v${cleanVersion}`,
      releaseNotes: data.body || 'Performance improvements and bug fixes.',
      apkUrl: apkAsset.browser_download_url,
      fileName: apkAsset.name || `QuietFeed-v${cleanVersion}.apk`,
      publishedAt: data.published_at || new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[Updater] Failed to check GitHub releases:', e);
    return null;
  }
}

export async function checkForUpdate(options: { manual?: boolean } = {}): Promise<AppRelease | null> {
  // If not a manual check from Settings, verify if the user has snoozed notifications
  if (!options.manual) {
    try {
      const snoozeUntil = await AsyncStorage.getItem(SNOOZE_KEY);
      if (snoozeUntil && Date.now() < Number(snoozeUntil)) {
        return null;
      }
    } catch { /* ignore storage error */ }
  }

  const latest = await fetchLatestRelease();
  if (!latest) return null;

  if (isNewerVersion(CURRENT_APP_VERSION, latest.version)) {
    return latest;
  }

  return null;
}

export async function snoozeUpdate(hours = COOL_OFF_HOURS): Promise<void> {
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    await AsyncStorage.setItem(SNOOZE_KEY, String(until));
  } catch (e) {
    console.warn('[Updater] Failed to set snooze:', e);
  }
}

export async function clearUpdateSnooze(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SNOOZE_KEY);
  } catch { /* ignore */ }
}

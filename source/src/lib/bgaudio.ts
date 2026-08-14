/**
 * Background Audio Keepalive for Mobile Web
 *
 * Chrome on Android suspends tab audio when backgrounded UNLESS it detects
 * an active <audio> or <video> element playing at the page level.
 * YouTube's IFrame API creates its media inside a cross-origin iframe which
 * the browser doesn't count as page-level media.
 *
 * This module creates a nearly-silent <audio> element via Web Audio API
 * so Chrome recognises the tab as "playing audio" and:
 *   → keeps the tab alive when backgrounded / screen locked
 *   → shows the lock-screen / notification media controls
 *
 * Usage:
 *   bgPlay()    – call when YouTube starts playing
 *   bgPause()   – call when user explicitly pauses
 *   bgDestroy() – call when the player is closed
 */

let keepaliveAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

function ensureKeepalive(): HTMLAudioElement | null {
  if (keepaliveAudio) return keepaliveAudio;

  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;

    audioCtx = new AC();

    // 1 Hz oscillator → inaudible, but the AudioContext is "active"
    const oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 1;

    // Gain ≈ 0 so it's silent; NOT exactly 0 because some engines
    // optimise away zero-gain nodes and Chrome may not count it as active.
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001;

    oscillator.connect(gain);

    // Route into a MediaStream so we can feed it to a real <audio> element.
    const dest = audioCtx.createMediaStreamDestination();
    gain.connect(dest);
    oscillator.start();

    // The <audio> element is what Chrome monitors for "this tab has media".
    keepaliveAudio = document.createElement('audio');
    keepaliveAudio.srcObject = dest.stream;
    keepaliveAudio.loop = true;
    keepaliveAudio.volume = 0.01;
    keepaliveAudio.setAttribute('playsinline', '');

    // Must be in the DOM for some browsers to count it.
    Object.assign(keepaliveAudio.style, {
      position: 'fixed',
      top: '-9999px',
      left: '-9999px',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(keepaliveAudio);
  } catch (e) {
    console.warn('[bgaudio] init failed:', e);
    return null;
  }

  return keepaliveAudio;
}

/** Start the silent keepalive – Chrome will treat the tab as "playing audio". */
export function bgPlay() {
  const audio = ensureKeepalive();
  if (!audio) return;
  if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
  audio.play().catch(() => {});
}

/** Pause the keepalive (only when user explicitly pauses). */
export function bgPause() {
  keepaliveAudio?.pause();
}

/** Tear everything down (player closed). */
export function bgDestroy() {
  if (keepaliveAudio) {
    keepaliveAudio.pause();
    keepaliveAudio.srcObject = null;
    keepaliveAudio.remove();
    keepaliveAudio = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

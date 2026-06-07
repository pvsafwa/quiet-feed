import type { Prog, VProg, Video } from './types';
import { dkey } from './format';

export function emptyProg(): Prog { return { v: {}, day: {}, pl: {}, mon: {} }; }
export function normProg(p: any): Prog {
  p = p || {}; p.v = p.v || {}; p.day = p.day || {}; p.pl = p.pl || {}; p.mon = p.mon || {};
  return p as Prog;
}

export function ensureV(prog: Prog, id: string, dur?: number): VProg {
  const v = prog.v[id] || (prog.v[id] = { p: 0, d: 0, done: 0, w: 0, t: 0 });
  if (dur) v.d = dur;
  return v;
}
export function addWatch(prog: Prog, id: string, secs: number, dur?: number): void {
  const v = ensureV(prog, id, dur);
  v.w += secs; v.t = Date.now();
  const k = dkey();
  prog.day[k] = (prog.day[k] || 0) + secs;
}
export function setPos(prog: Prog, id: string, pos: number, dur?: number): void {
  const v = ensureV(prog, id, dur);
  if (pos > v.p) v.p = pos;
}
export function markDone(prog: Prog, id: string, dur?: number): void {
  const v = ensureV(prog, id, dur);
  v.done = 1; v.t = Date.now();
}
export function isDone(prog: Prog, id: string): boolean {
  return !!(prog.v[id] && prog.v[id].done);
}
export function vpct(prog: Prog, id: string): number {
  const v = prog.v[id];
  if (!v) return 0;
  if (v.done) return 100;
  return v.d ? Math.min(100, Math.round((v.p / v.d) * 100)) : 0;
}
export function registerPlaylist(
  prog: Prog,
  p: { id: string; title: string; channelTitle: string; channelId?: string },
  vids: Video[],
): number {
  const ids = vids.map(v => v.id);
  let tot = 0;
  vids.forEach(v => { ensureV(prog, v.id, v.seconds); tot += v.seconds || 0; });
  const prev = prog.pl[p.id] || ({} as any);
  prog.pl[p.id] = { ids, total: tot, title: p.title, channel: p.channelTitle, channelId: p.channelId || prev.channelId };
  return tot;
}
export function isMon(prog: Prog, id: string): boolean { return !!prog.mon[id]; }

export function streaks(prog: Prog): { cur: number; max: number } {
  const set = new Set(Object.keys(prog.day).filter(d => prog.day[d] > 0));
  if (!set.size) return { cur: 0, max: 0 };
  let cur = 0; const d = new Date();
  if (!set.has(dkey(d))) d.setDate(d.getDate() - 1);
  while (set.has(dkey(d))) { cur++; d.setDate(d.getDate() - 1); }
  const sorted = [...set].sort();
  let max = 0, run = 0, prev: string | null = null;
  for (const k of sorted) {
    if (prev) { const pn = new Date(prev + 'T00:00:00'); pn.setDate(pn.getDate() + 1); run = dkey(pn) === k ? run + 1 : 1; }
    else run = 1;
    if (run > max) max = run;
    prev = k;
  }
  return { cur, max };
}
export function lastDays(prog: Prog, n: number): { key: string; sec: number }[] {
  const out: { key: string; sec: number }[] = [];
  const t = new Date();
  for (let i = n - 1; i >= 0; i--) { const x = new Date(t); x.setDate(t.getDate() - i); out.push({ key: dkey(x), sec: prog.day[dkey(x)] || 0 }); }
  return out;
}
export function totals(prog: Prog): { spent: number; done: number; doneN: number; started: number } {
  let spent = 0, done = 0, doneN = 0, started = 0;
  for (const id in prog.v) {
    const v = prog.v[id];
    spent += v.w || 0;
    if (v.done) { done += v.d || 0; doneN++; }
    else if (v.p > 15) started++;
  }
  return { spent, done, doneN, started };
}

// Pure formatting helpers — ported from the frontend so server and client agree.
export function iso2sec(iso?: string): number {
  const m = (iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
export function fmtDur(sec?: number): string {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export function bestThumb(t: any): string {
  return (t?.maxres || t?.standard || t?.high || t?.medium || t?.default || {}).url || '';
}

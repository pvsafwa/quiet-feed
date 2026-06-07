// Pure formatting helpers — ported verbatim from the web app.
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
export function fmtTotal(sec?: number): string {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return '<1m';
}
export function fmtSpan(sec?: number): string {
  sec = Math.round(sec || 0);
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return '<1m';
}
export function ago(d: string): string {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const u: [string, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [n, sec] of u) { const v = Math.floor(s / sec); if (v >= 1) return `${v} ${n}${v > 1 ? 's' : ''} ago`; }
  return 'just now';
}
export function views(n?: number): string {
  if (n == null) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M views';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K views';
  return n + ' views';
}
export function dkey(dt = new Date()): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

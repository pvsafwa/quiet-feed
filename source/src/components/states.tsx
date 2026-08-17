import React from 'react';

type P = React.SVGProps<SVGSVGElement>;
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IPlay = (p: P) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5v14l11-7z" /></svg>;
export const IPause = (p: P) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>;
export const IList = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M3 6h13M3 12h13M3 18h9M17 13l4 2.5-4 2.5z" /></svg>;
export const IRefresh = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
export const IGear = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
export const IStar = ({ filled, ...p }: P & { filled?: boolean }) => <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" {...p}><path d="M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 18l-6.3 3.2L7 14.2l-5-4.8 7-.9z" /></svg>;
export const ICheck = (p: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5" /></svg>;
export const IBack = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;
export const IClose = (p: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const ITv = (p: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...p}><rect x="2" y="7" width="20" height="15" rx="2" /><path d="m17 2-5 5-5-5" /></svg>;
export const IKey = (p: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>;
export const IChart = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg>;
export const IAlert = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.5" /></svg>;
export const IMenu = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
export const IPlus = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const IVideo = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3z" /></svg>;
export const IVideoOff = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 .5-1.3M10 6h4a2 2 0 0 1 2 2v2.5M22 8l-4 3v-1M2 2l20 20" /></svg>;
export const IMusic = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
export const IPip = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor" stroke="none" /></svg>;
export const IExpand = (p: P) => <svg viewBox="0 0 24 24" {...stroke} {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>;

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="state">
      <div className="ic">{icon}</div>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

// Catches render errors in any view so a single glitch can't blank the whole app.
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[Quiet Feed] view crashed', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="state">
          <div className="ic"><IAlert /></div>
          <h2>That view hit a snag</h2>
          <p>Nothing was lost — your key, channels and progress are safe. Jump back and keep going.</p>
          <button className="btn primary" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Back to videos</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Skeleton() {
  return (
    <div className="grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="card skeleton" key={i}>
          <div className="thumb" />
          <div className="meta"><div style={{ flex: 1 }}><div className="ln" style={{ marginTop: 13 }} /><div className="ln s" /></div></div>
        </div>
      ))}
    </div>
  );
}

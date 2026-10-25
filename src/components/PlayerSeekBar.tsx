import React, { useRef, useState } from 'react';

/** Keep the native range interaction intact and send one seek when a drag ends. */
export default function PlayerSeekBar({ position, duration, seek, progress }: {
  position: number; duration: number; seek: (seconds: number) => void; progress: number;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const active = useRef(false);
  const value = useRef(0);
  const limit = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    seek(Math.max(0, Math.min(value.current, limit)));
    setDraft(null);
  };
  return <input aria-label="موقعیت پخش" type="range" min="0" max={limit || 1} step="0.1"
    value={draft ?? Math.max(0, Math.min(position, limit))} disabled={!limit} dir="ltr"
    style={{ '--ritmo-progress': `${draft === null ? progress : draft / (limit || 1) * 100}%`, touchAction: 'none', height: 44 } as React.CSSProperties}
    className="ritmo-seek flex-1 min-w-0 accent-amber-400"
    onPointerDown={event => { if (limit) { active.current = true; value.current = Number(event.currentTarget.value); event.currentTarget.setPointerCapture(event.pointerId); } }}
    onPointerUp={finish} onPointerCancel={() => { active.current = false; setDraft(null); }}
    onChange={event => {
      const next = Math.max(0, Math.min(Number(event.currentTarget.value), limit));
      value.current = next;
      if (active.current) setDraft(next); else seek(next);
    }}
    onKeyUp={event => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
        value.current = Number(event.currentTarget.value);
        if (!active.current) seek(value.current);
      }
    }} />;
}

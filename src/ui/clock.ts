/** Tempo no relógio da mesa: "0:07", "12:30" e, passando de uma hora, "1:02:05". */
export function turnTimeText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

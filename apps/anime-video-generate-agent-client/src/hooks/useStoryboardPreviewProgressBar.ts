import { useEffect, useRef, useState } from "react";

function creepCeiling(confirmed: number): number {
  if (confirmed >= 100) return 100;
  if (confirmed >= 93) return 99;
  if (confirmed >= 72) return 91;
  if (confirmed >= 42) return 70;
  if (confirmed >= 18) return 40;
  return 13;
}

export type PreviewProgressOptions = {
  stallMs: number;
  creepAheadCap: number;
  creepPerSecond: number;
  catchUpMs: number;
  tickMs: number;
};

const DEFAULT_OPTS: PreviewProgressOptions = {
  stallMs: 5200,
  creepAheadCap: 11,
  creepPerSecond: 2.0,
  catchUpMs: 520,
  tickMs: 110,
};

export function useStoryboardPreviewProgressBar(
  serverProgress: number | null,
  active: boolean,
  options?: Partial<PreviewProgressOptions>
): number {
  const { stallMs, creepAheadCap, creepPerSecond, catchUpMs, tickMs } = { ...DEFAULT_OPTS, ...options };

  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const committedRef = useRef(0);
  const lastServerEventAtRef = useRef(0);
  const catchUpRafRef = useRef(0);
  const catchUpRunningRef = useRef(false);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(catchUpRafRef.current);
      catchUpRunningRef.current = false;
      committedRef.current = 0;
      lastServerEventAtRef.current = 0;
      displayRef.current = 0;
      setDisplay(0);
      return;
    }
    lastServerEventAtRef.current = Date.now();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (serverProgress == null) return;

    const next = Math.min(100, Math.max(0, serverProgress));
    const prev = committedRef.current;
    if (next + 0.4 < prev) return;

    const isDuplicateMilestone = prev > 0 && Math.abs(next - prev) < 0.06;
    if (isDuplicateMilestone) return;

    lastServerEventAtRef.current = Date.now();
    committedRef.current = next;

    const from = displayRef.current;
    if (next <= from + 0.35 && !(prev === 0 && next > 0)) return;

    cancelAnimationFrame(catchUpRafRef.current);
    catchUpRunningRef.current = true;
    const t0 = performance.now();
    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

    const tickCatchUp = (now: number) => {
      const u = Math.min(1, (now - t0) / catchUpMs);
      const v = from + (next - from) * easeOutQuad(u);
      displayRef.current = v;
      setDisplay(v);
      if (u < 1) {
        catchUpRafRef.current = requestAnimationFrame(tickCatchUp);
      } else {
        catchUpRunningRef.current = false;
      }
    };
    catchUpRafRef.current = requestAnimationFrame(tickCatchUp);

    return () => cancelAnimationFrame(catchUpRafRef.current);
  }, [active, catchUpMs, serverProgress]);

  useEffect(() => {
    if (!active) return;
    const tickSec = tickMs / 1000;
    const id = window.setInterval(() => {
      if (catchUpRunningRef.current) return;

      const stalled = Date.now() - lastServerEventAtRef.current > stallMs;
      if (stalled) return;

      const confirmed = committedRef.current;
      const plateau = creepCeiling(confirmed);
      const softCap = Math.min(confirmed + creepAheadCap, plateau, 100);

      let d = displayRef.current;
      if (d >= softCap - 0.03) return;

      d += creepPerSecond * tickSec;
      d = Math.min(d, softCap);
      displayRef.current = d;
      setDisplay(d);
    }, tickMs);
    return () => clearInterval(id);
  }, [active, creepAheadCap, creepPerSecond, stallMs, tickMs]);

  return active ? display : 0;
}

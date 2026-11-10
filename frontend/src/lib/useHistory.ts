import { useCallback, useRef, useState } from "react";

/**
 * State with undo/redo. `set(fn, group)` records an undo step; rapid changes with the same `group`
 * (dragging, typing, sliders) are merged into one step.
 */
export function useHistory<T>(initial: T | (() => T)) {
  const [state, setState] = useState<T>(initial);
  const cur = useRef(state);
  cur.current = state;
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<{ group: string | null; at: number }>({ group: null, at: 0 });
  const [, bump] = useState(0);

  const set = useCallback((fn: (s: T) => T, group: string | null = null) => {
    const now = Date.now();
    const merge = group !== null && last.current.group === group && now - last.current.at < 1200;
    if (!merge) {
      past.current.push(cur.current);
      if (past.current.length > 80) past.current.shift();
      future.current = [];
    }
    last.current = { group, at: now };
    const next = fn(cur.current);
    cur.current = next;
    setState(next);
    bump((n) => n + 1);
  }, []);

  /** Replace without recording an undo step (e.g. background re-render of text). */
  const replace = useCallback((fn: (s: T) => T) => {
    const next = fn(cur.current);
    cur.current = next;
    setState(next);
  }, []);

  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    cur.current = value;
    setState(value);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(cur.current);
    last.current = { group: null, at: 0 };
    cur.current = prev;
    setState(prev);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(cur.current);
    last.current = { group: null, at: 0 };
    cur.current = next;
    setState(next);
    bump((n) => n + 1);
  }, []);

  return { state, set, replace, reset, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, current: cur };
}

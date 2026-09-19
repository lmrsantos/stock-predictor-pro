// hooks/useMyTickers.ts
// The user's own ticker list for Quant Moment. Stored on the device only —
// no account required, nothing sent anywhere. Shared across mounted
// components through a tiny subscription so every view stays in sync.

import { useCallback, useEffect, useState } from "react";

const KEY = "qm_my_tickers";
const MAX = 30;

type Listener = (list: string[]) => void;
const listeners = new Set<Listener>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string" && t.length > 0);
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Private-mode storage failures must never break a lookup.
  }
  const next = read();
  listeners.forEach((l) => l(next));
}

export function useMyTickers() {
  const [list, setList] = useState<string[]>(read);

  useEffect(() => {
    const listener: Listener = (next) => setList(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const add = useCallback((symbol: string) => {
    const s = symbol.toUpperCase();
    const current = read();
    if (current.includes(s)) return;
    write([s, ...current]);
  }, []);

  const remove = useCallback((symbol: string) => {
    const s = symbol.toUpperCase();
    write(read().filter((t) => t !== s));
  }, []);

  const toggle = useCallback((symbol: string) => {
    const s = symbol.toUpperCase();
    const current = read();
    if (current.includes(s)) write(current.filter((t) => t !== s));
    else write([s, ...current]);
  }, []);

  const has = useCallback((symbol: string) => list.includes(symbol.toUpperCase()), [list]);

  return { list, add, remove, toggle, has, max: MAX };
}

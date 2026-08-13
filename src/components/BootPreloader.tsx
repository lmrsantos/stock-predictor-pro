import { useEffect, useRef, useState } from "react";

/**
 * Terminal-style boot overlay shown once per browser session on the landing page.
 *
 * IMPORTANT: every value below is STATIC MARKETING COPY. It is deliberately not
 * wired to the database — the preloader must never block on a fetch. If a number
 * changes materially (symbol count, linkage count), edit it here by hand.
 */
const LINES: { text: string; value: string; amber?: boolean }[] = [
  { text: "loading price history", value: "227 symbols · 13 sectors" },
  { text: "validating cross-sector linkages", value: "22 pairs" },
  { text: "scoring models out-of-sample", value: "12 rolling windows" },
  { text: "checking setup base rates", value: "0 of 290 clear the bar today", amber: true },
  { text: "market regime", value: "late-cycle · caution", amber: true },
  { text: "terminal ready", value: "" },
];

const STEP_MS = 240;
const FADE_MS = 500;
const SESSION_KEY = "qf_booted";

export function BootPreloader({ onDone }: { onDone?: () => void }) {
  const alreadyBooted = useRef<boolean>(
    typeof window === "undefined" || sessionStorage.getItem(SESSION_KEY) === "1",
  );
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [visible, setVisible] = useState(!alreadyBooted.current && !reduced);
  const [fading, setFading] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!visible) {
      onDone?.();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");

    const timers: number[] = [];
    LINES.forEach((_, i) => {
      timers.push(window.setTimeout(() => setShown(i + 1), i * STEP_MS));
    });
    // total sequence: 6 * 240ms = 1440ms, + 500ms fade = 1.94s
    timers.push(window.setTimeout(() => setFading(true), LINES.length * STEP_MS));
    timers.push(
      window.setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, LINES.length * STEP_MS + FADE_MS),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const pct = Math.round((shown / LINES.length) * 100);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07071a]"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <div className="w-full max-w-xl px-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500" />
          <span className="font-bold tracking-tight text-white">QuantForecast</span>
        </div>

        <div className="font-mono text-[12px] sm:text-[13px] space-y-1.5 min-h-[150px]">
          {LINES.map((l, i) => {
            const on = i < shown;
            const isLast = i === LINES.length - 1;
            return (
              <div
                key={l.text}
                className="flex flex-wrap items-baseline gap-x-3"
                style={{
                  opacity: on ? 1 : 0,
                  transform: on ? "translateY(0)" : "translateY(4px)",
                  transition: "opacity 200ms ease-out, transform 200ms ease-out",
                }}
              >
                <span className="text-emerald-400">›</span>
                <span className="text-white/70">{l.text}</span>
                {l.value && (
                  <span className={l.amber ? "text-amber-400" : "text-white/70"}>
                    {l.value}
                  </span>
                )}
                {isLast && <span className="text-emerald-400">✓</span>}
              </div>
            );
          })}
        </div>

        <div className="mt-8 h-[2px] w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 to-fuchsia-400"
            style={{ width: `${pct}%`, transition: `width ${STEP_MS}ms linear` }}
          />
        </div>
      </div>
    </div>
  );
}

export default BootPreloader;

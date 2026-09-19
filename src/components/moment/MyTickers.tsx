// components/moment/MyTickers.tsx
// "My tickers" — the list the user chose to follow, kept on their device.
// Prices are live market quotes, refreshed while the screen is open; when a
// quote can't be reached the row says so instead of showing a stale number.

import { useRef, useState } from "react";

import { ChevronRight, Star, Trash2 } from "lucide-react";
import { useMyTickers } from "@/hooks/useMyTickers";
import { useMomentQuotes } from "@/hooks/useMomentQuotes";
import { Button } from "@/components/ui/button";

interface Quote {
  close: number;
  changePct: number | null;
  extendedPrice: number | null;
  extendedLabel: string | null;
}

const ACTION_WIDTH = 88;
const OPEN_THRESHOLD = 36;

interface SwipeTickerRowProps {
  symbol: string;
  quote?: Quote;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: () => void;
  onRemove: () => void;
}

function SwipeTickerRow({
  symbol,
  quote,
  isOpen,
  onOpen,
  onClose,
  onSelect,
  onRemove,
}: SwipeTickerRowProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  const restingOffset = isOpen ? -ACTION_WIDTH : 0;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    dragging.current = true;
    moved.current = false;
    setDragOffset(restingOffset);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const deltaX = event.clientX - startX.current;
    const deltaY = event.clientY - startY.current;
    if (!moved.current && Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) > 6) moved.current = true;
    const next = Math.max(-ACTION_WIDTH, Math.min(0, restingOffset + deltaX));
    setDragOffset(next);
  };

  const finishGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragOffset <= -OPEN_THRESHOLD) onOpen();
    else onClose();
    setDragOffset(0);
  };

  const handleClick = () => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (isOpen) {
      onClose();
      return;
    }
    onSelect();
  };

  return (
    <li className="relative min-h-[56px] overflow-hidden">
      <Button
        type="button"
        variant="destructive"
        onClick={onRemove}
        aria-label={`Remove ${symbol} from My tickers`}
        className="absolute inset-y-0 right-0 h-full w-[88px] rounded-none px-2"
      >
        <span className="flex flex-col items-center gap-1 text-xs">
          <Trash2 className="h-4 w-4" />
          Remove
        </span>
      </Button>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${symbol}. Swipe left to remove.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className={`relative z-10 flex min-h-[56px] w-full touch-pan-y select-none items-center gap-3 px-3 py-3 text-left transition-[background-color,transform] duration-200 ease-out bg-card active:bg-primary/10`}
        style={{ transform: `translateX(${dragging.current ? dragOffset : restingOffset}px)` }}
      >


        <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{symbol}</span>
        {quote ? (
          <span className="shrink-0 text-right">
            <span className="block text-sm font-semibold tabular-nums text-foreground">
              ${quote.close.toFixed(2)}
            </span>
            {quote.changePct !== null && (
              <span
                className={`block text-[11px] font-semibold tabular-nums ${
                  quote.changePct >= 0 ? "text-primary" : "text-destructive"
                }`}
              >
                {quote.changePct >= 0 ? "+" : ""}
                {quote.changePct.toFixed(2)}%
              </span>
            )}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">No price on file</span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </li>
  );
}

export function MyTickers({ onSelect }: { onSelect: (symbol: string) => void }) {
  const { list, remove } = useMyTickers();
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const { quotes: live } = useMomentQuotes(list);

  const quotes: Record<string, Quote> = {};
  for (const symbol of list) {
    const q = live[symbol];
    if (!q || !Number.isFinite(q.price)) continue;
    quotes[symbol] = {
      close: q.price,
      changePct: q.changePct ?? null,
      extendedPrice: q.extendedPrice ?? null,
      extendedLabel: q.extendedLabel ?? null,
    };
  }


  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-3 pt-3">
        <h2 className="text-sm font-semibold text-foreground">My tickers</h2>
        <p className="text-[11px] text-muted-foreground">
          {list.length === 0
            ? "Open a ticker and tap the star to follow it here."
            : "Tap one to check the read. Swipe left to remove."}
        </p>
      </div>

      {list.length === 0 && (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
          <Star className="h-4 w-4 shrink-0" /> Nothing followed yet.
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {list.map((symbol) => {
            const q = quotes[symbol];
            return (
              <SwipeTickerRow
                key={symbol}
                symbol={symbol}
                quote={q}
                isOpen={openSymbol === symbol}
                onOpen={() => setOpenSymbol(symbol)}
                onClose={() => setOpenSymbol(null)}
                onSelect={() => onSelect(symbol)}
                onRemove={() => {
                  remove(symbol);
                  setOpenSymbol(null);
                }}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

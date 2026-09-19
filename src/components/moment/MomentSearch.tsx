// components/moment/MomentSearch.tsx
// One large search field. 44px+ targets, no hover-only behaviour.

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Result {
  symbol: string;
  name?: string;
  exchange?: string;
}

export interface MomentSearchHandle {
  clear: () => void;
}

export const MomentSearch = forwardRef<MomentSearchHandle, { onSelect: (symbol: string) => void }>(
  function MomentSearch({ onSelect }, ref) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (debounce.current) clearTimeout(debounce.current);
      setValue("");
      setResults([]);
      setLoading(false);
    },
  }));

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-ticker", { body: { query: q } });
      if (!error && data?.results) setResults(data.results.slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const pick = (symbol: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    setValue(symbol);
    setResults([]);
    setLoading(false);
    onSelect(symbol.toUpperCase());
  };

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) pick(value.trim());
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={value}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setValue(v);
              if (debounce.current) clearTimeout(debounce.current);
              debounce.current = setTimeout(() => search(v), 250);
            }}
            placeholder="Enter a ticker — AAPL, CSX, JOBY"
            inputMode="text"
            autoCapitalize="characters"
            className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search a ticker"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
      </form>

      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <li key={`${r.symbol}-${r.exchange ?? ""}`}>
              <button
                onClick={() => pick(r.symbol)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-3 text-left"
              >
                <span className="text-sm font-semibold text-foreground">{r.symbol}</span>
                <span className="truncate text-xs text-muted-foreground">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

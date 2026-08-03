import { useState, useRef, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface TickerSearchProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (ticker: string) => void;
}

export function TickerSearch({ value, onChange, onSelect }: TickerSearchProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-ticker", {
        body: { query },
      });

      if (!error && data?.results) {
        setResults(data.results);
        setIsOpen(data.results.length > 0);
        setActiveIndex(-1);
      }
    } catch {
      // Silently fail — user can still type ticker directly
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    const upper = val.toUpperCase();
    onChange(upper);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 250);
  };

  const handleSelect = (symbol: string) => {
    onChange(symbol);
    setIsOpen(false);
    setResults([]);
    onSelect(symbol);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Enter") {
        onSelect(value.trim().toUpperCase());
        setIsOpen(false);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex].symbol);
        } else {
          onSelect(value.trim().toUpperCase());
          setIsOpen(false);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="AAPL or Apple"
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono input-focus placeholder:text-muted-foreground"
        />
        <button
          onClick={() => {
            onSelect(value.trim().toUpperCase());
            setIsOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-[100] top-full mt-1 w-full min-w-[280px] bg-popover border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-sm ${
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              }`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => handleSelect(r.symbol)}
            >
              <span className="font-mono font-semibold text-primary min-w-[60px]">
                {r.symbol}
              </span>
              <span className="text-muted-foreground truncate text-xs flex-1">
                {r.name}
              </span>
              <span className="text-[10px] text-muted-foreground/60 uppercase">
                {r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
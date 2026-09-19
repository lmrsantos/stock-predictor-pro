// components/moment/MomentSearch.tsx
// One large search field. 44px+ targets, no hover-only behaviour.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Search, Loader2, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface SpeechRecognitionResultEvent {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function normalizeSpokenTicker(transcript: string) {
  const trimmed = transcript.trim().toUpperCase();
  const pieces = trimmed.split(/[\s.-]+/).filter(Boolean);
  if (pieces.length > 1 && pieces.every((piece) => piece.length === 1)) return pieces.join("");
  return trimmed;
}

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
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(() => typeof window !== "undefined" && Boolean(getSpeechRecognition()));
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const recognition = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => () => recognition.current?.stop(), []);

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

  const listen = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    const instance = new Recognition();
    recognition.current = instance;
    instance.continuous = false;
    instance.interimResults = false;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (!transcript) return;
      const ticker = normalizeSpokenTicker(transcript);
      setValue(ticker);
      void search(ticker);
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);
    setListening(true);
    instance.start();
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
            placeholder="Search symbols"
            inputMode="text"
            autoCapitalize="characters"
            className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search a ticker"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          {speechSupported && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={listen}
              aria-label={listening ? "Stop listening" : "Search by voice"}
              aria-pressed={listening}
              className={listening ? "text-primary" : "text-muted-foreground"}
            >
              <Mic className={listening ? "h-5 w-5 animate-pulse" : "h-5 w-5"} />
            </Button>
          )}
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
);

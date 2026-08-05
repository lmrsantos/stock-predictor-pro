// hooks/useForecastability.ts
// Conditioning profile (volatility / listing-age bucket + forecastability note)
// for one symbol. Shares the session-cached base-rate pipeline.

import { useEffect, useState } from "react";
import {
  runBaseRatePipeline, makeSymbolSeries,
} from "@/lib/base-rate-pipeline";
import { profileForSymbol } from "@/lib/setup-detector";
import type { ConditioningProfile } from "@/lib/conditioned-base-rates";

export function useForecastability(
  symbol: string,
  dates: string[],
  closes: number[],
  sector?: string,
): ConditioningProfile | null {
  const [profile, setProfile] = useState<ConditioningProfile | null>(null);

  useEffect(() => {
    if (!symbol || closes.length < 60) { setProfile(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const pipeline = await runBaseRatePipeline();
        const series = makeSymbolSeries(symbol, dates, closes, sector);
        if (!cancelled) setProfile(profileForSymbol(series, pipeline.volCuts));
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, sector, dates, closes]);

  return profile;
}

import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

/**
 * Persistent disclaimer shown on every page.
 * QuantForecast is NOT a registered investment adviser. All output
 * is educational/informational only — never a recommendation to buy,
 * sell, or hold any security.
 */
export function DisclaimerBar() {
  return (
    <div className="w-full bg-amber-950/40 border-b border-amber-900/40 px-3 py-1.5 flex items-center justify-center gap-2 text-[10px] font-mono text-amber-200/90">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      <span className="text-center leading-tight">
        For informational and educational purposes only. Not investment advice.
        QuantForecast is not a registered investment adviser.{" "}
        <Link to="/terms" className="underline hover:text-amber-100">
          Terms
        </Link>{" "}
        ·{" "}
        <Link to="/disclaimer" className="underline hover:text-amber-100">
          Full Disclaimer
        </Link>
      </span>
    </div>
  );
}

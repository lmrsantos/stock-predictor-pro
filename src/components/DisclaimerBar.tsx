import { Link, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

/**
 * Persistent disclaimer shown on every page.
 * QuantForecast is NOT a registered investment adviser. All output
 * is educational/informational only — never a recommendation to buy,
 * sell, or hold any security.
 */
export function DisclaimerBar() {
  const location = useLocation();
  // Tell legal pages where to send the user back to, so a Quant Moment
  // visitor never gets bounced into the terminal.
  const backState = { state: { from: location.pathname } };

  return (
    <div className="w-full shrink-0 bg-amber-950/40 border-t border-amber-900/40 px-3 py-1.5 flex items-center justify-center gap-2 text-[10px] font-mono text-amber-200/90">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      <span className="text-center leading-tight">
        For informational and educational purposes only. Not investment advice.
        QuantForecast is not a registered investment adviser.{" "}
        <Link to="/terms" {...backState} className="underline hover:text-amber-100">
          Terms
        </Link>{" "}
        ·{" "}
        <Link to="/disclaimer" {...backState} className="underline hover:text-amber-100">
          Full Disclaimer
        </Link>
      </span>
    </div>
  );
}

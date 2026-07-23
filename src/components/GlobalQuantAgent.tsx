import { useLocation, useNavigate } from "react-router-dom";
import { QuantAgent } from "./QuantAgent";

// Routes where QuantAgent is already mounted with rich page context,
// or where it should not appear (auth flows).
const EXCLUDED_PATHS = ["/terminal", "/auth", "/.lovable/oauth/consent"];

export function GlobalQuantAgent() {
  const location = useLocation();
  const navigate = useNavigate();

  if (EXCLUDED_PATHS.some((p) => location.pathname.startsWith(p))) {
    return null;
  }

  return (
    <QuantAgent
      context={{ ticker: "^GSPC" }}
      onAction={(a) => {
        if (a.kind === "switch_ticker") {
          navigate(`/terminal?ticker=${encodeURIComponent(a.symbol)}`);
        } else if (a.kind === "navigate") {
          navigate(a.path);
        } else if (a.kind === "open") {
          if (a.target === "hot_stocks") navigate("/terminal?open=hot_stocks");
          else if (a.target === "sentiment") navigate("/terminal?open=sentiment");
          else if (a.target === "backtest") navigate("/terminal?open=backtest");
        }
      }}
    />
  );
}

import { FitPoint, PredictionPoint } from "@/lib/types";
import { formatPrice } from "@/lib/regression";

interface DataTableProps {
  historicalFit: FitPoint[];
  predictions: PredictionPoint[];
}

export function DataTable({ historicalFit, predictions }: DataTableProps) {
  // Show last 20 historical + all predictions
  const recentHistory = historicalFit.slice(-20);

  return (
    <div className="chart-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Date</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Actual</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Regression</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">Residual</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">68% Low</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">68% High</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">95% Low</th>
              <th className="text-right px-4 py-3 font-bold uppercase tracking-widest text-[10px]">95% High</th>
            </tr>
          </thead>
          <tbody>
            {recentHistory.map((row) => (
              <tr key={row.date} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground">{row.date}</td>
                <td className="px-4 py-2.5 text-right">${formatPrice(row.actual)}</td>
                <td className="px-4 py-2.5 text-right text-primary">${formatPrice(row.fitted)}</td>
                <td className={`px-4 py-2.5 text-right ${row.residual >= 0 ? "price-positive" : "price-negative"}`}>
                  {row.residual >= 0 ? "+" : ""}{formatPrice(row.residual)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.lower1Sigma)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.upper1Sigma)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.lower2Sigma)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.upper2Sigma)}</td>
              </tr>
            ))}

            {/* Forecast section */}
            {predictions.length > 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-2 text-[10px] uppercase tracking-widest text-primary font-bold bg-primary/5">
                  Forecast
                </td>
              </tr>
            )}

            {predictions.map((row) => (
              <tr key={row.date} className="border-b border-border/50 hover:bg-accent/30 transition-colors bg-primary/[0.02]">
                <td className="px-4 py-2.5 text-muted-foreground">{row.date}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
                <td className="px-4 py-2.5 text-right text-primary">${formatPrice(row.predicted)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.lower1Sigma)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.upper1Sigma)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.lower2Sigma)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">${formatPrice(row.upper2Sigma)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { SectorBacktest } from "@/components/SectorBacktest";

export default function SectorBacktestPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase">Sector Backtest</h1>
        </div>
      </header>
      <main className="flex-1 p-6 overflow-hidden">
        <SectorBacktest inline />
      </main>
    </div>
  );
}

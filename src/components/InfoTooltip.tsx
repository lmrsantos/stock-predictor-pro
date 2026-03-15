import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface InfoTooltipProps {
  title: string;
  what: string;
  howToRead: string;
}

export function InfoTooltip({ title, what, howToRead }: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted hover:bg-accent transition-colors ml-1 align-middle"
          aria-label={`Learn about ${title}`}
        >
          <Info className="w-2.5 h-2.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-3 space-y-2 text-xs"
      >
        <div className="font-semibold text-foreground text-sm">{title}</div>
        <div>
          <span className="font-medium text-primary">What is it?</span>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">{what}</p>
        </div>
        <div>
          <span className="font-medium text-primary">How to read it</span>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">{howToRead}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Centralized definitions for all metrics
export const metricInfo = {
  price: {
    title: "Stock Price",
    what: "The most recent closing price of one share of this stock.",
    howToRead: "This is how much it costs to buy one share right now. The change shown next to it tells you how much the price moved since yesterday.",
  },
  dailyChange: {
    title: "Daily Change",
    what: "How much the stock price moved compared to the previous trading day, in dollars and as a percentage.",
    howToRead: "Green (+) means the price went up. Red (−) means it went down. A 2% daily move is considered significant for most stocks.",
  },
  peRatio: {
    title: "P/E Ratio (Price-to-Earnings)",
    what: "The stock price divided by the company's earnings per share over the last 12 months. It shows how much investors are willing to pay per dollar of profit.",
    howToRead: "A P/E of 20 means investors pay $20 for every $1 of earnings. Lower P/E may suggest a stock is undervalued (or has low growth). Higher P/E can indicate high growth expectations. Compare within the same industry for best results.",
  },
  forwardPE: {
    title: "Forward P/E",
    what: "Like the P/E ratio, but uses analysts' estimated future earnings instead of past earnings.",
    howToRead: "If forward P/E is lower than trailing P/E, analysts expect earnings to grow. If higher, they expect earnings to decline.",
  },
  eps: {
    title: "EPS (Earnings Per Share)",
    what: "The company's total net profit divided by the number of shares outstanding. It tells you how much profit each share earned over the last 12 months.",
    howToRead: "Higher EPS means the company is more profitable per share. Growing EPS over time is generally a positive sign. Compare with the stock price (via P/E) to judge if it's reasonably priced.",
  },
  marketCap: {
    title: "Market Capitalization",
    what: "The total value of all the company's shares combined (price × number of shares). It indicates the company's overall size.",
    howToRead: "Mega-cap ($200B+) = very large, established companies. Large-cap ($10-200B) = well-known companies. Mid/Small-cap = smaller, potentially higher growth but more risk.",
  },
  dividendYield: {
    title: "Dividend Yield",
    what: "The annual dividend payment as a percentage of the stock price. It shows how much income you earn just by holding the stock.",
    howToRead: "A 2% yield means you'd earn $2/year for every $100 invested. Higher yield = more income, but very high yields (>8%) can signal financial trouble. Many growth companies pay no dividend.",
  },
  fiftyTwoWeekRange: {
    title: "52-Week Range",
    what: "The lowest and highest prices this stock has traded at over the past year.",
    howToRead: "If the current price is near the 52-week high, the stock has been performing well. Near the low may indicate a buying opportunity — or ongoing problems. Use alongside other metrics.",
  },
  sector: {
    title: "Sector & Industry",
    what: "The economic sector (e.g., Technology, Healthcare) and specific industry the company operates in.",
    howToRead: "Use this to compare the stock with similar companies. Stocks within the same sector tend to move together during market shifts.",
  },
  rSquared: {
    title: "R² (R-Squared)",
    what: "A statistical measure (0 to 1) of how well the straight trend line fits the actual price data. It shows how \"linear\" or predictable the stock's movement has been.",
    howToRead: "R² > 0.7 = strong linear trend (price moved in a steady direction). R² 0.4–0.7 = moderate trend. R² < 0.4 = the price was choppy and a straight line doesn't describe it well. Higher R² means the forecast is more reliable.",
  },
  slope: {
    title: "Slope ($/day)",
    what: "The average daily price change according to the trend line. It's the 'speed' at which the stock price has been rising or falling.",
    howToRead: "Positive slope = uptrend (price rising over time). Negative = downtrend. For example, +0.15 means the stock gained about $0.15 per day on average over the analysis period.",
  },
  stdDeviation: {
    title: "Standard Deviation (σ)",
    what: "A measure of how much the actual price typically deviates from the trend line. Think of it as the stock's 'volatility' or 'wobbliness'.",
    howToRead: "Larger σ = more volatile and unpredictable. Smaller σ = the price stayed close to the trend. About 68% of prices fall within ±1σ of the trend, and 95% within ±2σ.",
  },
  annualReturn: {
    title: "Implied Annual Return",
    what: "The trend line's slope extrapolated to one year, expressed as a percentage. It estimates how much the stock would gain or lose if the current trend continues.",
    howToRead: "This is NOT a guarantee — it's what would happen if the recent trend continued perfectly. Compare with the R² value: high R² makes this estimate more meaningful.",
  },
  oneSigmaBand: {
    title: "1σ Band (68% Confidence)",
    what: "The shaded area where the stock price is expected to fall about 68% of the time, based on historical volatility around the trend.",
    howToRead: "If the price is within this band, it's behaving normally. If it breaks outside, it may signal an unusually strong move up or down.",
  },
  twoSigmaBand: {
    title: "2σ Band (95% Confidence)",
    what: "The wider shaded area where the stock price is expected to fall about 95% of the time. Prices rarely go beyond this range.",
    howToRead: "If the price touches or breaks the 2σ boundary, it's a statistically rare event — often signaling a major move, potential reversal, or unusual news.",
  },
  regressionLine: {
    title: "Regression Line",
    what: "A straight \"best fit\" line through the historical prices. It represents the overall trend direction, ignoring daily ups and downs.",
    howToRead: "The line going up = overall uptrend. Going down = downtrend. The steeper the line, the stronger the trend. In the forecast zone, it extends to show where prices might go if the trend continues.",
  },
  forecast: {
    title: "Forecast Zone",
    what: "The area to the right of the dashed vertical line shows projected future prices based on continuing the current trend.",
    howToRead: "This is a mathematical projection, not a prediction of what will happen. The widening bands show increasing uncertainty the further into the future you look. Always check R² — forecasts are more meaningful when R² is high.",
  },
} as const;

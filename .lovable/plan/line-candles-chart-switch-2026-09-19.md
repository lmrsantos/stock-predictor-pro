# Line / Candles chart switch

## What will change
- Add a two-option **Line / Candles** control to the Quant Forecast chart and the Quant Moment chart.
- Keep **Line** as the default so existing behavior does not change until someone selects Candles.
- In Candles mode, draw each historical session from its real open, high, low, and close prices. Rising and falling candles will use the existing positive and negative theme colors.
- Keep regression, forecast paths, expected ranges, support/resistance, structure markers, volume, and other overlays unchanged.
- Update chart details so a candle shows Open, High, Low, and Close; a line point continues to show the actual close.

## Technical details
- Extend the shared chart-point shape with optional OHLC fields, then carry the existing stock rows into both chart datasets.
- Add a reusable Recharts candle renderer based on the chart’s x/y scales, avoiding another chart dependency.
- Hide historical candles in the forecast region and retain the same future line and probability bands.
- Disable Candles for the terminal’s intraday view because that feed currently contains close-only points rather than real OHLC bars.

## Verification
- Check Quant Forecast and Quant Moment at desktop and mobile widths.
- Capture each chart in Line and Candles modes so the visual difference is clear.
- Confirm switching modes does not alter dates, prices, forecasts, ranges, or other calculations.

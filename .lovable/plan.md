# Quant Moment readability and chart cleanup

## What will change

- Increase typography across the entire Quant Moment experience, including cards, lists, controls, legal/account screens, and chart labels, without changing Quant Forecast.
- Replace the chart's crowded default popup with a compact label anchored at the top of the vertical guide:
  - first line: date and price only
  - second line, when available: `Expected: $...`
- Improve prediction readability by increasing contrast between the purple forecast line, forecast shading, and the text shown over it.
- Add the same subtle accepted-tap color feedback used in My tickers to every row under Worth a look today.

## Technical details

- Scale the root typography under the existing `qm-theme` scope so rem-based text sizes increase consistently throughout Quant Moment, then adjust fixed-pixel chart labels separately.
- Use a custom Recharts tooltip with minimal content and a fixed top position that follows the active vertical guide horizontally.
- Keep the existing forecast data and calculations unchanged; this is presentation-only.
- Add an active background transition to watch-list rows while preserving symbol selection and search clearing.

## Verification

- Check Quant Moment at a phone-sized viewport for readable text, no clipping, and no horizontal overflow.
- Open a ticker, move across actual and projected chart dates, and confirm the compact top label never covers the plotted information.
- Tap a Worth a look today ticker and confirm the row visibly acknowledges the press before opening it.

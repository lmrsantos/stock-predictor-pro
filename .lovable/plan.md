# Quant Moment header and voice search

## Changes
- Increase Quant Moment’s scoped system typography so labels and data read closer to Yahoo Stocks on a phone, without changing Quant Forecast.
- Add the current U.S. market session beside the date: pre-market, open, after-hours, or closed, updating automatically.
- Remove example ticker symbols from the search hint.
- Add a microphone control on the right side of ticker search so supported phones can dictate a ticker; keep typing as the fallback.

## Technical details
- Keep all styling scoped to Quant Moment’s existing theme.
- Use the phone browser’s built-in speech recognition, normalize spoken letters into a ticker query, and show an accessible listening state.
- Preserve the existing search suggestions, lookup limits, and ticker-selection clearing behavior.
- Validate with type checking and the running preview.

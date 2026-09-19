# Fix navigation between Quant Moment and Quant Forecast

## Changes
- Restrict the installed Quant Moment app to `/moment`, so opening Quant Forecast leaves the standalone app and uses the iPhone’s native return-to-app behavior.
- Open the `quant-forecast.com` link from Quant Moment in a separate browser view rather than replacing the app screen.
- Add iPhone safe-area spacing above the Quant Forecast website header so its logo sits below the time, signal, and battery line.
- Keep a visible “Back to Quant Moment” path on Quant Forecast when it was opened from the app, as a fallback to the iPhone’s native return link.

## Verification
- Check the Moment-to-website link and return path at an iPhone-sized viewport.
- Confirm both headers clear the iPhone status area and the rest of each page remains unchanged.

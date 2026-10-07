# Architecture rules

- Portfolio history reconstructs the current saved basket on common actual closing dates after the latest known purchase; it excludes transactions, dividends, fees, and currency conversion because no complete transaction ledger exists.
- Portfolio momentum reuses the shared structural-level and returns-based trend engines on positive portfolio value, then translates chart levels into gain/loss units; this avoids invalid analysis of negative P/L.
- Portfolio history subscribes to existing per-ticker React Query keys to deduplicate market-data requests and never persists a second portfolio dataset.
# Interactive SQL Funnel

**Where Did They Go?** is an interactive e-commerce funnel where every filter rewrites and executes SQL directly in the browser.

## Status

The first version uses a clearly labelled **DEMO dataset** generated locally in the browser so the interaction can be validated without publishing fake results as real-world findings.

Architecture:

```text
Demo data / Parquet
        ↓
   DuckDB-Wasm
        ↓
     Live SQL
        ↓
 Funnel + baseline
        ↓
 Deterministic insight
```

The application is designed so the demo source can later be replaced by a GA4-derived Parquet file without rebuilding the UI.

## Stack

- HTML
- CSS
- JavaScript ES modules
- DuckDB-Wasm
- Apache Parquet-ready data layer

## Run locally

Because the app uses ES modules and WebAssembly, serve it over HTTP:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Data modes

The current version starts in `demo` mode. The demo dataset is synthetic and exists only to validate the mechanics of the project.

To switch to a real Parquet source later, edit `js/config.js` and set:

```js
DATA_MODE: "parquet"
PARQUET_URL: "./data/ecommerce_events.parquet"
```

The expected schema and funnel definitions are documented in `docs/methodology.md`.

## Core interaction

1. Change one or more filters.
2. The visible SQL query is rebuilt.
3. The changed SQL line is highlighted.
4. DuckDB-Wasm executes the query.
5. Funnel counts and conversion rates are recalculated.
6. A matching baseline query is executed.
7. The comparison and written insight are regenerated from the query results.

No funnel KPI is hardcoded.

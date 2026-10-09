# SQL Data Lab
**Explore data. See the SQL.** A two-page interactive SQL project for an analytics portfolio. This repository was previously named **Interactive SQL Funnel**; it has been intentionally redesigned rather than duplicated.

## Live site
When GitHub Pages is configured to publish the repository's `main` branch: https://gabrieldelvaje.github.io/interactive-sql-funnel/

## Page 01 — Explorer
Interact with a realistic (but synthetic) relational database. Controls rewrite **SELECT lists, LEFT JOINs, WHERE clauses, GROUP BY, aggregations, CTEs, window functions, ORDER BY and LIMIT**, rather than simply substituting a WHERE filter.

- **Analyze** — select a metric (revenue, distinct orders, average ticket), a dimension (month, channel, region, customer segment, product category, payment method or order status), status/region filters, and a window calculation (LAG / DENSE_RANK). The chart and result table run against the **same generated query**.
- **Explore rows** — pick any of five source tables, add a valid relationship, select/deselect real columns, and change filters or row limits. Watch the actual projection/JOIN change in the live SQL panel.
- Click a bar (categorical dimensions) to drill in: the SQL gains/removes a matching filter.
- Each modified line is highlighted. Transfer the query to the sandbox or copy it.

Revenue by category is calculated from **line items** (`SUM(quantity * unit_price)`), avoiding duplicated order revenue after one-to-many JOINs. Other dimensions aggregate `orders.total_amount` at order grain.

## Page 02 — Sandbox
A real SQL editor executing read-only queries against **the very same database**.

1. SELECT * / FROM / LIMIT
2. Selecting particular columns
3. WHERE
4. ORDER BY and LIMIT
5. GROUP BY and COUNT
6. JOIN
7. HAVING
8. CTEs and DENSE_RANK window functions

Each lesson has an explanation, starter query, challenge, hint and solution. **Verify challenge** runs your SQL and a reference SQL query and compares the returned columns, rows and, where important, order. Merely including the right SQL keywords is not sufficient. Progress is stored locally in your browser; no login is required.

Press Ctrl+Enter / Cmd+Enter to execute. The sandbox allows SELECT, WITH, EXPLAIN, DESCRIBE and SHOW, and does not permit database mutation or multiple statements. Query results are capped for display.

## Data model

| Table | Key(s) | Contains |
|---|---|---|
| customers | customer_id | customer_name, region, segment, signup_date |
| orders | order_id; customer_id FK | order_date, status, channel, total_amount |
| order_items | item_id; order_id FK; product_id FK | quantity, unit_price |
| products | product_id | product_name, category, list_price |
| payments | payment_id; order_id FK | method, paid_amount, payment_status |

Seeded, **synthetic** data: 200 customers, 40 products, 1,200 orders, their order items and payments. Generated deterministically when the browser starts. These records are not real transactions, and all numeric outcomes represent this dataset only.

## Stack
- HTML / CSS / JavaScript modules
- DuckDB-Wasm + Arrow, running locally in the browser
- GitHub Pages (static deploy, no custom backend)
- Deterministic CSV generator and in-memory relational tables
- SQL transformation + visual SQL diff
- Node built-in test runner for SQL builder logic

## Local development

Serve the root over HTTP to enable JavaScript modules and the DuckDB Web Worker:

```bash
python -m http.server 8000
# http://localhost:8000
```

The first visit requires network access to load a pinned DuckDB-Wasm version from jsDelivr. If CDN/WebAssembly is unavailable, the UI shows a helpful load error rather than an infinite spinner. Browser queries thereafter run locally.

Run source-level tests if Node.js is installed:

```bash
node --test
```

## Databricks integration — important distinction

**The publicly hosted sandbox is not connected to Databricks.** It runs DuckDB-Wasm with portable SQL patterns familiar to Databricks SQL users, but dialects and functions differ. There is no Databricks execution, workspace access, billing, or authentication in this version.

**Never put a Databricks personal access token, OAuth secret or warehouse credentials in client-side HTML, JavaScript, URL parameters or a public GitHub repository.** A real Databricks SQL Warehouse option would require a separate authenticated backend/proxy to invoke the [Databricks Statement Execution API](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial), enforce per-user permissions, quota, read-only policies, and audit execution. See [integration architecture](docs/databricks-integration.md).

## Caveats / next steps
- Browser performance is constrained by the device, WebAssembly availability, and public CDN access.
- The visual builder generates a safe, supported subset of SQL. Arbitrary editor changes are **not** reverse-parsed into controls.
- Add a backend connector for **optional** enterprise Databricks access once secrets management and authentication are available.
- Expand the dataset using documented open datasets if external data becomes appropriate.

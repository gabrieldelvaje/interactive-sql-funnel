# Optional Databricks SQL backend (future integration)

SQL Data Lab is a **static** GitHub Pages app. Its default database is DuckDB-Wasm, not Databricks. The HTML page must never receive or persist a Databricks token.

## Secure architecture

Browser → Authenticated application API → authorization + SQL validation → Databricks SQL Statement Execution API → sanitized rows → Browser.

Proposed production route: POST /api/query with the query, workspace tenant context and user identity provided by a session. Never accept tokens as part of the request JSON. The proxy uses service principal/workload identity credentials stored on the server, restricted SQL Warehouse and read-only dataset permissions.

Validate:
- Authenticated user, allowed tables, query type SELECT only, reject multi-statement and external functions.
- Dedicated read-only SQL warehouse/catalog, short execution timeout, max rows and request throttling.
- Per-user audit events, statement cancellation support, SQL execution cost guardrails.
- Apply Databricks SQL dialect and separate the local DuckDB execution path.

See: https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial

This file is a design document. No Databricks backend is deployed as part of the repository.

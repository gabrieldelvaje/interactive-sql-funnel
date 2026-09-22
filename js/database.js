import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev57.0/dist/duckdb-browser.mjs";
import { CONFIG } from "./config.js";
import { generateDemoCsv } from "./demo-data.js";

let db;
let connection;

function normalizeValue(value) {
  if (typeof value === "bigint") return Number(value);
  return value;
}

function rowToObject(row) {
  const raw = typeof row?.toJSON === "function" ? row.toJSON() : row;
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, normalizeValue(value)])
  );
}

const DUCKDB_DIST =
  "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev57.0/dist/";

const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: `${DUCKDB_DIST}duckdb-mvp.wasm`,
    mainWorker: `${DUCKDB_DIST}duckdb-browser-mvp.worker.js`
  },
  eh: {
    mainModule: `${DUCKDB_DIST}duckdb-eh.wasm`,
    mainWorker: `${DUCKDB_DIST}duckdb-browser-eh.worker.js`
  }
};

function withTimeout(promise, milliseconds, label) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(milliseconds / 1000)} seconds.`));
    }, milliseconds);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function instantiateBundle(bundle) {
  const workerUrl = URL.createObjectURL(
    new Blob(
      [`importScripts("${bundle.mainWorker}");`],
      { type: "text/javascript" }
    )
  );

  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const instance = new duckdb.AsyncDuckDB(logger, worker);

  try {
    await withTimeout(
      instance.instantiate(bundle.mainModule, bundle.pthreadWorker),
      15000,
      "DuckDB initialization"
    );
    return instance;
  } catch (error) {
    worker.terminate();
    throw error;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

async function createDuckDB() {
  const selected = await withTimeout(
    duckdb.selectBundle(DUCKDB_BUNDLES),
    5000,
    "DuckDB bundle selection"
  );

  try {
    return await instantiateBundle(selected);
  } catch (primaryError) {
    const isMvp = selected.mainModule === DUCKDB_BUNDLES.mvp.mainModule;

    if (isMvp) throw primaryError;

    console.warn(
      "Preferred DuckDB bundle failed. Falling back to MVP.",
      primaryError
    );

    return instantiateBundle(DUCKDB_BUNDLES.mvp);
  }
}

async function registerDemoDataset() {
  const csv = generateDemoCsv();
  const bytes = new TextEncoder().encode(csv);

  await db.registerFileBuffer("ecommerce_demo.csv", bytes);

  await connection.query(`
    CREATE OR REPLACE VIEW ecommerce_events AS
    SELECT
      CAST(event_date AS DATE) AS event_date,
      CAST(event_timestamp AS BIGINT) AS event_timestamp,
      CAST(event_datetime AS TIMESTAMP) AS event_datetime,
      CAST(user_pseudo_id AS VARCHAR) AS user_pseudo_id,
      CAST(session_id AS VARCHAR) AS session_id,
      CAST(event_name AS VARCHAR) AS event_name,
      CAST(country AS VARCHAR) AS country,
      CAST(region AS VARCHAR) AS region,
      CAST(city AS VARCHAR) AS city,
      CAST(device_category AS VARCHAR) AS device_category,
      CAST(traffic_source AS VARCHAR) AS traffic_source,
      CAST(traffic_medium AS VARCHAR) AS traffic_medium,
      CAST(item_id AS VARCHAR) AS item_id,
      CAST(transaction_id AS VARCHAR) AS transaction_id,
      COALESCE(CAST(purchase_revenue AS DOUBLE), 0) AS purchase_revenue,
      CAST(day_of_week AS INTEGER) AS day_of_week,
      CAST(day_name AS VARCHAR) AS day_name,
      CAST(is_weekend AS BOOLEAN) AS is_weekend,
      CAST(is_holiday AS BOOLEAN) AS is_holiday,
      CAST(holiday_name AS VARCHAR) AS holiday_name
    FROM read_csv_auto(
      'ecommerce_demo.csv',
      HEADER = TRUE,
      SAMPLE_SIZE = -1
    );
  `);
}

async function registerParquetDataset() {
  const response = await fetch(CONFIG.PARQUET_URL);
  if (!response.ok) {
    throw new Error(`Could not load Parquet dataset (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await db.registerFileBuffer("ecommerce_events.parquet", bytes);

  await connection.query(`
    CREATE OR REPLACE VIEW ecommerce_events AS
    SELECT *
    FROM read_parquet('ecommerce_events.parquet');
  `);
}

export async function initializeDatabase() {
  db = await createDuckDB();
  connection = await db.connect();

  if (CONFIG.DATA_MODE === "parquet") {
    await registerParquetDataset();
  } else {
    await registerDemoDataset();
  }

  return {
    mode: CONFIG.DATA_MODE,
    parquetUrl: CONFIG.PARQUET_URL
  };
}

export async function runQuery(sql) {
  if (!connection) throw new Error("Database is not initialized.");
  const result = await connection.query(sql);
  return result.toArray().map(rowToObject);
}

const ALLOWED_DISTINCT_COLUMNS = new Set([
  "region",
  "city",
  "device_category",
  "traffic_source",
  "traffic_medium",
  "day_name"
]);

export async function getDistinctValues(column) {
  if (!ALLOWED_DISTINCT_COLUMNS.has(column)) {
    throw new Error(`Column "${column}" is not allowed for dynamic filters.`);
  }

  const rows = await runQuery(`
    SELECT DISTINCT ${column} AS value
    FROM ecommerce_events
    WHERE ${column} IS NOT NULL
      AND TRIM(CAST(${column} AS VARCHAR)) <> ''
    ORDER BY value;
  `);

  return rows.map((row) => row.value);
}

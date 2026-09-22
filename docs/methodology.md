# Methodology

## Purpose

This project is designed to make the analytical SQL visible. Filters do not merely hide precomputed HTML; they rewrite a SQL query that is executed by DuckDB-Wasm in the visitor's browser.

## Current data status

The repository currently starts in **DEMO mode**. The development dataset is synthetic and deterministic. It exists only to validate interaction, SQL generation, funnel logic, comparisons and responsive design.

No demo result should be presented as a finding about real customers.

## Expected production data contract

A real Parquet source should expose at least:

| Column | Type | Purpose |
| --- | --- | --- |
| event_date | DATE | Calendar filtering |
| event_timestamp | BIGINT | Event sequence |
| session_id | VARCHAR | Funnel unit |
| event_name | VARCHAR | Funnel stage |
| region | VARCHAR | Geographic comparison |
| city | VARCHAR | Optional geographic detail |
| device_category | VARCHAR | Device filter |
| day_name | VARCHAR | Day filter |
| is_weekend | BOOLEAN | Weekend/weekday split |
| is_holiday | BOOLEAN | Holiday split |

Recommended additional fields:

- user_pseudo_id
- country
- traffic_source
- traffic_medium
- item_id
- transaction_id
- purchase_revenue
- holiday_name

## Unit of analysis

The funnel is calculated at **session level**, not raw event level.

The current stages are:

1. `view_item`
2. `add_to_cart`
3. `begin_checkout`
4. `purchase`

A session only reaches a downstream stage when its event timestamp occurs after the required upstream stage.

## Conversion

Overall conversion is:

```text
purchase sessions / view sessions
```

Intermediate retention is calculated between adjacent stages.

## Filtering

Filters are applied to `ecommerce_events` before session-stage timestamps are calculated.

The UI currently supports:

- all / weekdays / weekend
- all / holiday / non-holiday
- region
- device
- one or more days of week

Filter values such as region and device are populated from SQL rather than maintained as a manual list.

## Baseline logic

The baseline changes with the selected cohort.

Priority:

1. selected region → other regions with the remaining filters preserved;
2. selected day type → the opposite day type with remaining filters preserved;
3. selected holiday status → opposite holiday status;
4. selected device → other devices;
5. selected days → other days.

Example:

```text
California + Weekend + Mobile
```

is compared with:

```text
Other regions + Weekend + Mobile
```

rather than an unrelated global baseline.

## Percentage points

If conversion moves from 3.1% to 3.8%, the displayed absolute difference is:

```text
+0.7 pp
```

not `+0.7%`.

## Sample-size guardrail

`MIN_SAMPLE_SIZE` lives in `js/config.js`.

Small cohorts are still displayed, but the UI warns that the comparison should be treated cautiously.

## Holidays

The demo generator marks only a small documented U.S. holiday set for the demo period:

- Thanksgiving Day
- Christmas Day
- New Year's Day

Retail events such as Black Friday are not automatically classified as public holidays.

## Replacing demo data

Set:

```js
DATA_MODE: "parquet"
```

and provide the Parquet path in `PARQUET_URL`.

The application fetches the file, registers it with DuckDB-Wasm and creates the `ecommerce_events` view.

For a GA4 production export, flatten nested/repeated GA4 fields into this contract before publishing the Parquet used by the browser.

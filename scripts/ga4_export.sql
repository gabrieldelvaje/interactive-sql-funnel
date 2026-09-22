-- Google Analytics 4 public ecommerce sample
-- Source:
-- bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_*
--
-- This query flattens only the columns needed by the interactive funnel.
-- Export the result to CSV or Parquet, then run scripts/prepare_data.py
-- if you still need holiday enrichment / final validation.

SELECT
  PARSE_DATE('%Y%m%d', event_date) AS event_date,
  event_timestamp,
  TIMESTAMP_MICROS(event_timestamp) AS event_datetime,
  user_pseudo_id,

  CONCAT(
    user_pseudo_id,
    '-',
    CAST((
      SELECT value.int_value
      FROM UNNEST(event_params)
      WHERE key = 'ga_session_id'
    ) AS STRING)
  ) AS session_id,

  event_name,

  geo.country AS country,
  geo.region AS region,
  geo.city AS city,

  device.category AS device_category,

  traffic_source.source AS traffic_source,
  traffic_source.medium AS traffic_medium,

  CAST(NULL AS STRING) AS item_id,
  ecommerce.transaction_id AS transaction_id,
  ecommerce.purchase_revenue AS purchase_revenue,

  EXTRACT(DAYOFWEEK FROM PARSE_DATE('%Y%m%d', event_date)) AS day_of_week,
  FORMAT_DATE('%A', PARSE_DATE('%Y%m%d', event_date)) AS day_name,

  EXTRACT(DAYOFWEEK FROM PARSE_DATE('%Y%m%d', event_date)) IN (1, 7) AS is_weekend

FROM
  `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_*`

WHERE
  _TABLE_SUFFIX BETWEEN '20201101' AND '20210131'
  AND event_name IN (
    'view_item',
    'add_to_cart',
    'begin_checkout',
    'purchase'
  )
  AND user_pseudo_id IS NOT NULL
  AND (
    SELECT value.int_value
    FROM UNNEST(event_params)
    WHERE key = 'ga_session_id'
  ) IS NOT NULL;

const DAY_NAMES = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
]);

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeFilters(filters = {}) {
  return {
    dayType: ["all", "weekday", "weekend"].includes(filters.dayType) ? filters.dayType : "all",
    holiday: ["all", "holiday", "non-holiday"].includes(filters.holiday) ? filters.holiday : "all",
    region: filters.region ? String(filters.region) : "",
    device: filters.device ? String(filters.device) : "",
    days: Array.isArray(filters.days)
      ? filters.days.filter((day) => DAY_NAMES.has(day))
      : []
  };
}

function buildConditions(inputFilters, options = {}) {
  const filters = normalizeFilters(inputFilters);
  const omit = new Set(options.omit || []);
  const conditions = [];

  if (!omit.has("dayType")) {
    if (filters.dayType === "weekend") conditions.push("is_weekend = TRUE");
    if (filters.dayType === "weekday") conditions.push("is_weekend = FALSE");
  }

  if (!omit.has("holiday")) {
    if (filters.holiday === "holiday") conditions.push("is_holiday = TRUE");
    if (filters.holiday === "non-holiday") conditions.push("is_holiday = FALSE");
  }

  if (!omit.has("region") && filters.region) {
    conditions.push(`region = ${sqlString(filters.region)}`);
  }

  if (!omit.has("device") && filters.device) {
    conditions.push(`device_category = ${sqlString(filters.device)}`);
  }

  if (!omit.has("days") && filters.days.length) {
    const values = filters.days.map(sqlString).join(", ");
    conditions.push(`day_name IN (${values})`);
  }

  if (Array.isArray(options.extra)) {
    conditions.push(...options.extra);
  }

  return conditions;
}

function whereBlock(conditions) {
  if (!conditions.length) return "";

  return [
    "WHERE",
    ...conditions.map((condition, index) =>
      `    ${index === 0 ? "" : "AND "}${condition}`
    )
  ].join("\n");
}

function funnelSql(conditions) {
  const where = whereBlock(conditions);

  return `WITH filtered_events AS (
    SELECT
        session_id,
        event_name,
        event_timestamp
    FROM ecommerce_events
    ${where}
),

session_steps AS (
    SELECT
        session_id,
        MIN(CASE WHEN event_name = 'view_item' THEN event_timestamp END) AS view_ts,
        MIN(CASE WHEN event_name = 'add_to_cart' THEN event_timestamp END) AS cart_ts,
        MIN(CASE WHEN event_name = 'begin_checkout' THEN event_timestamp END) AS checkout_ts,
        MIN(CASE WHEN event_name = 'purchase' THEN event_timestamp END) AS purchase_ts
    FROM filtered_events
    GROUP BY
        session_id
),

sequential_funnel AS (
    SELECT
        session_id,
        view_ts IS NOT NULL AS reached_view,
        cart_ts IS NOT NULL
            AND view_ts IS NOT NULL
            AND cart_ts >= view_ts AS reached_cart,
        checkout_ts IS NOT NULL
            AND cart_ts IS NOT NULL
            AND view_ts IS NOT NULL
            AND checkout_ts >= cart_ts
            AND cart_ts >= view_ts AS reached_checkout,
        purchase_ts IS NOT NULL
            AND checkout_ts IS NOT NULL
            AND cart_ts IS NOT NULL
            AND view_ts IS NOT NULL
            AND purchase_ts >= checkout_ts
            AND checkout_ts >= cart_ts
            AND cart_ts >= view_ts AS reached_purchase
    FROM session_steps
    WHERE
        view_ts IS NOT NULL
)

SELECT
    COUNT(*) FILTER (WHERE reached_view) AS view_sessions,
    COUNT(*) FILTER (WHERE reached_cart) AS cart_sessions,
    COUNT(*) FILTER (WHERE reached_checkout) AS checkout_sessions,
    COUNT(*) FILTER (WHERE reached_purchase) AS purchase_sessions
FROM sequential_funnel;`;
}

export function buildFunnelQuery(filters) {
  return funnelSql(buildConditions(filters));
}

export function buildBaselineQuery(inputFilters) {
  const filters = normalizeFilters(inputFilters);

  if (filters.region) {
    return {
      label: `Other regions · same filters`,
      dimension: "region",
      sql: funnelSql(
        buildConditions(filters, {
          omit: ["region"],
          extra: [`region <> ${sqlString(filters.region)}`]
        })
      )
    };
  }

  if (filters.dayType === "weekend" || filters.dayType === "weekday") {
    const opposite = filters.dayType === "weekend" ? "FALSE" : "TRUE";
    const oppositeLabel = filters.dayType === "weekend" ? "Weekdays" : "Weekend";

    return {
      label: `${oppositeLabel} · same filters`,
      dimension: "dayType",
      sql: funnelSql(
        buildConditions(filters, {
          omit: ["dayType"],
          extra: [`is_weekend = ${opposite}`]
        })
      )
    };
  }

  if (filters.holiday === "holiday" || filters.holiday === "non-holiday") {
    const opposite = filters.holiday === "holiday" ? "FALSE" : "TRUE";
    const oppositeLabel = filters.holiday === "holiday" ? "Non-holiday" : "Holiday";

    return {
      label: `${oppositeLabel} · same filters`,
      dimension: "holiday",
      sql: funnelSql(
        buildConditions(filters, {
          omit: ["holiday"],
          extra: [`is_holiday = ${opposite}`]
        })
      )
    };
  }

  if (filters.device) {
    return {
      label: `Other devices · same filters`,
      dimension: "device",
      sql: funnelSql(
        buildConditions(filters, {
          omit: ["device"],
          extra: [`device_category <> ${sqlString(filters.device)}`]
        })
      )
    };
  }

  if (filters.days.length) {
    const values = filters.days.map(sqlString).join(", ");
    return {
      label: "Other days · same filters",
      dimension: "days",
      sql: funnelSql(
        buildConditions(filters, {
          omit: ["days"],
          extra: [`day_name NOT IN (${values})`]
        })
      )
    };
  }

  return null;
}

export function describeCohort(inputFilters) {
  const filters = normalizeFilters(inputFilters);
  const parts = [];

  if (filters.dayType === "weekend") parts.push("Weekend");
  if (filters.dayType === "weekday") parts.push("Weekdays");
  if (filters.holiday === "holiday") parts.push("Holiday");
  if (filters.holiday === "non-holiday") parts.push("Non-holiday");
  if (filters.region) parts.push(filters.region);
  if (filters.device) parts.push(filters.device);
  if (filters.days.length) parts.push(filters.days.join(" + "));

  return parts.length ? parts : ["All sessions"];
}

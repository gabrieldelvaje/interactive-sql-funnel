import { CONFIG } from "./config.js";

const REGIONS = [
  { region: "California", city: "Los Angeles", cartBoost: 0.030, purchaseBoost: 0.018 },
  { region: "New York", city: "New York", cartBoost: 0.012, purchaseBoost: 0.010 },
  { region: "Texas", city: "Austin", cartBoost: -0.008, purchaseBoost: -0.006 },
  { region: "Florida", city: "Miami", cartBoost: 0.006, purchaseBoost: -0.004 },
  { region: "Illinois", city: "Chicago", cartBoost: -0.015, purchaseBoost: 0.004 }
];

const DEVICES = [
  { name: "desktop", cartBoost: 0.024, purchaseBoost: 0.020 },
  { name: "mobile", cartBoost: -0.010, purchaseBoost: -0.012 },
  { name: "tablet", cartBoost: 0.004, purchaseBoost: -0.002 }
];

const TRAFFIC = [
  ["google", "organic"],
  ["direct", "(none)"],
  ["newsletter", "email"],
  ["partner", "referral"]
];

const HOLIDAYS = new Map([
  ["2020-11-26", "Thanksgiving Day"],
  ["2020-12-25", "Christmas Day"],
  ["2021-01-01", "New Year's Day"]
]);

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

function hash01(index, salt) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function generateDemoCsv() {
  const rows = [];
  const start = new Date(Date.UTC(2020, 10, 1));
  const totalDays = 92;

  for (let i = 0; i < CONFIG.DEMO_SESSIONS; i += 1) {
    const dayIndex = (i * 17 + Math.floor(i / 11)) % totalDays;
    const sessionDate = new Date(start);
    sessionDate.setUTCDate(start.getUTCDate() + dayIndex);

    const dateText = isoDate(sessionDate);
    const dayOfWeek = sessionDate.getUTCDay();
    const dayName = DAY_NAMES[dayOfWeek];
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holidayName = HOLIDAYS.get(dateText) || "";
    const isHoliday = Boolean(holidayName);

    const regionConfig = REGIONS[(i * 3 + dayIndex) % REGIONS.length];
    const deviceConfig = DEVICES[(i * 5 + dayIndex) % DEVICES.length];
    const [trafficSource, trafficMedium] = TRAFFIC[(i + dayIndex) % TRAFFIC.length];

    const sessionId = `session_${String(i + 1).padStart(5, "0")}`;
    const userId = `user_${String((i * 7) % 1380).padStart(4, "0")}`;
    const itemId = `item_${1000 + ((i * 19) % 160)}`;

    const baseHour = (i * 7 + dayIndex) % 24;
    const baseTime = new Date(sessionDate);
    baseTime.setUTCHours(baseHour, (i * 13) % 60, 0, 0);

    const weekendCartBoost = isWeekend ? 0.025 : -0.004;
    const weekendPurchaseBoost = isWeekend ? 0.018 : 0;
    const holidayCartBoost = isHoliday ? 0.060 : 0;
    const holidayPurchaseBoost = isHoliday ? 0.030 : 0;

    const cartProbability = Math.min(
      0.48,
      0.275 + weekendCartBoost + holidayCartBoost + regionConfig.cartBoost + deviceConfig.cartBoost
    );
    const checkoutProbability = Math.min(
      0.82,
      0.655 + (isWeekend ? 0.018 : 0) + (isHoliday ? 0.020 : 0)
    );
    const purchaseProbability = Math.min(
      0.84,
      0.675 + weekendPurchaseBoost + holidayPurchaseBoost + regionConfig.purchaseBoost + deviceConfig.purchaseBoost
    );

    const reachedCart = hash01(i, 1) < cartProbability;
    const reachedCheckout = reachedCart && hash01(i, 2) < checkoutProbability;
    const reachedPurchase = reachedCheckout && hash01(i, 3) < purchaseProbability;

    const events = [
      ["view_item", 0, "", 0]
    ];

    if (reachedCart) events.push(["add_to_cart", 95 + ((i * 11) % 420), "", 0]);
    if (reachedCheckout) events.push(["begin_checkout", 240 + ((i * 17) % 700), "", 0]);
    if (reachedPurchase) {
      const revenue = 32 + ((i * 29) % 268) + hash01(i, 8);
      events.push(["purchase", 420 + ((i * 23) % 980), `txn_${i + 1}`, revenue.toFixed(2)]);
    }

    for (const [eventName, offsetSeconds, transactionId, revenue] of events) {
      const eventTime = new Date(baseTime.getTime() + Number(offsetSeconds) * 1000);

      rows.push({
        event_date: dateText,
        event_timestamp: eventTime.getTime(),
        event_datetime: eventTime.toISOString(),
        user_pseudo_id: userId,
        session_id: sessionId,
        event_name: eventName,
        country: "United States",
        region: regionConfig.region,
        city: regionConfig.city,
        device_category: deviceConfig.name,
        traffic_source: trafficSource,
        traffic_medium: trafficMedium,
        item_id: itemId,
        transaction_id: transactionId,
        purchase_revenue: revenue,
        day_of_week: dayOfWeek,
        day_name: dayName,
        is_weekend: isWeekend,
        is_holiday: isHoliday,
        holiday_name: holidayName
      });
    }
  }

  const columns = [
    "event_date",
    "event_timestamp",
    "event_datetime",
    "user_pseudo_id",
    "session_id",
    "event_name",
    "country",
    "region",
    "city",
    "device_category",
    "traffic_source",
    "traffic_medium",
    "item_id",
    "transaction_id",
    "purchase_revenue",
    "day_of_week",
    "day_name",
    "is_weekend",
    "is_holiday",
    "holiday_name"
  ];

  const output = [columns.join(",")];

  for (const row of rows) {
    output.push(columns.map((column) => csvValue(row[column])).join(","));
  }

  return output.join("\n");
}

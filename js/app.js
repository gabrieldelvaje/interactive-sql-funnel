import { CONFIG } from "./config.js";
import { getDistinctValues, initializeDatabase, runQuery } from "./database.js";
import {
  buildBaselineQuery,
  buildFunnelQuery,
  describeCohort
} from "./query-builder.js";
import { renderSqlDiff } from "./sql-diff.js";
import {
  buildInsight,
  funnelRates,
  percentage,
  pp,
  toMetrics
} from "./insights.js";

const state = {
  dayType: "all",
  holiday: "all",
  region: "",
  device: "",
  days: []
};

const elements = {
  badge: document.querySelector("#data-mode-badge"),
  clear: document.querySelector("#clear-filters"),
  region: document.querySelector("#region-filter"),
  device: document.querySelector("#device-filter"),
  dayFilter: document.querySelector("#day-filter"),
  activeFilters: document.querySelector("#active-filters"),
  sql: document.querySelector("#sql-code"),
  queryStatus: document.querySelector("#query-status"),
  loading: document.querySelector("#loading-state"),
  results: document.querySelector("#results-content"),
  error: document.querySelector("#error-box"),
  sampleSize: document.querySelector("#sample-size"),
  sourceNote: document.querySelector("#source-note"),
  views: document.querySelector("#views-value"),
  cart: document.querySelector("#cart-value"),
  checkout: document.querySelector("#checkout-value"),
  purchase: document.querySelector("#purchase-value"),
  viewCartRetention: document.querySelector("#view-cart-retention"),
  viewCartDrop: document.querySelector("#view-cart-drop"),
  cartCheckoutRetention: document.querySelector("#cart-checkout-retention"),
  cartCheckoutDrop: document.querySelector("#cart-checkout-drop"),
  checkoutPurchaseRetention: document.querySelector("#checkout-purchase-retention"),
  checkoutPurchaseDrop: document.querySelector("#checkout-purchase-drop"),
  overall: document.querySelector("#overall-conversion"),
  comparisonDelta: document.querySelector("#comparison-delta"),
  comparisonLabel: document.querySelector("#comparison-label"),
  analysis: document.querySelector("#analysis-text"),
  sampleWarning: document.querySelector("#sample-warning")
};

let previousSql = "";
let isRunning = false;
let hasPendingUpdate = false;
let updateTimer;

function formatInteger(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function setError(message = "") {
  elements.error.hidden = !message;
  elements.error.textContent = message;
}

function setQueryStatus(text) {
  elements.queryStatus.textContent = text;
}

function populateSelect(select, values, defaultLabel) {
  select.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  select.append(defaultOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function readSelectedDays() {
  return [...elements.dayFilter.querySelectorAll("input:checked")]
    .map((input) => input.value);
}

function renderActiveFilters() {
  const labels = describeCohort(state);
  elements.activeFilters.innerHTML = "";

  labels.forEach((label) => {
    const tag = document.createElement("span");
    tag.className = labels.length === 1 && label === "All sessions"
      ? "filter-tag filter-tag--muted"
      : "filter-tag";
    tag.textContent = label;
    elements.activeFilters.append(tag);
  });
}

function setStageWidth(stage, count, total) {
  const element = document.querySelector(`[data-stage="${stage}"]`);
  const ratio = total > 0 ? count / total : 0;
  const width = stage === "view" ? 100 : Math.max(52, ratio * 100);
  element.style.setProperty("--stage-width", `${width.toFixed(1)}%`);
}

function renderFunnel(metrics) {
  const rates = funnelRates(metrics);

  elements.views.textContent = formatInteger(metrics.view);
  elements.cart.textContent = formatInteger(metrics.cart);
  elements.checkout.textContent = formatInteger(metrics.checkout);
  elements.purchase.textContent = formatInteger(metrics.purchase);

  elements.viewCartRetention.textContent = `${percentage(rates.viewToCart)} continue`;
  elements.viewCartDrop.textContent = `${percentage(1 - rates.viewToCart)} drop`;

  elements.cartCheckoutRetention.textContent = `${percentage(rates.cartToCheckout)} continue`;
  elements.cartCheckoutDrop.textContent = `${percentage(1 - rates.cartToCheckout)} drop`;

  elements.checkoutPurchaseRetention.textContent = `${percentage(rates.checkoutToPurchase)} continue`;
  elements.checkoutPurchaseDrop.textContent = `${percentage(1 - rates.checkoutToPurchase)} drop`;

  elements.overall.textContent = percentage(rates.overall, 2);
  elements.sampleSize.textContent = `${formatInteger(metrics.view)} view sessions`;

  setStageWidth("view", metrics.view, metrics.view);
  setStageWidth("cart", metrics.cart, metrics.view);
  setStageWidth("checkout", metrics.checkout, metrics.view);
  setStageWidth("purchase", metrics.purchase, metrics.view);
}

function renderComparison(metrics, baselineMetrics, baselineSpec, cohortLabel) {
  if (!baselineMetrics || !baselineSpec || !baselineMetrics.view) {
    elements.comparisonDelta.textContent = "—";
    elements.comparisonLabel.textContent = "Select a filter to compare cohorts";
    return;
  }

  const currentRate = funnelRates(metrics).overall;
  const baselineRate = funnelRates(baselineMetrics).overall;
  elements.comparisonDelta.textContent = pp(currentRate - baselineRate);
  elements.comparisonLabel.textContent =
    `${cohortLabel} vs ${baselineSpec.label}`;
}

function renderInsight(metrics, baselineMetrics, baselineSpec, cohortLabel) {
  const insight = buildInsight({
    metrics,
    baselineMetrics,
    cohortLabel,
    baselineLabel: baselineSpec?.label || "baseline",
    minSampleSize: CONFIG.MIN_SAMPLE_SIZE
  });

  elements.analysis.textContent = insight.text;
  elements.sampleWarning.hidden = !insight.warning;
  elements.sampleWarning.textContent = insight.warning;
}

async function updateAnalysis() {
  if (isRunning) {
    hasPendingUpdate = true;
    return;
  }

  isRunning = true;
  hasPendingUpdate = false;
  setError("");
  setQueryStatus("Running");

  const filters = {
    dayType: state.dayType,
    holiday: state.holiday,
    region: state.region,
    device: state.device,
    days: [...state.days]
  };

  const cohortParts = describeCohort(filters);
  const cohortLabel = cohortParts.join(" · ");
  const sql = buildFunnelQuery(filters);

  renderActiveFilters();
  renderSqlDiff(elements.sql, previousSql, sql);
  previousSql = sql;

  try {
    const rows = await runQuery(sql);
    const metrics = toMetrics(rows[0]);

    const baselineSpec = buildBaselineQuery(filters);
    let baselineMetrics = null;

    if (baselineSpec) {
      const baselineRows = await runQuery(baselineSpec.sql);
      baselineMetrics = toMetrics(baselineRows[0]);
    }

    renderFunnel(metrics);
    renderComparison(metrics, baselineMetrics, baselineSpec, cohortLabel);
    renderInsight(metrics, baselineMetrics, baselineSpec, cohortLabel);

    elements.loading.hidden = true;
    elements.results.hidden = false;
    setQueryStatus("Ready");
  } catch (error) {
    console.error(error);
    setError(error?.message || "The query could not be executed.");
    setQueryStatus("Error");
  } finally {
    isRunning = false;

    if (hasPendingUpdate) {
      hasPendingUpdate = false;
      updateAnalysis();
    }
  }
}

function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(updateAnalysis, 90);
}

function bindSegmentedFilters() {
  document.querySelectorAll(".segmented").forEach((group) => {
    const key = group.dataset.filter;

    group.addEventListener("click", (event) => {
      const button = event.target.closest(".segmented__button");
      if (!button) return;

      group.querySelectorAll(".segmented__button")
        .forEach((item) => item.classList.toggle("is-active", item === button));

      state[key] = button.dataset.value;
      scheduleUpdate();
    });
  });
}

function bindFilters() {
  bindSegmentedFilters();

  elements.region.addEventListener("change", () => {
    state.region = elements.region.value;
    scheduleUpdate();
  });

  elements.device.addEventListener("change", () => {
    state.device = elements.device.value;
    scheduleUpdate();
  });

  elements.dayFilter.addEventListener("change", () => {
    state.days = readSelectedDays();
    scheduleUpdate();
  });

  elements.clear.addEventListener("click", () => {
    state.dayType = "all";
    state.holiday = "all";
    state.region = "";
    state.device = "";
    state.days = [];

    document.querySelectorAll(".segmented").forEach((group) => {
      group.querySelectorAll(".segmented__button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.value === "all");
      });
    });

    elements.region.value = "";
    elements.device.value = "";
    elements.dayFilter.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });

    scheduleUpdate();
  });
}

async function initialize() {
  try {
    setQueryStatus("Loading");
    const source = await initializeDatabase();

    const regions = await getDistinctValues("region");
    const devices = await getDistinctValues("device_category");

    populateSelect(elements.region, regions, "All regions");
    populateSelect(elements.device, devices, "All devices");

    if (source.mode === "parquet") {
      elements.badge.textContent = "Parquet data";
      elements.badge.classList.remove("badge--demo");
      elements.sourceNote.textContent = "Configured Parquet dataset";
    } else {
      elements.badge.textContent = "Demo data";
      elements.badge.classList.add("badge--demo");
      elements.sourceNote.textContent = "Synthetic development dataset";
    }

    bindFilters();
    renderActiveFilters();
    await updateAnalysis();
  } catch (error) {
    console.error(error);
    elements.loading.hidden = true;
    setQueryStatus("Error");
    setError(
      error?.message ||
      "Could not initialize DuckDB-Wasm. Run the project through a local HTTP server."
    );
  }
}

initialize();

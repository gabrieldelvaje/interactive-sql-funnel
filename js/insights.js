export function toMetrics(row = {}) {
  return {
    view: Number(row.view_sessions || 0),
    cart: Number(row.cart_sessions || 0),
    checkout: Number(row.checkout_sessions || 0),
    purchase: Number(row.purchase_sessions || 0)
  };
}

export function rate(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function percentage(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function pp(value, digits = 2) {
  const amount = value * 100;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(digits)} pp`;
}

export function funnelRates(metrics) {
  return {
    viewToCart: rate(metrics.cart, metrics.view),
    cartToCheckout: rate(metrics.checkout, metrics.cart),
    checkoutToPurchase: rate(metrics.purchase, metrics.checkout),
    overall: rate(metrics.purchase, metrics.view)
  };
}

function largestDropoff(rates) {
  const stages = [
    {
      label: "product view and cart creation",
      drop: 1 - rates.viewToCart
    },
    {
      label: "cart and checkout",
      drop: 1 - rates.cartToCheckout
    },
    {
      label: "checkout and purchase",
      drop: 1 - rates.checkoutToPurchase
    }
  ];

  return stages.sort((a, b) => b.drop - a.drop)[0];
}

export function buildInsight({
  metrics,
  baselineMetrics,
  cohortLabel,
  baselineLabel,
  minSampleSize
}) {
  const rates = funnelRates(metrics);
  const largest = largestDropoff(rates);

  if (!metrics.view) {
    return {
      text: "No sessions match the selected cohort.",
      warning: ""
    };
  }

  const warning = metrics.view < minSampleSize
    ? `Only ${metrics.view.toLocaleString("en-US")} view sessions match this cohort. The comparison threshold is ${minSampleSize.toLocaleString("en-US")} sessions.`
    : "";

  if (metrics.view < minSampleSize) {
    return {
      text: `This cohort is below the minimum sample threshold, so no comparative conclusion is generated. The largest observed drop-off is between ${largest.label}.`,
      warning
    };
  }

  if (!baselineMetrics || !baselineMetrics.view) {
    return {
      text: `${cohortLabel} converts ${percentage(rates.overall)} from product view to purchase. The largest drop-off occurs between ${largest.label}.`,
      warning
    };
  }

  const baselineRates = funnelRates(baselineMetrics);
  const delta = rates.overall - baselineRates.overall;
  const direction = delta > 0 ? "above" : delta < 0 ? "below" : "in line with";

  const comparisonSentence = Math.abs(delta) < 0.00005
    ? `${cohortLabel} is effectively in line with ${baselineLabel} on overall conversion.`
    : `${cohortLabel} converts ${Math.abs(delta * 100).toFixed(2)} percentage points ${direction} ${baselineLabel}.`;

  return {
    text: `${comparisonSentence} The largest drop-off occurs between ${largest.label}.`,
    warning
  };
}

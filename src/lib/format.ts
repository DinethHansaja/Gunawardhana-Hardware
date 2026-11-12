const lkrFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display helper only. Financial totals are recalculated by PostgreSQL. */
export function formatCurrencyLkr(amount: number) {
  if (!Number.isFinite(amount)) throw new RangeError("Currency amount must be finite.");
  return lkrFormatter.format(amount);
}

export function formatQuantity(quantity: number, precision = 3) {
  if (!Number.isFinite(quantity) || precision < 0 || precision > 6) {
    throw new RangeError("Quantity or precision is invalid.");
  }
  return new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: precision,
  }).format(quantity);
}

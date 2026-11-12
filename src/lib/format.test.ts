import { describe, expect, it } from "vitest";
import { formatCurrencyLkr, formatQuantity } from "./format";

describe("store formatting", () => {
  it("formats Sri Lankan rupees to two decimal places", () => {
    const formatted = formatCurrencyLkr(1234.5);
    expect(formatted).toContain("1,234.50");
    expect(formatted).toContain("LKR");
  });

  it("formats fractional quantities without forced trailing zeroes", () => {
    expect(formatQuantity(1.25, 3)).toBe("1.25");
    expect(formatQuantity(2, 0)).toBe("2");
  });

  it("rejects non-finite display values", () => {
    expect(() => formatCurrencyLkr(Number.NaN)).toThrow(RangeError);
    expect(() => formatQuantity(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("parses monetary input using the configured currency precision", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { minorUnits, parseMoney, formatMoneyInput, formatMinorMoney } = await vite.ssrLoadModule("/src/prototype/money.ts");
    assert.equal(minorUnits("JPY"), 0);
    assert.equal(minorUnits("USD"), 2);
    assert.equal(minorUnits("KWD"), 3);
    assert.equal(parseMoney("120", "JPY", "Fixed price"), 120);
    assert.equal(parseMoney("12.34", "USD", "Amount off"), 1234);
    assert.equal(parseMoney("12.345", "KWD", "Fixed price"), 12345);
    assert.equal(formatMoneyInput(12345, "KWD"), "12.345");
    assert.equal(formatMinorMoney(906687400, "JPY", "ja"), "￥906,687,400");
    assert.equal(formatMinorMoney(5739000, "USD", "en"), "$57,390.00");
    assert.throws(() => formatMinorMoney(-1, "USD", "en"), /non-negative/);
    assert.throws(() => parseMoney("", "USD", "Fixed price"), /Fixed price.*required/);
    assert.throws(() => parseMoney("-1", "USD", "Amount off"), /Amount off.*zero or greater/);
    assert.throws(() => parseMoney("1.234", "USD", "Amount off"), /Amount off.*2 decimal places/);
    assert.throws(() => parseMoney("abc", "USD", "Amount off"), /Amount off.*valid amount/);
  } finally { await vite.close(); }
});

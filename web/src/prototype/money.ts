export function minorUnits(currencyCode: string): number {
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Currency code must be a three-letter ISO code.");
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits;
    if (digits === undefined) throw new Error(`Currency precision is unavailable: ${currencyCode}.`);
    return digits;
  } catch { throw new Error(`Unsupported currency: ${currencyCode}.`); }
}

export function parseMoney(input: string, currencyCode: string, field: string): number {
  const precision = minorUnits(currencyCode);
  const value = input.trim();
  if (!value) throw new Error(`${field} is required.`);
  if (value.startsWith("-")) throw new Error(`${field} must be zero or greater.`);
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`${field} must be a valid amount.`);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > precision) throw new Error(`${field} supports at most ${precision} decimal places.`);
  const minor = Number(whole) * 10 ** precision + Number(fraction.padEnd(precision, "0"));
  if (!Number.isSafeInteger(minor)) throw new Error(`${field} is too large.`);
  return minor;
}

export function formatMoneyInput(amountMinor: number, currencyCode: string): string {
  const precision = minorUnits(currencyCode);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("Amount must be a non-negative integer in minor units.");
  if (!precision) return String(amountMinor);
  const scale = 10 ** precision;
  return `${Math.floor(amountMinor / scale)}.${String(amountMinor % scale).padStart(precision, "0")}`;
}

export function formatMinorMoney(amountMinor: number, currencyCode: string, locale: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("Amount must be a non-negative integer in minor units.");
  const value = amountMinor / 10 ** minorUnits(currencyCode);
  return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(value);
}

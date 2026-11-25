export function toDateTimeInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeInput(value: string, original?: string): string | undefined {
  if (!value) return undefined;
  if (original && value === toDateTimeInput(original)) return original;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

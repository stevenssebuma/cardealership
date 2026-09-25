const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns the `yyyy-mm-dd` value used by the scheduler date input.
 *
 * This deliberately reads the *local* calendar date. `toISOString()` reports the
 * UTC day, which is still yesterday for dealership time zones ahead of UTC
 * (EAT is UTC+3) during the first hours after local midnight. That mismatch made
 * the scheduler default to a past date, so its own validation rejected the
 * booking before the customer touched anything.
 */
export function getTodayDateInputValue(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeBookingDate(value: string): string {
  return value.trim();
}

export function isValidBookingDate(value: string, today = new Date()): boolean {
  const normalized = normalizeBookingDate(value);
  if (!DATE_PATTERN.test(normalized)) return false;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const [year, month, day] = normalized.split("-").map(Number);
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return false;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return parsed.getTime() >= startOfToday.getTime();
}

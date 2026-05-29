/**
 * Time utility functions for formatting and manipulation.
 */

/**
 * Formats a given Date object (or the current time) as HH:MM:SS.
 * @param date The date to format (defaults to current date)
 */
export function formatTimestamp(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

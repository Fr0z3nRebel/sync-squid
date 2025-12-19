import { format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Formats a UTC date string for display in a specific timezone
 * @param utcDateString - ISO date string in UTC
 * @param timezone - IANA timezone identifier (e.g., 'America/New_York')
 * @param formatString - Format string for date-fns format function
 * @returns Formatted date string
 */
export function formatDateInTimezone(
  utcDateString: string,
  timezone: string | null | undefined,
  formatString: string = 'MMM d, yyyy h:mm a'
): string {
  try {
    const utcDate = new Date(utcDateString);
    
    // If no timezone specified or UTC, format as UTC
    if (!timezone || timezone === 'UTC') {
      return format(utcDate, formatString) + ' UTC';
    }

    // Use date-fns-tz for proper timezone formatting
    // formatInTimeZone converts a UTC date to display in the specified timezone
    return formatInTimeZone(utcDate, timezone, formatString);
  } catch (error) {
    // Fallback to simple format if timezone conversion fails
    console.error('Error formatting date in timezone:', error, { utcDateString, timezone });
    return format(new Date(utcDateString), formatString);
  }
}

/**
 * Converts a naive date-time string (without timezone) from a specific timezone to UTC
 * Simple approach: Calculate the timezone offset and add it to the local time
 * @param naiveDateTimeString - Date-time string like '2024-12-19T20:00:00' (no timezone info)
 * @param timezone - IANA timezone identifier (e.g., 'America/Chicago')
 * @returns Date object in UTC
 */
export function convertNaiveDateToUTC(
  naiveDateTimeString: string,
  timezone: string
): Date {
  // Parse the date string
  const dateStr = naiveDateTimeString.replace('Z', '').split('.')[0];
  const [datePart, timePart] = dateStr.split('T');
  if (!datePart || !timePart) {
    throw new Error(`Invalid date format: ${naiveDateTimeString}`);
  }
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
  
  // Create a date string in ISO format (treating it as UTC for now)
  const dateTimeStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const localTimeAsUTC = new Date(`${dateTimeStr}Z`);
  
  // Get the timezone offset for this specific date/time
  // We'll compare what this UTC time looks like in the target timezone vs what we want
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(localTimeAsUTC);
  const tzYear = parseInt(parts.find(p => p.type === 'year')!.value);
  const tzMonth = parseInt(parts.find(p => p.type === 'month')!.value);
  const tzDay = parseInt(parts.find(p => p.type === 'day')!.value);
  const tzHour = parseInt(parts.find(p => p.type === 'hour')!.value);
  const tzMinute = parseInt(parts.find(p => p.type === 'minute')!.value);
  const tzSecond = parseInt(parts.find(p => p.type === 'second')!.value);
  
  // Calculate the offset: how much to adjust localTimeAsUTC to get the correct UTC time
  // If the timezone shows a different time than we want, we need to adjust
  const desiredLocal = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  const actualLocal = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond));
  const offsetMs = desiredLocal.getTime() - actualLocal.getTime();
  
  // Add the offset to get UTC
  return new Date(localTimeAsUTC.getTime() + offsetMs);
}


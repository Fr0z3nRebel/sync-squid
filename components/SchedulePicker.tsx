'use client';

import { useState, useEffect } from 'react';
import { format, addMinutes } from 'date-fns';
import { COMMON_TIMEZONES } from '@/lib/youtube-categories';

interface SchedulePickerProps {
  onScheduleSelect: (date: Date, timezone?: string) => void;
  defaultDate?: Date;
  defaultTimezone?: string;
}

export default function SchedulePicker({
  onScheduleSelect,
  defaultDate,
  defaultTimezone,
}: SchedulePickerProps) {
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [timezone, setTimezone] = useState<string>(
    defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set default to 1 hour from now
    const defaultDateTime = defaultDate || addMinutes(new Date(), 60);
    const dateStr = format(defaultDateTime, 'yyyy-MM-dd');
    const timeStr = format(defaultDateTime, 'HH:mm');
    setDate(dateStr);
    setTime(timeStr);
    // Don't auto-call onScheduleSelect - wait for user to confirm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDate(newDate);
    validateSchedule(newDate, time, timezone);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTime(newTime);
    validateSchedule(date, newTime, timezone);
  };

  const validateSchedule = (dateValue: string, timeValue: string, tz: string) => {
    if (!dateValue || !timeValue) {
      setError(null);
      return;
    }

    setError(null);

    try {
      // Create a date string in the format expected
      const dateTimeString = `${dateValue}T${timeValue}:00`;
      
      // Create a date object - this will be interpreted in the user's local timezone
      // We'll convert it properly on the server side using the timezone
      const scheduledDate = new Date(dateTimeString);
      
      // Basic validation - check if date is valid
      if (isNaN(scheduledDate.getTime())) {
        setError('Invalid date or time');
        return;
      }

      // Validate that the date is in the future (rough check)
      const now = new Date();
      if (scheduledDate <= now) {
        setError('Scheduled time must be in the future');
        return;
      }

      // Pass both the date and timezone to parent
      // The parent/server will handle proper timezone conversion
      onScheduleSelect(scheduledDate, tz || undefined);
    } catch {
      setError('Invalid date or time');
    }
  };
  
  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTimezone = e.target.value;
    setTimezone(newTimezone);
    if (date && time) {
      validateSchedule(date, time, newTimezone);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    const tomorrow = addMinutes(now, 60);
    return {
      date: format(tomorrow, 'yyyy-MM-dd'),
      time: format(tomorrow, 'HH:mm'),
    };
  };

  const minDateTime = getMinDateTime();

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Schedule Date & Time <span className="text-red-500">*</span>
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Select when you want your video to be published
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="schedule-date"
            className="block text-sm font-medium text-gray-700"
          >
            Date
          </label>
          <input
            type="date"
            id="schedule-date"
            value={date}
            onChange={handleDateChange}
            min={minDateTime.date}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            style={{ cursor: 'pointer' }}
          />
        </div>

        <div>
          <label
            htmlFor="schedule-time"
            className="block text-sm font-medium text-gray-700"
          >
            Time
          </label>
          <input
            type="time"
            id="schedule-time"
            value={time}
            onChange={handleTimeChange}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="schedule-timezone"
          className="block text-sm font-medium text-gray-700"
        >
          Timezone <span className="text-red-500">*</span>
        </label>
        <select
          id="schedule-timezone"
          value={timezone}
          onChange={handleTimezoneChange}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Select the timezone for your scheduled time
        </p>
      </div>

      {date && time && (
        <div className="rounded-md bg-gray-50 p-3">
          <p className="text-sm text-gray-600">
            Scheduled for:{' '}
            <span className="font-medium">
              {format(
                new Date(`${date}T${time}`),
                'MMMM d, yyyy "at" h:mm a'
              )}
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Timezone: {COMMON_TIMEZONES.find(tz => tz.value === timezone)?.label || timezone}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}


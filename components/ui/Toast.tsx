'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({
  message,
  type,
  onClose,
  duration = 5000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor =
    type === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : type === 'error'
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-blue-50 border-blue-200 text-blue-800';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-lg border p-4 shadow-lg ${bgColor}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="text-current opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}


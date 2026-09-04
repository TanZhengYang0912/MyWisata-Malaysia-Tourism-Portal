'use client';

import { useEffect, useState } from 'react';

/**
 * Custom hook to debounce any fast-changing value (e.g. search queries).
 * @param value The value to debounce.
 * @param delayMs The delay in milliseconds before updating the debounced value (default: 300ms).
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

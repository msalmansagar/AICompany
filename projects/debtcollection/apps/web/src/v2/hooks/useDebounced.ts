import { useEffect, useState } from 'react';

/**
 * A value that settles after the user stops changing it — so typing into a search asks the source
 * one question, not one per keystroke. Every question still restarts paging and orphans older answers.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

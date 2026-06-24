"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type QueryStateSetter<T extends string> = (value: T) => Promise<unknown>;

/**
 * Keeps a URL-backed view toggle responsive while the query-string update
 * settles. nuqs intentionally synchronizes with the URL, which can briefly lag
 * behind an interaction; holding the clicked value locally prevents a visible
 * bounce between card/list/map states.
 */
export function useStableQueryView<T extends string>({
  queryValue,
  setQueryValue,
  values,
  defaultValue,
  param = "view",
}: {
  queryValue: T;
  setQueryValue: QueryStateSetter<T>;
  values: readonly T[];
  defaultValue: T;
  param?: string;
}): [T, (nextValue: T) => void] {
  const pendingValueRef = useRef<T | null>(null);
  const [value, setValue] = useState<T>(() => readQueryValue(param, values) ?? queryValue ?? defaultValue);

  useLayoutEffect(() => {
    const locationValue = readQueryValue(param, values);
    const canonicalLocationValue = locationValue ?? defaultValue;
    const pendingValue = pendingValueRef.current;

    if (pendingValue !== null && canonicalLocationValue === pendingValue) {
      pendingValueRef.current = null;
    }

    const nextValue = pendingValueRef.current ?? locationValue ?? queryValue;
    setValue((currentValue) => (currentValue === nextValue ? currentValue : nextValue));
  }, [defaultValue, param, queryValue, values]);

  const setStableValue = useCallback((nextValue: T) => {
    pendingValueRef.current = nextValue;
    setValue(nextValue);

    void setQueryValue(nextValue)
      .then(() => {
        const settledValue = readQueryValue(param, values) ?? defaultValue;
        if (pendingValueRef.current === nextValue && settledValue === nextValue) {
          pendingValueRef.current = null;
        }
      })
      .catch(() => {
        if (pendingValueRef.current === nextValue) {
          pendingValueRef.current = null;
        }
      });
  }, [defaultValue, param, setQueryValue, values]);

  return [value, setStableValue];
}

function readQueryValue<T extends string>(param: string, values: readonly T[]): T | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(param);
  return values.includes(value as T) ? (value as T) : null;
}

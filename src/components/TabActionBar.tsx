'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const Selections = createContext<Map<string, string> | null>(null);

// The tab owns the selections while its page and Firestore listeners unmount.
export function TabActionBar({ children }: { children: ReactNode }) {
  const [values] = useState(() => new Map<string, string>());
  return <Selections.Provider value={values}>{children}</Selections.Provider>;
}

export function useActionBarSelection<T extends string>(key: string, initial: T) {
  const values = useContext(Selections);
  const [selection, setSelection] = useState<T>(() => (values?.get(key) as T | undefined) ?? initial);
  const select = useCallback((value: T) => {
    values?.set(key, value);
    setSelection(value);
  }, [values, key]);
  return [selection, select] as const;
}

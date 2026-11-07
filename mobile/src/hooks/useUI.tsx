import { createContext, useContext } from 'react';
import type { Trip } from '@/types';

export interface UIContextValue {
  openCreateTrip: () => void;
  openEditTrip: (trip: Trip) => void;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside the app shell');
  return ctx;
}

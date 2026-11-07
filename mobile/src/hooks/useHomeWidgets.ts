import { useMemo } from 'react';
import { normalizeOrder, type WidgetId } from '@/features/home/widgets';
import { useProfile } from './useProfile';

/** The user's saved Home widget order (synced with their account), or the default one. */
export function useHomeWidgets(): WidgetId[] {
  const { data: profile } = useProfile();
  const saved = profile?.preferences?.home_widgets;
  return useMemo(() => normalizeOrder(saved), [saved]);
}

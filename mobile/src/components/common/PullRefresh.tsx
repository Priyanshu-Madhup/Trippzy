import { useState } from 'react';
import { RefreshControl } from 'react-native';

/**
 * Pull-to-refresh for a ScrollView: `const pull = usePullRefresh(refetch)` then `<ScrollView refreshControl={pull} />`.
 * The spinner shows only while the user's own pull is running. Background refetches (polling while a ticket is being
 * read, refocus, etc.) never drop the circle down from the top, since the screen already shows its own progress.
 */
export function usePullRefresh(onRefresh: () => unknown) {
  const [pulling, setPulling] = useState(false);
  return (
    <RefreshControl
      refreshing={pulling}
      onRefresh={() => {
        setPulling(true);
        void Promise.resolve(onRefresh()).finally(() => setPulling(false));
      }}
    />
  );
}

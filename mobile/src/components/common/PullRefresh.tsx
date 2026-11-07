import { RefreshControl } from 'react-native';

/** Pull-to-refresh control for a ScrollView: `<ScrollView refreshControl={pullRefresh(refetch, isRefetching)} />`. */
export function pullRefresh(onRefresh: () => unknown, refreshing: boolean) {
  return <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />;
}

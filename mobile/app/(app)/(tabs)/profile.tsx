import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Cake, FileText, Globe, Map, Pencil, Ticket, User } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/common/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useDisplayName, useProfile } from '@/hooks/useProfile';
import { useStats } from '@/hooks/useTickets';
import { countryName, flagEmoji } from '@/lib/countries';
import { useShadow } from '@/theme/useShadow';
import { formatUploaded } from '@/utils/date';

const GENDER_LABEL = { female: 'Female', male: 'Male', non_binary: 'Non-binary', prefer_not: 'Prefers not to say' } as const;

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const name = useDisplayName();
  const { data: profile } = useProfile();
  const { data: stats, isLoading } = useStats();
  const lift = useShadow('lift');
  const soft = useShadow('soft');

  const cards = [
    { label: 'Trips', value: stats?.trips, icon: Map },
    { label: 'Tickets', value: stats?.tickets, icon: Ticket },
    { label: 'Documents', value: stats?.documents, icon: FileText },
  ];

  const details = [
    profile?.country ? { key: 'country', icon: Globe, text: `${flagEmoji(profile.country)} ${countryName(profile.country) ?? profile.country}` } : null,
    profile?.age ? { key: 'age', icon: Cake, text: `${profile.age} years` } : null,
    profile?.gender ? { key: 'gender', icon: User, text: GENDER_LABEL[profile.gender] } : null,
  ].filter((d): d is NonNullable<typeof d> => !!d);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: 56, paddingHorizontal: 16 }}>
      <Text className="pb-6 font-geist-semibold text-[34px] leading-[34px]" style={{ letterSpacing: -1.36 }}>
        Profile
      </Text>

      <Animated.View entering={FadeInUp.duration(300)} style={soft} className="rounded-card border border-line bg-surface p-5">
        <View className="flex-row items-start gap-4">
          <Animated.View entering={ZoomIn.springify().stiffness(260).damping(22)} style={[lift, { borderRadius: 40 }]}>
            <Avatar name={name} src={user?.hasImage ? user.imageUrl : null} size={72} style={{ borderWidth: 3, borderColor: 'transparent' }} />
          </Animated.View>
          <View className="min-w-0 flex-1 pt-1">
            <Text numberOfLines={2} className="font-geist-semibold text-[24px] leading-[28px]" style={{ letterSpacing: -0.8 }}>
              {name}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-[14px] text-muted">
              {user?.primaryEmailAddress?.emailAddress}
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-row flex-wrap gap-2">
          {details.length ? (
            details.map((d) => (
              <View key={d.key} className="flex-row items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5">
                <Icon as={d.icon} size={13} className="text-muted" />
                <Text className="font-geist-medium text-[12px] text-ink-2">{d.text}</Text>
              </View>
            ))
          ) : (
            <Text className="text-[13px] text-muted">Add your country, age and more to personalise Trippzy.</Text>
          )}
        </View>

        <View className="mt-5 flex-row items-center justify-between gap-3 border-t border-line pt-4">
          <Text numberOfLines={1} className="flex-1 text-xs text-faint">
            {profile?.created_at ? `Travelling with us since ${formatUploaded(profile.created_at)}` : ' '}
          </Text>
          <Pressable
            onPress={() => router.push('/edit-profile')}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            className="h-10 flex-row items-center gap-2 rounded-full border border-line-strong bg-surface px-4 active:bg-surface-2"
          >
            <Icon as={Pencil} size={15} className="text-ink" />
            <Text className="font-geist-semibold text-[13px]">Edit profile</Text>
          </Pressable>
        </View>
      </Animated.View>

      <View className="mt-4 flex-row gap-3">
        {cards.map(({ label, value, icon }, i) => (
          <Animated.View key={label} entering={FadeInUp.delay(50 * (i + 1)).duration(300)} style={soft} className="flex-1 rounded-3xl border border-line bg-surface p-4">
            <Icon as={icon} size={20} className="text-muted" />
            {isLoading ? <Skeleton className="mt-4 h-8 w-12" /> : <Text className="mt-4 font-geist-semibold text-[32px] leading-[32px]" style={{ letterSpacing: -1.28 }}>{value ?? 0}</Text>}
            <Text className="mt-1.5 text-sm text-muted">{label}</Text>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

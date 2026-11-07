import { useUser } from '@clerk/expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Asset } from 'expo-asset';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { ChevronDown, Pencil, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { Avatar } from '@/components/common/Avatar';
import { CountryPicker } from '@/components/common/CountryPicker';
import { PhotoSheet } from '@/components/profile/PhotoSheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useProfile } from '@/hooks/useProfile';
import { countryName, flagEmoji } from '@/lib/countries';
import { qk } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { updateProfile } from '@/services/account';
import type { Gender } from '@/types';

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

/** Edit your details: name, gender, age and country. Opened from the Profile tab. */
export default function EditProfile() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { data: profile, isLoading } = useProfile();

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [age, setAge] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [pickCountry, setPickCountry] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!profile || filled) return;
    // Older accounts only have one "name": split it, or use what Clerk knows.
    const parts = (profile.name ?? '').trim().split(/\s+/).filter(Boolean);
    setFirst(profile.first_name ?? user?.firstName ?? parts[0] ?? '');
    setLast(profile.last_name ?? user?.lastName ?? parts.slice(1).join(' '));
    setGender(profile.gender ?? null);
    setAge(profile.age ? String(profile.age) : '');
    setCountry(profile.country ?? null);
    setFilled(true);
  }, [profile, filled, user]);

  const ageNum = age.trim() === '' ? null : Number(age);
  const ageError = ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 5 || ageNum > 120) ? 'Enter an age between 5 and 120.' : null;
  const firstError = filled && !first.trim() ? 'Your first name is needed.' : null;

  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      first.trim() !== (profile.first_name ?? '') ||
      last.trim() !== (profile.last_name ?? '') ||
      gender !== (profile.gender ?? null) ||
      ageNum !== (profile.age ?? null) ||
      country !== (profile.country ?? null)
    );
  }, [profile, first, last, gender, ageNum, country]);

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (p) => {
      qc.setQueryData(qk.profile, p);
      toast.success('Profile updated');
      close();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save.'),
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // ── profile photo (stored by Clerk; takes effect immediately, independent of the Save button) ──
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const displayName = [first, last].filter(Boolean).join(' ') || profile?.name || user?.fullName || 'You';
  const photo = user?.hasImage ? user.imageUrl : null; // no photo = the initials avatar (the default)

  /** Run a photo change (`file` = a data URL, or null to remove the photo) with a spinner and a result message. */
  async function applyPhoto(make: () => Promise<string | null>, done: string) {
    if (!user || photoBusy) return;
    try {
      const file = await make();
      if (file === undefined) return;
      setPhotoBusy(true);
      await user.setProfileImage({ file });
      await user.reload();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t update your photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const fromGallery = () =>
    applyPhoto(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
      if (res.canceled) return undefined as unknown as string;
      const asset = res.assets[0];
      if (!asset?.base64) throw new Error('Couldn’t read that picture. Try another one.');
      if (asset.base64.length > 9_000_000) throw new Error('That picture is too large. Choose a smaller one.');
      return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
    }, 'Profile photo updated');

  const fromAvatar = (module: number) =>
    applyPhoto(async () => {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      const b64 = await readAsStringAsync(asset.localUri ?? asset.uri, { encoding: EncodingType.Base64 });
      return `data:image/png;base64,${b64}`;
    }, 'Avatar updated');

  const removePhoto = () => applyPhoto(async () => null, 'Back to the default avatar');

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-surface">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }}>
        <View className="flex-row items-start justify-between gap-4 px-6">
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="font-geist-semibold text-[26px] tracking-tight">
              Edit profile
            </Text>
            <Text className="mt-1 text-sm text-muted">Tell us a little about you.</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="-mr-2 size-10 items-center justify-center rounded-full active:bg-surface-2">
            <Icon as={X} size={20} className="text-muted" />
          </Pressable>
        </View>

        <View className="items-center pt-6">
          <Pressable onPress={() => setPhotoSheet(true)} accessibilityRole="button" accessibilityLabel="Change profile photo" disabled={photoBusy}>
            <Avatar name={displayName} src={photo} size={96} />
            {photoBusy ? (
              <View className="absolute inset-0 items-center justify-center rounded-full bg-black/45">
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            <View className="absolute -bottom-0.5 -right-0.5 size-9 items-center justify-center rounded-full border-[3px] border-surface bg-primary">
              <Icon as={Pencil} size={14} className="text-primary-ink" />
            </View>
          </Pressable>
          <Text className="mt-2 text-xs text-muted">Tap to change your photo or pick an avatar</Text>
        </View>

        <View className="gap-5 px-6 pt-6">
          {isLoading || !filled ? (
            <View className="gap-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </View>
          ) : (
            <>
              <View className="flex-row gap-3">
                <Field label="First name" error={firstError} className="flex-1">
                  <Input value={first} onChangeText={setFirst} maxLength={40} placeholder="First name" autoCapitalize="words" textContentType="givenName" accessibilityLabel="First name" invalid={!!firstError} />
                </Field>
                <Field label="Last name" className="flex-1">
                  <Input value={last} onChangeText={setLast} maxLength={40} placeholder="Last name" autoCapitalize="words" textContentType="familyName" accessibilityLabel="Last name" />
                </Field>
              </View>

              <Field label="Gender">
                <View className="flex-row flex-wrap gap-2">
                  {GENDERS.map((g) => {
                    const active = gender === g.value;
                    return (
                      <Pressable
                        key={g.value}
                        onPress={() => setGender(active ? null : g.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        className={cn('h-10 items-center justify-center rounded-full px-4', active ? 'bg-primary' : 'border border-line bg-surface')}
                      >
                        <Text className={cn('font-geist-medium text-sm', active ? 'text-primary-ink' : 'text-ink-2')}>{g.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <View className="flex-row gap-3">
                <Field label="Age" error={ageError} className="w-[34%]">
                  <Input value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" maxLength={3} placeholder="—" accessibilityLabel="Age" invalid={!!ageError} />
                </Field>
                <Field label="Country" className="flex-1">
                  <Pressable onPress={() => setPickCountry(true)} accessibilityRole="button" accessibilityLabel="Country" className="h-12 flex-row items-center gap-2 rounded-2xl border border-line bg-surface px-4 active:bg-surface-2">
                    {country ? <Text className="text-[18px]">{flagEmoji(country)}</Text> : null}
                    <Text numberOfLines={1} className={cn('flex-1 text-[15px]', !country && 'text-faint')}>
                      {countryName(country) ?? 'Select'}
                    </Text>
                    <Icon as={ChevronDown} size={16} className="text-muted" />
                  </Pressable>
                </Field>
              </View>

              <Field label="Email" hint="Your sign-in email can’t be changed here.">
                <View className="h-12 justify-center rounded-2xl bg-surface-2 px-4">
                  <Text numberOfLines={1} className="text-[15px] text-muted">
                    {user?.primaryEmailAddress?.emailAddress ?? '—'}
                  </Text>
                </View>
              </Field>

              <View className="flex-row justify-end gap-2 pt-2">
                <Button variant="ghost" onPress={close}>
                  Cancel
                </Button>
                <Button
                  loading={save.isPending}
                  disabled={!dirty || !!ageError || !first.trim()}
                  className="min-w-36"
                  onPress={() => save.mutate({ first_name: first.trim(), last_name: last.trim() || null, gender, age: ageNum, country })}
                >
                  Save changes
                </Button>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <PhotoSheet open={photoSheet} onClose={() => setPhotoSheet(false)} hasPhoto={!!user?.hasImage} onGallery={() => void fromGallery()} onAvatar={(m) => void fromAvatar(m)} onRemove={() => void removePhoto()} />
      <CountryPicker open={pickCountry} onClose={() => setPickCountry(false)} value={country} onSelect={setCountry} />
    </KeyboardAvoidingView>
  );
}

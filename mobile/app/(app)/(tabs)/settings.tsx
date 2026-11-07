import { useAuth } from '@clerk/expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Download, LayoutList, LogOut, Monitor, Moon, RefreshCw, Sun, Trash2 } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { ConfirmSheet } from '@/components/common/ConfirmSheet';
import { Button } from '@/components/ui/Button';
import { Segmented, Switch } from '@/components/ui/Controls';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useProfile } from '@/hooks/useProfile';
import { qk } from '@/lib/queryClient';
import { deleteAccount, updateProfile } from '@/services/account';
import { currentVersion, startUpdate } from '@/services/appUpdate';
import { calendarAvailable, ensureCalendarAccess, getAutoAdd, setAutoAdd } from '@/services/calendar';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { useShadow } from '@/theme/useShadow';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const { theme, setTheme } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { info, recheck } = useAppUpdate();
  const [checking, setChecking] = useState(false);

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (p) => qc.setQueryData(qk.profile, p),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save.'),
  });

  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      setConfirmDelete(false);
      try {
        await signOut(); // the Clerk user is already gone; this clears the local session
      } catch {
        /* nothing left to sign out of */
      }
      qc.clear();
      router.replace('/welcome');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete your account.'),
  });

  // ── calendar reminders (a per-phone setting) ──
  const [calendarOn, setCalendarOn] = useState(false);
  useEffect(() => {
    void getAutoAdd().then(setCalendarOn);
  }, []);
  async function toggleCalendar(on: boolean) {
    if (on && !calendarAvailable()) {
      toast.error('Calendar reminders need the updated Trippzy app. Install the new build first.');
      return;
    }
    if (on && !(await ensureCalendarAccess())) {
      toast.error('Allow calendar access in your phone’s settings to turn this on.');
      return;
    }
    setCalendarOn(on);
    await setAutoAdd(on);
  }

  const notifications = profile?.preferences?.notifications !== false;

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: 56, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
      <Text className="pb-8 font-geist-semibold text-[34px] leading-[34px]" style={{ letterSpacing: -1.36 }}>
        Settings
      </Text>

      <View className="gap-6">
        <Section title="Home screen">
          <Row label="Widgets" hint="Choose the order of the cards on your Home screen.">
            <Button variant="secondary" size="sm" icon={LayoutList} onPress={() => router.push('/home-widgets')}>
              Edit
            </Button>
          </Row>
        </Section>

        <Section title="Appearance">
          <View className="gap-3">
            <Text className="font-geist-medium text-[15px]">Theme</Text>
            <Segmented<ThemePreference>
              label="Theme"
              size="sm"
              className="self-stretch"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System', icon: <Icon as={Monitor} size={16} className="text-ink" /> },
                { value: 'light', label: 'Light', icon: <Icon as={Sun} size={16} className="text-ink" /> },
                { value: 'dark', label: 'Dark', icon: <Icon as={Moon} size={16} className="text-ink" /> },
              ]}
            />
          </View>
        </Section>

        <Section title="Notifications">
          <Row label="Processing updates" hint="A short notice when a ticket has been read and added to your trip.">
            <Switch label="Processing updates" checked={notifications} disabled={!profile} onCheckedChange={(v) => save.mutate({ preferences: { notifications: v } })} />
          </Row>
          <Row label="Calendar reminders" hint="Add each new ticket to a “Trippzy” calendar on this phone, with an alert shortly before it starts.">
            <Switch label="Calendar reminders" checked={calendarOn} onCheckedChange={(v) => void toggleCalendar(v)} />
          </Row>
        </Section>

        <Section title="About">
          <Row label="Trippzy" value={`Version ${currentVersion}`} />
          <Row label="Terms & Privacy" hint="What we do with your data, and where it’s stored.">
            <Button variant="secondary" size="sm" onPress={() => router.push('/terms')}>
              Read
            </Button>
          </Row>
          <Row label={info?.update_available ? `Version ${info.latest} is available` : 'Updates'} hint={info?.update_available ? 'Tap to download it. Your trips stay as they are.' : info?.latest ? 'You’re up to date.' : 'Check whether a newer version is out.'}>
            {info?.update_available ? (
              <Button size="sm" icon={Download} onPress={() => startUpdate(info)}>
                Update
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                loading={checking}
                onPress={async () => {
                  setChecking(true);
                  const v = await recheck();
                  setChecking(false);
                  toast(v ? (v.update_available ? `Version ${v.latest} is available` : 'You’re up to date') : 'Couldn’t check right now');
                }}
              >
                Check
              </Button>
            )}
          </Row>
        </Section>

        <Section title="Account">
          <Row label="Delete account" hint="Permanently erases your trips, tickets and files. This can’t be undone.">
            <Button variant="secondary" size="sm" icon={Trash2} onPress={() => setConfirmDelete(true)} className="border-danger/30">
              Delete
            </Button>
          </Row>
        </Section>

        <Button
          variant="secondary"
          size="lg"
          icon={LogOut}
          className="w-full"
          onPress={async () => {
            await signOut();
            qc.clear();
            router.replace('/welcome');
          }}
        >
          Log out
        </Button>
      </View>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        description="Your trips, tickets and uploaded files will be permanently erased, and you’ll be signed out. This can’t be undone."
        confirmLabel="Delete everything"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const soft = useShadow('soft');
  return (
    <View style={soft} className="rounded-card border border-line bg-surface p-5">
      <Text className="mb-4 font-geist-semibold text-[13px] uppercase tracking-[1.5px] text-muted">{title}</Text>
      <View className="gap-4">{children}</View>
    </View>
  );
}

function Row({ label, hint, value, children }: { label: string; hint?: string; value?: string; children?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="min-w-0 flex-1">
        <Text className="font-geist-medium text-[15px]">{label}</Text>
        {hint ? <Text className="mt-0.5 text-[13px] text-muted">{hint}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} className="max-w-[60%] text-[15px] text-muted">{value}</Text> : children}
    </View>
  );
}

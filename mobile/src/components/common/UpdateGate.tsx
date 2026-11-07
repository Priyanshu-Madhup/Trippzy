import { Download, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { currentVersion, formatSize, getSeenVersion, markSeen, releaseNotes, startUpdate } from '@/services/appUpdate';

/**
 * Runs every time the app opens. A newer release → an "Update available" screen with what changed.
 * Just updated → a one-time "What's new" screen. Anything else (offline, no release yet) → nothing.
 */
export function UpdateGate() {
  const { info } = useAppUpdate();
  const [mode, setMode] = useState<'update' | 'whatsnew' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!info?.latest || dismissed) return;
    if (info.update_available) {
      setMode('update');
      return;
    }
    let live = true;
    void getSeenVersion().then((seen) => {
      if (!live) return;
      if (seen === null) void markSeen(currentVersion); // fresh install: nothing "new" to announce
      else if (seen !== currentVersion && info.latest === currentVersion && releaseNotes(info.notes).length) setMode('whatsnew');
      else if (seen !== currentVersion) void markSeen(currentVersion);
    });
    return () => {
      live = false;
    };
  }, [info, dismissed]);

  if (!info) return null;
  const lines = releaseNotes(info.notes);
  const close = () => {
    setDismissed(true);
    setMode(null);
    if (mode === 'whatsnew') void markSeen(currentVersion);
  };

  return (
    <Sheet
      open={mode !== null}
      onClose={close}
      title={mode === 'update' ? 'Update available' : `What’s new in ${currentVersion}`}
      description={mode === 'update' ? `Trippzy ${info.latest} is ready${info.size ? ` · ${formatSize(info.size)}` : ''}. You’re on ${currentVersion}.` : 'Trippzy was updated. Here’s what changed.'}
    >
      <View className="gap-5 px-6 pb-6 pt-4">
        <View className="gap-2.5 rounded-2xl bg-surface-2 p-4">
          <View className="flex-row items-center gap-2">
            <Icon as={Sparkles} size={15} className="text-ink-2" />
            <Text className="font-geist-semibold text-[13px]">What’s changed</Text>
          </View>
          {lines.length ? (
            lines.map((l, i) => (
              <View key={i} className="flex-row gap-2.5">
                <View className="mt-[8px] size-1.5 rounded-full bg-ink-2" />
                <Text className="flex-1 text-[14px] leading-5 text-ink-2">{l}</Text>
              </View>
            ))
          ) : (
            <Text className="text-[14px] text-muted">Improvements and fixes.</Text>
          )}
        </View>

        {mode === 'update' ? (
          <View className="gap-2">
            <Button icon={Download} size="lg" onPress={() => startUpdate(info)}>
              Update now
            </Button>
            <Text className="px-2 text-center text-xs text-faint">Your phone downloads the update, then asks you to install it. Your trips and tickets stay as they are.</Text>
            <Button variant="ghost" onPress={close}>
              Later
            </Button>
          </View>
        ) : (
          <Button size="lg" onPress={close}>
            Got it
          </Button>
        )}
      </View>
    </Sheet>
  );
}

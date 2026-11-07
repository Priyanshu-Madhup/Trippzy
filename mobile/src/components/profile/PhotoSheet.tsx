import { Image } from 'expo-image';
import { ImagePlus, UserRound } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { AVATARS } from '@/lib/avatars';

/** Choose a profile picture: one of the built-in avatars, a photo from the gallery, or go back to the default. */
export function PhotoSheet({
  open,
  onClose,
  hasPhoto,
  onGallery,
  onAvatar,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  hasPhoto: boolean;
  onGallery: () => void;
  onAvatar: (asset: number) => void;
  onRemove: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Profile photo" description="Pick an avatar, or use your own picture.">
      <View className="px-6 pb-6 pt-4">
        <Text className="mb-3 text-[11px] font-geist-medium uppercase tracking-[1.1px] text-faint">Avatars</Text>
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {AVATARS.map((asset, i) => (
            <Pressable
              key={i}
              onPress={() => {
                onClose();
                onAvatar(asset);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Use avatar ${i + 1}`}
              className="active:opacity-70"
              style={{ width: '22%', aspectRatio: 1 }}
            >
              <Image source={asset} contentFit="cover" style={{ flex: 1, borderRadius: 999 }} accessibilityIgnoresInvertColors />
            </Pressable>
          ))}
        </View>

        <View className="mt-6 gap-2">
          <Button
            variant="secondary"
            icon={ImagePlus}
            onPress={() => {
              onClose();
              onGallery();
            }}
          >
            Upload from gallery
          </Button>
          {hasPhoto ? (
            <Pressable
              onPress={() => {
                onClose();
                onRemove();
              }}
              accessibilityRole="button"
              className="h-12 flex-row items-center justify-center gap-2 rounded-full active:bg-surface-2"
            >
              <Icon as={UserRound} size={16} className="text-muted" />
              <Text className="font-geist-medium text-[14px] text-ink-2">Restore default (initials)</Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="mt-4 text-[11px] text-faint">Avatars by DiceBear (Lorelei, Notionists, Thumbs), public domain.</Text>
      </View>
    </Sheet>
  );
}

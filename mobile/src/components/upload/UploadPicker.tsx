import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Camera, FileUp, Plus } from 'lucide-react-native';
import { View } from 'react-native';
import { toast } from 'sonner-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { ACCEPTED_MIME, type PickedFile } from '@/services/upload';
import { useShadow } from '@/theme/useShadow';

/** Opens the system file picker (PDF / images). No storage permission is needed (Android SAF). */
export async function pickDocuments(): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: [...ACCEPTED_MIME], multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size ?? 0 }));
}

/** Photograph a ticket. Asks for the camera permission the first time. */
export async function takePhoto(): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    toast.error('Allow camera access in Settings to photograph a ticket.');
    return [];
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName ?? `ticket-${Date.now()}-${i}.jpg`,
    mimeType: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? 0,
  }));
}

/** Trippy's hero dropzone, as tap targets (there is no drag & drop on a phone). */
export function UploadPicker({ onFiles, variant = 'hero' }: { onFiles: (files: PickedFile[]) => void; variant?: 'hero' | 'compact' }) {
  const lift = useShadow('lift');
  const run = (fn: () => Promise<PickedFile[]>) => async () => {
    try {
      const files = await fn();
      if (files.length) onFiles(files);
    } catch {
      toast.error('Couldn’t open that. Please try again.');
    }
  };

  if (variant === 'compact') {
    return (
      <View className="flex-row gap-2.5 rounded-[22px] border border-dashed border-line-strong bg-surface/60 p-3">
        <Button className="flex-1" icon={Plus} onPress={run(pickDocuments)}>
          Upload ticket
        </Button>
        <Button variant="secondary" icon={Camera} onPress={run(takePhoto)} accessibilityLabel="Take a photo" />
      </View>
    );
  }

  return (
    <View className="items-center overflow-hidden rounded-[28px] border-[1.5px] border-dashed border-line-strong bg-surface px-6 py-12">
      <View style={lift} className="size-16 items-center justify-center rounded-[22px] bg-primary">
        <Icon as={FileUp} size={28} className="text-primary-ink" />
      </View>
      <Text className="mt-6 font-geist-semibold text-xl tracking-tight">Drop your tickets here</Text>
      <Text className="mt-1.5 max-w-xs text-center text-[15px] text-muted">or upload a PDF or image — we’ll read it and organise everything for you.</Text>
      <View className="mt-7 w-full gap-2.5">
        <Button size="lg" icon={Plus} className="w-full" onPress={run(pickDocuments)}>
          Upload ticket
        </Button>
        <Button size="lg" variant="secondary" icon={Camera} className="w-full" onPress={run(takePhoto)}>
          Take a photo
        </Button>
      </View>
      <Text className="mt-5 text-xs tracking-wide text-faint">PDF · PNG · JPG · WEBP — up to 20 MB each</Text>
    </View>
  );
}

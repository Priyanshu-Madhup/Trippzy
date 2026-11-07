import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { hashHue, initials } from '@/lib/utils';

export function Avatar({ name, src, size = 36, style }: { name: string; src?: string | null; size?: number; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState(false);
  const hue = hashHue(name);
  if (src && !failed) {
    return <Image source={{ uri: src }} onError={() => setFailed(true)} style={[{ width: size, height: size, borderRadius: size / 2 }, style as object]} />;
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]}>
      <LinearGradient colors={[`hsl(${hue}, 35%, 30%)`, `hsl(${(hue + 40) % 360}, 50%, 55%)`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text className="font-geist-semibold text-white" style={{ fontSize: size * 0.38 }}>
          {initials(name)}
        </Text>
      </LinearGradient>
    </View>
  );
}

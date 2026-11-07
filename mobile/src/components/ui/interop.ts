/** Teach NativeWind about third-party components so they accept `className`. Import once at the root. */
import { cssInterop } from 'nativewind';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

cssInterop(Image, { className: 'style' });
cssInterop(LinearGradient, { className: 'style' });
cssInterop(BlurView, { className: 'style' });

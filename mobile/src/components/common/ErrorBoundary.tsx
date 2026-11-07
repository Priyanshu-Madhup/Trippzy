import { Component, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Message only: stack traces and props can contain document details.
    console.warn('[ui] render error:', error.message);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-geist-semibold text-2xl tracking-tight">Something went wrong</Text>
        <Text className="mt-2 text-center text-[15px] text-muted">Please try again.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} accessibilityRole="button" className="mt-6 h-11 items-center justify-center rounded-full bg-primary px-6">
          <Text className="font-geist-medium text-sm text-primary-ink">Reload</Text>
        </Pressable>
      </View>
    );
  }
}

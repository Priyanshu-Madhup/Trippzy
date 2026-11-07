import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

/** Trippy's ConfirmDialog as a bottom sheet. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      {children}
      <View className="flex-row justify-end gap-2 px-6 pb-6 pt-6">
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onPress={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </View>
    </Sheet>
  );
}

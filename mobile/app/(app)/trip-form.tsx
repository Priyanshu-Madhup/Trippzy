import { useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Icon } from '@/components/ui/Icon';
import { Field, Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useCreateTrip, useTrip, useUpdateTrip } from '@/hooks/useTrips';

/**
 * Create a trip (`/trip-form`) or edit one (`/trip-form?tripId=…`). A real screen that slides up, so it
 * doesn't depend on any overlay host. Same fields and copy as Trippy's TripFormModal.
 */
export default function TripForm() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: trip } = useTrip(tripId);
  const create = useCreateTrip();
  const update = useUpdateTrip();
  const editing = !!tripId;

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [errors, setErrors] = useState<{ name?: string; end?: string }>({});

  // Prefill once when editing (the trip comes from the cache instantly).
  const [filled, setFilled] = useState(!editing);
  useEffect(() => {
    if (filled || !trip) return;
    setName(trip.name);
    setDestination(trip.destination ?? '');
    setStart(trip.start_date ?? '');
    setEnd(trip.end_date ?? '');
    setFilled(true);
  }, [filled, trip]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const pending = create.isPending || update.isPending;

  async function submit() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give your trip a name.';
    if (start && end && end < start) next.end = 'The end date must be after the start date.';
    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      if (tripId) {
        await update.mutateAsync({ id: tripId, patch: { name: name.trim(), destination: destination.trim() || null, start_date: start || null, end_date: end || null } });
        toast.success('Trip updated');
        close();
      } else {
        const created = await create.mutateAsync({ name: name.trim(), destination: destination.trim() || null, start_date: start || null, end_date: end || null });
        router.replace({ pathname: '/trip/[tripId]', params: { tripId: created.id } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the trip.');
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-surface">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }}>
        <View className="flex-row items-start justify-between gap-4 px-6">
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="font-geist-semibold text-[26px] tracking-tight">
              {editing ? 'Edit trip' : 'New trip'}
            </Text>
            <Text className="mt-1 text-sm text-muted">{editing ? 'Update the details of this journey.' : 'Name it now — we’ll fill in the rest from your bookings.'}</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="-mr-2 size-10 items-center justify-center rounded-full active:bg-surface-2">
            <Icon as={X} size={20} className="text-muted" />
          </Pressable>
        </View>

        <View className="gap-5 px-6 pt-6">
          <Field label="Trip name" error={errors.name}>
            <Input value={name} onChangeText={setName} placeholder="Europe 2026" maxLength={120} invalid={!!errors.name} accessibilityLabel="Trip name" autoFocus={!editing} />
          </Field>

          <Field
            label="Destination"
            hint={
              <View className="flex-row items-center gap-1.5">
                <Icon as={MapPin} size={14} className="text-sun" />
                <Text className="text-[13px] text-muted">Optional — we’ll detect it from your tickets.</Text>
              </View>
            }
          >
            <Input value={destination} onChangeText={setDestination} placeholder="Paris" maxLength={80} accessibilityLabel="Destination" />
          </Field>

          <View className="flex-row gap-3">
            <Field label="Start" className="flex-1">
              <DateField label="Start" value={start} onChange={setStart} />
            </Field>
            <Field label="End" className="flex-1" error={errors.end}>
              <DateField label="End" value={end} onChange={setEnd} min={start || undefined} invalid={!!errors.end} />
            </Field>
          </View>

          <View className="flex-row justify-end gap-2 pt-2">
            <Button variant="ghost" onPress={close}>
              Cancel
            </Button>
            <Button loading={pending} onPress={submit} className="min-w-36">
              {editing ? 'Save changes' : 'Create trip'}
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { toast } from 'sonner-native';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Field, Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useUpdateTicket } from '@/hooks/useTickets';
import { cn } from '@/lib/utils';
import type { DocumentType, Ticket, TicketPatch } from '@/types';
import { TYPE_META } from '@/utils/ticket';

const TYPES: DocumentType[] = ['flight', 'hotel', 'train', 'bus', 'restaurant', 'activity', 'generic_travel_document'];

interface FormState {
  document_type: DocumentType;
  title: string;
  travel_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  origin: string;
  destination: string;
  provider_name: string;
  booking_reference: string;
  notes: string;
}

const fromTicket = (t: Ticket): FormState => ({
  document_type: t.document_type === 'unknown' ? 'generic_travel_document' : t.document_type,
  title: t.title ?? '',
  travel_date: t.travel_date ?? '',
  start_time: t.start_time ?? '',
  end_date: t.end_date ?? '',
  end_time: t.end_time ?? '',
  origin: t.origin ?? '',
  destination: t.destination ?? '',
  provider_name: t.provider_name ?? '',
  booking_reference: t.booking_reference ?? '',
  notes: t.notes ?? '',
});

const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** AI output is a starting point — every summary field is editable (port of Trippy's TicketEditModal). */
export function TicketEditSheet({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const update = useUpdateTicket();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (ticket) setForm(fromTicket(ticket));
  }, [ticket]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const isTransport = !!form && ['flight', 'train', 'bus'].includes(form.document_type);
  const isStay = form?.document_type === 'hotel';

  async function submit() {
    if (!ticket || !form) return;
    if (form.end_date && form.travel_date && form.end_date < form.travel_date) {
      toast.error('The end date must be after the start date.');
      return;
    }
    const patch: TicketPatch = {
      document_type: form.document_type,
      title: orNull(form.title),
      travel_date: orNull(form.travel_date),
      start_time: orNull(form.start_time),
      end_date: orNull(form.end_date),
      end_time: orNull(form.end_time),
      origin: orNull(form.origin),
      destination: orNull(form.destination),
      provider_name: orNull(form.provider_name),
      booking_reference: orNull(form.booking_reference),
      notes: orNull(form.notes),
    };
    try {
      await update.mutateAsync({ ticket, patch });
      toast.success('Details saved');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  return (
    <Sheet open={!!ticket} onClose={onClose} title="Edit details" description="Correct anything the AI got wrong — your edits always win.">
      {form ? (
        <View className="gap-4 px-6 pb-6 pt-5">
          <Field label="Type">
            <View className="flex-row flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: form.document_type === t }}
                  onPress={() => set('document_type', t)}
                  className={cn('h-9 justify-center rounded-full px-4', form.document_type === t ? 'bg-primary' : 'border border-line bg-surface')}
                >
                  <Text className={cn('font-geist-medium text-sm', form.document_type === t ? 'text-primary-ink' : 'text-ink-2')}>{TYPE_META[t].label}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Title">
            <Input value={form.title} onChangeText={(v) => set('title', v)} maxLength={140} accessibilityLabel="Title" />
          </Field>

          <View className="flex-row gap-3">
            <Field label={isStay ? 'Check-in date' : 'Date'} className="flex-1">
              <DateField label="Date" value={form.travel_date} onChange={(v) => set('travel_date', v)} />
            </Field>
            <Field label={isStay ? 'Check-in time' : 'Time'} className="flex-1">
              <DateField label="Time" mode="time" placeholder="Select time" value={form.start_time} onChange={(v) => set('start_time', v)} />
            </Field>
          </View>

          {isTransport || isStay ? (
            <View className="flex-row gap-3">
              <Field label={isStay ? 'Check-out date' : 'Arrival date'} className="flex-1">
                <DateField label="End date" value={form.end_date} min={form.travel_date || undefined} onChange={(v) => set('end_date', v)} />
              </Field>
              <Field label={isStay ? 'Check-out time' : 'Arrival time'} className="flex-1">
                <DateField label="End time" mode="time" placeholder="Select time" value={form.end_time} onChange={(v) => set('end_time', v)} />
              </Field>
            </View>
          ) : null}

          {isTransport ? (
            <Field label="From">
              <Input value={form.origin} onChangeText={(v) => set('origin', v)} placeholder="Bengaluru" accessibilityLabel="From" />
            </Field>
          ) : null}
          <Field label={isTransport ? 'To' : 'City'}>
            <Input value={form.destination} onChangeText={(v) => set('destination', v)} placeholder="Paris" accessibilityLabel="Destination" />
          </Field>

          <Field label="Provider">
            <Input value={form.provider_name} onChangeText={(v) => set('provider_name', v)} placeholder={form.document_type === 'flight' ? 'Airline' : form.document_type === 'hotel' ? 'Hotel' : 'Company'} accessibilityLabel="Provider" />
          </Field>
          <Field label="Booking reference">
            <Input value={form.booking_reference} onChangeText={(v) => set('booking_reference', v)} autoCapitalize="characters" className="font-geist-mono tracking-wide" accessibilityLabel="Booking reference" />
          </Field>
          <Field label="Notes">
            <Input multiline value={form.notes} onChangeText={(v) => set('notes', v)} maxLength={1000} placeholder="Gate closes 45 min before departure…" accessibilityLabel="Notes" />
          </Field>

          <View className="flex-row justify-end gap-2 pt-1">
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button loading={update.isPending} onPress={submit} className="min-w-32">
              Save
            </Button>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

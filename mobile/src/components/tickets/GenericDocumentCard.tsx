import { FileText, ImageIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import type { GenericData, Ticket } from '@/types';
import { formatLong, formatUploaded } from '@/utils/date';
import { detailsOf } from '@/utils/ticket';
import { Detail, ReviewNotice, TicketShell, type TicketHandlers } from './parts';

/** Fallback card — classification failing never means losing the document. */
export function GenericDocumentCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  const data = detailsOf<GenericData>(ticket, 'generic_travel_document') ?? detailsOf<GenericData>(ticket, 'unknown');
  const title = ticket.title ?? ticket.file_name ?? 'Document';
  const FileIcon = ticket.file_type === 'image' ? ImageIcon : FileText;
  const facts = (data?.key_facts ?? []).map((f) => ({ ...f, value: /^\d{4}-\d{2}-\d{2}$/.test(f.value) ? formatLong(f.value) : f.value }));

  return (
    <TicketShell ticket={ticket} handlers={handlers} openLabel="Open document">
      <View className="flex-row items-start gap-3 px-5 pt-5">
        <View className="size-11 items-center justify-center rounded-xl bg-surface-2">
          <Icon as={FileIcon} size={20} className="text-ink-2" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-geist-medium text-xs text-muted">Document{ticket.provider_name ? ` · ${ticket.provider_name}` : ''}</Text>
          <Text className="font-geist-semibold text-[17px] leading-[22px] tracking-tight">{title}</Text>
          <Text numberOfLines={1} className="mt-0.5 text-xs text-faint">
            {[ticket.file_name && ticket.file_name !== title ? ticket.file_name : null, `Uploaded ${formatUploaded(ticket.created_at)}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <ReviewNotice ticket={ticket} />

      {ticket.summary ? <Text className="px-5 pt-4 text-[14px] leading-[22px] text-ink-2">{ticket.summary}</Text> : null}

      {facts.length ? (
        <View className="mx-5 mt-4 flex-row flex-wrap gap-y-4 rounded-2xl bg-surface-2/70 p-4">
          {facts.map((f, i) => (
            <Detail key={`${f.label}-${i}`} label={f.label} value={f.value} />
          ))}
        </View>
      ) : null}
      {!ticket.summary && !facts.length ? <Text className="px-5 pt-4 text-sm text-muted">Some details couldn’t be identified. You can add them with “Edit details”.</Text> : null}
    </TicketShell>
  );
}

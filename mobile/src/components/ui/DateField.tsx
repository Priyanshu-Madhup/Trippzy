import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, Clock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { cn } from '@/lib/utils';
import { formatLong, parseDate, toISO } from '@/utils/date';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Trippy-styled field that opens the platform's own date / time picker (decision: native
 * Android dialog). Values use the same strings as the API: "YYYY-MM-DD" and "HH:mm".
 */
export function DateField({
  value,
  onChange,
  placeholder = 'Select date',
  min,
  mode = 'date',
  invalid,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** YYYY-MM-DD */
  min?: string;
  mode?: 'date' | 'time';
  invalid?: boolean;
  label: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const isTime = mode === 'time';

  const current = (() => {
    if (isTime) {
      const [h, m] = (value || '12:00').split(':').map(Number);
      const d = new Date();
      d.setHours(h || 0, m || 0, 0, 0);
      return d;
    }
    return parseDate(value) ?? new Date();
  })();

  const apply = (d: Date) => onChange(isTime ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : toISO(d));

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: true,
        minimumDate: !isTime && min ? (parseDate(min) ?? undefined) : undefined,
        onChange: (e, d) => {
          if (e.type === 'set' && d) apply(d);
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  const text = value ? (isTime ? value : formatLong(value)) : placeholder;
  return (
    <View>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? text : 'not set'}`}
        className={cn('h-12 flex-row items-center gap-2 rounded-2xl border bg-surface px-4 active:bg-surface-2', invalid ? 'border-danger/60' : 'border-line')}
      >
        <Icon as={isTime ? Clock : CalendarDays} size={17} className="text-faint" />
        <Text className={cn('flex-1 text-[15px]', value ? 'text-ink' : 'text-faint')}>{text}</Text>
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Icon as={X} size={16} className="text-muted" />
          </Pressable>
        ) : null}
      </Pressable>
      {iosOpen && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={current}
          mode={mode}
          display="spinner"
          minimumDate={!isTime && min ? (parseDate(min) ?? undefined) : undefined}
          onChange={(_e, d) => {
            setIosOpen(false);
            if (d) apply(d);
          }}
        />
      ) : null}
    </View>
  );
}

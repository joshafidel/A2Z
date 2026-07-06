import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';

interface CalendarPickerProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  /** Days before today are disabled. */
  maxDaysAhead?: number;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Month-grid calendar for picking the travel date. Pure RN, no deps. */
export function CalendarPicker({ selected, onSelect, maxDaysAhead = 365 }: CalendarPickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + maxDaysAhead * 86_400_000);

  const [viewYear, setViewYear] = useState((selected ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState((selected ?? today).getMonth());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const canGoBack = new Date(viewYear, viewMonth, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
  const canGoForward = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

  const changeMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const cells: Array<Date | null> = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          onPress={() => changeMonth(-1)}
          disabled={!canGoBack}
          style={styles.navButton}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={canGoBack ? colors.primary : colors.border} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {firstOfMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          onPress={() => changeMonth(1)}
          disabled={!canGoForward}
          style={styles.navButton}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={canGoForward ? colors.primary : colors.border} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`empty-${i}`} style={styles.cell} />;
          const disabled = date < today || date > maxDate;
          const isSelected = selected ? sameDay(date, selected) : false;
          const isToday = sameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              onPress={() => onSelect(date)}
              disabled={disabled}
              style={[styles.cell]}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: isSelected }}
            >
              <View
                style={[
                  styles.day,
                  isToday && !isSelected && styles.dayToday,
                  isSelected && styles.daySelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    disabled && styles.dayDisabled,
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...typography.heading, color: colors.ink },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, fontWeight: '600', color: colors.text },
  dayTextSelected: { color: '#FFFFFF' },
  dayDisabled: { color: colors.border },
});

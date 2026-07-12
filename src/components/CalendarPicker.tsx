import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';

interface CalendarPickerProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  /** Days before today are disabled. */
  maxDaysAhead?: number;
  /**
   * Range mode (round trips): `selected` is the start day, `rangeEnd` the
   * end day, and taps flow start → end → new start. Days in between get a
   * soft highlight.
   */
  rangeEnd?: Date;
  onSelectRange?: (start: Date, end?: Date) => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Month-grid calendar for picking a travel date or a date range. Pure RN. */
export function CalendarPicker({
  selected,
  onSelect,
  maxDaysAhead = 365,
  rangeEnd,
  onSelectRange,
}: CalendarPickerProps) {
  const handleTap = (date: Date) => {
    if (!onSelectRange) {
      onSelect(date);
      return;
    }
    // Range flow: no start (or a finished range) → new start; a tap on or
    // after the start closes the range; a tap before it restarts.
    if (!selected || rangeEnd) onSelectRange(date, undefined);
    else if (date >= selected) onSelectRange(selected, sameDay(date, selected) ? undefined : date);
    else onSelectRange(date, undefined);
  };
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
          const isStart = selected ? sameDay(date, selected) : false;
          const isEnd = rangeEnd ? sameDay(date, rangeEnd) : false;
          const isSelected = isStart || isEnd;
          const inRange =
            Boolean(onSelectRange && selected && rangeEnd) &&
            date > (selected as Date) &&
            date < (rangeEnd as Date);
          const isToday = sameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              onPress={() => handleTap(date)}
              disabled={disabled}
              style={[styles.cell, inRange && styles.cellInRange]}
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
                    inRange && styles.dayTextInRange,
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
  // Compact layout: the whole month + the rest of the date step fit on
  // one phone screen without scrolling, and the grid stays a tidy square
  // rather than stretching to the container width.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
    maxWidth: 330,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  navButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...typography.bodyMedium, fontSize: 15, color: colors.ink },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary },
  cellInRange: { backgroundColor: colors.primarySoft },
  dayTextInRange: { color: colors.primaryDark },
  dayText: { fontSize: 13, fontWeight: '600', color: colors.text },
  dayTextSelected: { color: '#FFFFFF' },
  dayDisabled: { color: colors.border },
});

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LivingTimelineItem } from '../services/timelineService';
import { colors, radii, spacing } from '../theme';
import { formatTime } from '../utils/time';
import { modeColor } from './ModeIcon';

const STATUS_META: Record<
  LivingTimelineItem['status'],
  { label?: string; color: string } // no label = plain row
> = {
  completed: { color: colors.textMuted },
  now: { label: 'NOW', color: colors.success },
  next: { label: 'NEXT', color: colors.primary },
  upcoming: { color: colors.textSecondary },
  changed: { label: 'CHANGED', color: colors.warning },
};

/**
 * The living timeline: statuses, sources, changes with previous times.
 * When the editing callbacks are provided, each row grows a "mark done /
 * undo" toggle and a remove button (generated items are restorable).
 */
export function LivingTimelineView({
  items,
  onToggleComplete,
  onRemove,
}: {
  items: LivingTimelineItem[];
  onToggleComplete?: (id: string, currentlyCompleted: boolean) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <View style={styles.container}>
      {items.map((item, i) => {
        const meta = STATUS_META[item.status];
        const done = item.status === 'completed';
        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.timeColumn}>
              {item.previousTime && (
                <Text style={styles.prevTime}>{formatTime(item.previousTime)}</Text>
              )}
              <Text style={[styles.time, done && styles.timeDone]}>{formatTime(item.time)}</Text>
            </View>

            <View style={styles.railColumn}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: done ? colors.border : modeColor(item.mode) },
                  (item.status === 'now' || item.status === 'next') && styles.dotActive,
                ]}
              />
              {i < items.length - 1 && <View style={styles.rail} />}
            </View>

            <View style={[styles.content, i < items.length - 1 && styles.contentSpacing]}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
                  {item.title}
                </Text>
                {meta.label && (
                  <View style={[styles.statusTag, { backgroundColor: meta.color }]}>
                    <Text style={styles.statusTagText}>{meta.label}</Text>
                  </View>
                )}
                {item.actionRequired && !done && (
                  <Ionicons name="hand-right-outline" size={13} color={colors.warning} />
                )}
              </View>
              {item.explanation ? (
                <Text style={styles.explanation} numberOfLines={2}>
                  {item.explanation}
                </Text>
              ) : null}
              <Text style={styles.source}>
                {item.source}
                {item.previousTime ? ` · was ${formatTime(item.previousTime)}` : ''}
              </Text>
            </View>

            {(onToggleComplete || onRemove) && (
              <View style={styles.rowActions}>
                {onToggleComplete && (
                  <Pressable
                    onPress={() => onToggleComplete(item.id, done)}
                    style={styles.rowAction}
                    accessibilityLabel={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={done ? 'checkbox' : 'square-outline'}
                      size={17}
                      color={done ? colors.success : colors.textMuted}
                    />
                  </Pressable>
                )}
                {onRemove && (
                  <Pressable
                    onPress={() => onRemove(item.id)}
                    style={styles.rowAction}
                    accessibilityLabel={`Remove ${item.title} from the timeline`}
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={15} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  timeColumn: { width: 66, alignItems: 'flex-end', paddingRight: spacing.md, paddingTop: 1 },
  time: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  timeDone: { color: colors.textMuted },
  prevTime: {
    fontSize: 11,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  railColumn: { alignItems: 'center', width: 18 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  dotActive: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  rail: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  content: { flex: 1, paddingLeft: spacing.sm },
  contentSpacing: { paddingBottom: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  statusTag: { borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 1 },
  statusTagText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  explanation: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  source: { fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  rowActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  rowAction: { padding: 6, minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
});

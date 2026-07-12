import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

export interface DragRankItem {
  id: string;
  title: string;
  subtitle?: string;
}

const ROW_HEIGHT = 60;
const ROW_GAP = 8;
const SLOT = ROW_HEIGHT + ROW_GAP;

/**
 * Drag-and-drop ranking list (works with touch and mouse via
 * PanResponder). Grab the handle on any row and drop it where it belongs;
 * the numbers update to the new order. Fixed row heights keep the math
 * exact on every platform.
 */
export function DragRankList({
  items,
  onReorder,
}: {
  items: DragRankItem[];
  onReorder: (idsInOrder: string[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  // Refs mirror state for use inside the responder callbacks.
  const dragRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const makeResponder = (index: number) =>
    // eslint-disable-next-line react-hooks/exhaustive-deps
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        dragRef.current = index;
        setDragIndex(index);
        setHoverIndex(index);
        translateY.setValue(0);
      },
      onPanResponderMove: (_e, g) => {
        translateY.setValue(g.dy);
        const from = dragRef.current;
        if (from === null) return;
        const target = Math.min(
          itemsRef.current.length - 1,
          Math.max(0, from + Math.round(g.dy / SLOT)),
        );
        setHoverIndex(target);
      },
      onPanResponderRelease: (_e, g) => {
        const from = dragRef.current;
        dragRef.current = null;
        setDragIndex(null);
        setHoverIndex(null);
        translateY.setValue(0);
        if (from === null) return;
        const to = Math.min(
          itemsRef.current.length - 1,
          Math.max(0, from + Math.round(g.dy / SLOT)),
        );
        if (to === from) return;
        const next = [...itemsRef.current];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onReorder(next.map((i) => i.id));
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragIndex(null);
        setHoverIndex(null);
        translateY.setValue(0);
      },
    });

  // One stable responder per slot — recreating them mid-gesture (on the
  // re-renders hover tracking causes) would drop the drag.
  const responders = useMemo(
    () => items.map((_, i) => makeResponder(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length],
  );

  return (
    <View>
      {items.map((item, index) => {
        const dragging = dragIndex === index;
        // Rows shift out of the way while another row is being dragged.
        let shift = 0;
        if (dragIndex !== null && hoverIndex !== null && !dragging) {
          if (dragIndex < index && hoverIndex >= index) shift = -SLOT;
          else if (dragIndex > index && hoverIndex <= index) shift = SLOT;
        }
        return (
          <Animated.View
            key={item.id}
            style={[
              styles.row,
              { transform: dragging ? [{ translateY }] : [{ translateY: shift }] },
              dragging && styles.rowDragging,
            ]}
          >
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            <View
              {...responders[index].panHandlers}
              style={styles.handle}
              accessibilityLabel={`Drag to reorder ${item.title}, currently number ${index + 1}`}
            >
              <Ionicons name="reorder-three" size={24} color={colors.textMuted} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  rowDragging: {
    borderColor: colors.primary,
    borderWidth: 2,
    zIndex: 10,
    elevation: 6,
    shadowColor: '#101A3D',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
  rowBody: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  handle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-expect-error web-only: show a grab cursor
    cursor: 'grab',
  },
});

import type { CSSProperties, ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMediaQuery } from '@/hooks/useBrowser';

export interface SortableRenderProps {
  setNodeRef: (el: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
  /** Spread both onto the drag handle button. */
  handleProps: DraggableAttributes;
  handleListeners: DraggableSyntheticListeners;
  setHandleRef: (el: HTMLElement | null) => void;
}

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Human-readable name for screen reader announcements ("Song title"). */
  getLabel: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, index: number, sortable: SortableRenderProps) => ReactNode;
  disabled?: boolean;
}

/**
 * Vertical drag-and-drop list (mouse, touch with long-press, and keyboard:
 * Space to lift, arrows to move, Space to drop, Escape to cancel).
 */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  disabled,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const labelOf = (id: string | number) => {
    const i = ids.indexOf(String(id));
    return i >= 0 ? getLabel(items[i]!) : 'item';
  };
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${labelOf(active.id)}, position ${pos(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} moved to position ${pos(over.id)} of ${ids.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} dropped at position ${pos(over.id)} of ${ids.length}.`
        : `${labelOf(active.id)} dropped.`,
    onDragCancel: ({ active }) =>
      `Reordering cancelled. ${labelOf(active.id)} returned to position ${pos(active.id)}.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To reorder, press Space or Enter to pick up. Use the arrow keys to move, Space or Enter to drop, Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {items.map((item, index) => (
          <SortableItem key={ids[index]} id={ids[index]!} disabled={disabled}>
            {(props) => renderItem(item, index, props)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (props: SortableRenderProps) => ReactNode;
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    transition: reducedMotion ? null : undefined,
  });
  return children({
    setNodeRef,
    setHandleRef: setActivatorNodeRef,
    isDragging,
    handleProps: attributes,
    handleListeners: listeners,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      position: 'relative',
      zIndex: isDragging ? 10 : undefined,
    },
  });
}

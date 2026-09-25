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
import { useI18n } from '@/i18n';

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
  const { t } = useI18n();
  const labelOf = (id: string | number) => {
    const i = ids.indexOf(String(id));
    return i >= 0 ? getLabel(items[i]!) : t('sortable.item');
  };
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1;

  const total = ids.length;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('sortable.pickedUp', { name: labelOf(active.id), position: pos(active.id), total }),
    onDragOver: ({ active, over }) =>
      over
        ? t('sortable.moved', { name: labelOf(active.id), position: pos(over.id), total })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('sortable.dropped', { name: labelOf(active.id), position: pos(over.id), total })
        : t('sortable.droppedAnywhere', { name: labelOf(active.id) }),
    onDragCancel: ({ active }) =>
      t('sortable.cancelled', { name: labelOf(active.id), position: pos(active.id) }),
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
        screenReaderInstructions: { draggable: t('sortable.instructions') },
        // The live region goes to <body>: inside the <ol>/<ul> it would be invalid list content.
        container: typeof document !== 'undefined' ? document.body : undefined,
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

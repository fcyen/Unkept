import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FadeIn from './FadeIn.jsx';

/**
 * Editorial photo layout with mixed compositions.
 * Cycles through layout patterns to create visual variety:
 *   - Full-width single
 *   - Side-by-side pair
 *   - Asymmetric (wide + narrow)
 *   - Trio
 */

const LAYOUT_PATTERNS = ['pair', 'single', 'asymmetric', 'trio', 'single', 'pair'];

function SortableImage({ photo, className }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`overflow-hidden cursor-grab active:cursor-grabbing ${className}`}
    >
      <img
        src={photo.thumbnailUrl || photo.objectUrl}
        alt=""
        className="w-full h-full object-cover editorial-img hover:scale-[1.02] transition-transform duration-700"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

export default function EditablePhotoLayout({ photos: initialPhotos, heroPhoto, onReorder }) {
  // Exclude the hero from the grid (it's shown full-bleed above)
  const [photos, setPhotos] = useState(() => {
    if (!heroPhoto) return initialPhotos;
    return initialPhotos.filter((p) => p.id !== heroPhoto.id);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    const newOrder = arrayMove(photos, oldIndex, newIndex);
    setPhotos(newOrder);
    // Report full list including hero back
    const full = heroPhoto ? [heroPhoto, ...newOrder] : newOrder;
    onReorder(full);
  };

  if (photos.length === 0) return null;

  // Build layout groups from the remaining photos
  const groups = [];
  let i = 0;
  let patternIdx = 0;

  while (i < photos.length) {
    const remaining = photos.length - i;
    let pattern = LAYOUT_PATTERNS[patternIdx % LAYOUT_PATTERNS.length];

    // Adjust pattern if not enough photos
    if (pattern === 'trio' && remaining < 3) pattern = remaining === 2 ? 'pair' : 'single';
    if (pattern === 'pair' && remaining < 2) pattern = 'single';
    if (pattern === 'asymmetric' && remaining < 2) pattern = 'single';

    if (pattern === 'single') {
      groups.push({ type: 'single', photos: [photos[i]] });
      i += 1;
    } else if (pattern === 'pair') {
      groups.push({ type: 'pair', photos: [photos[i], photos[i + 1]] });
      i += 2;
    } else if (pattern === 'asymmetric') {
      groups.push({ type: 'asymmetric', photos: [photos[i], photos[i + 1]] });
      i += 2;
    } else if (pattern === 'trio') {
      groups.push({ type: 'trio', photos: [photos[i], photos[i + 1], photos[i + 2]] });
      i += 3;
    }
    patternIdx++;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.id)}>
        <div className="space-y-4 md:space-y-6">
          {groups.map((group, gi) => (
            <FadeIn key={gi}>
              <LayoutGroup group={group} />
            </FadeIn>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function LayoutGroup({ group }) {
  const pad = 'px-4 md:px-8 lg:px-16 max-w-7xl mx-auto';

  switch (group.type) {
    case 'single':
      return (
        <div className={pad}>
          <SortableImage
            photo={group.photos[0]}
            className="w-full aspect-[3/2]"
          />
        </div>
      );

    case 'pair':
      return (
        <div className={`${pad} grid grid-cols-2 gap-4 md:gap-6`}>
          {group.photos.map((p) => (
            <SortableImage key={p.id} photo={p} className="aspect-[4/5]" />
          ))}
        </div>
      );

    case 'asymmetric':
      return (
        <div className={`${pad} grid grid-cols-5 gap-4 md:gap-6`}>
          <SortableImage
            photo={group.photos[0]}
            className="col-span-3 aspect-[4/3]"
          />
          <SortableImage
            photo={group.photos[1]}
            className="col-span-2 aspect-[4/3]"
          />
        </div>
      );

    case 'trio':
      return (
        <div className={`${pad} grid grid-cols-3 gap-4 md:gap-6`}>
          {group.photos.map((p) => (
            <SortableImage key={p.id} photo={p} className="aspect-square" />
          ))}
        </div>
      );

    default:
      return null;
  }
}

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
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortablePhoto({ photo }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="aspect-square rounded-lg overflow-hidden cursor-grab active:cursor-grabbing ring-1 ring-gray-800 hover:ring-blue-500 transition-all"
    >
      <img
        src={photo.thumbnailUrl || photo.objectUrl}
        alt={photo.name}
        className="w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

export default function PhotoGrid({ photos: initialPhotos, onReorder }) {
  const [photos, setPhotos] = useState(initialPhotos);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    const newOrder = arrayMove(photos, oldIndex, newIndex);

    setPhotos(newOrder);
    onReorder(newOrder);
  };

  if (photos.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">No photos for this chapter</p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <SortablePhoto key={photo.id} photo={photo} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { useStoryboardStore } from "@/store/storyboardStore";

function SortableCard({
  id,
  selected,
  onSelect,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const shot = useStoryboardStore((s) => s.shots.find((x) => x.id === id)!);
  const updateShot = useStoryboardStore((s) => s.updateShot);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "w-[320px] shrink-0 rounded-lg border border-white/10 bg-slate-900 p-4 shadow-sm transition-colors",
        "hover:border-indigo-500/50",
        selected && "ring-2 ring-indigo-500 shadow-glow"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" {...attributes} {...listeners} aria-label="drag">
          <GripVertical className="h-4 w-4 text-slate-400" />
        </button>
        <div className="text-sm font-semibold text-slate-50">
          {shot.order}. {shot.id}
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-400">Prompt</div>
      <textarea
        className="mt-2 w-full rounded-md border border-white/10 bg-black/20 p-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500/60"
        value={shot.prompt}
        placeholder="写下镜头的画面、角色、运镜、风格…"
        onChange={(e) => updateShot(id, { prompt: e.target.value })}
        rows={6}
      />
    </div>
  );
}

export function StoryboardEditor() {
  const shots = useStoryboardStore((s) => s.shots);
  const reorder = useStoryboardStore((s) => s.reorder);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ids = useMemo(() => shots.map((s) => s.id), [shots]);

  return (
    <div className="overflow-x-auto">
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over) reorder(String(active.id), String(over.id));
        }}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-[900px] gap-3">
            {shots.map((s) => (
              <SortableCard
                key={s.id}
                id={s.id}
                selected={selectedId === s.id}
                onSelect={() => setSelectedId(s.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}


import { ScriptEditor } from "@/components/features/script/ScriptEditor";
import { VideoPreview } from "@/components/features/video/VideoPreview";

export function EditorPage() {
  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <div className="flex h-full">
        <aside className="w-[35%] min-w-[400px] h-full border-r border-white/10 bg-slate-950 flex flex-col">
          <ScriptEditor />
        </aside>
        <div className="flex-1 h-full bg-black relative overflow-hidden">
          <VideoPreview />
        </div>
      </div>
    </div>
  );
}


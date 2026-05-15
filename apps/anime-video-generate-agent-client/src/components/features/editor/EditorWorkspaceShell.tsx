import { EditorAsideToolbar } from "@/components/features/editor/EditorAsideToolbar";
import { EditorWorkspaceSettingsSheet } from "@/components/features/editor/EditorWorkspaceSettingsSheet";
import { ScriptEditor } from "@/components/features/script/ScriptEditor";
import { VideoPreview } from "@/components/features/video/VideoPreview";
import { useEditorWorkspace } from "@/contexts/editor-workspace-context";
import { clampClientStoryboardMaxShots } from "@/lib/storyboard-limits";

/**
 * 编辑器布局壳：从工作区上下文取状态，再传给「剧本」等仍保留 props API 的子组件。
 * 页面层不再接触数十个字段（迪米特：壳件只认识上下文门面）。
 */
export function EditorWorkspaceShell() {
  const w = useEditorWorkspace();
  const fm = w.form;
  const gen = w.generation;
  const tk = w.task;

  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <EditorWorkspaceSettingsSheet />
      <div className="flex h-full">
        <aside className="flex h-full w-[34%] min-w-[320px] flex-col border-r border-white/10 bg-slate-950 lg:min-w-[360px]">
          <EditorAsideToolbar />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScriptEditor
              script={fm.script}
              onScriptChange={fm.setScript}
              storyboardKnowledgeContext={fm.knowledgeContext}
              storyboardConsistencyNotes={fm.consistencyNotes}
              previewAnimeStylePreset={fm.animeStylePreset}
              previewAnimeMangaBoost={fm.animeMangaBoost}
              previewAnimeCrossShot={fm.animeCrossShot}
              storyboardMaxShots={fm.storyboardMaxShots}
              onStoryboardMaxShotsChange={(n) => fm.setStoryboardMaxShots(clampClientStoryboardMaxShots(n))}
              onGenerateAll={() => void gen.submitShots()}
              onGenerateShot={(shotId) => {
                tk.selectShot(shotId);
                void gen.submitShots([shotId]);
              }}
            />
          </div>
        </aside>
        <div className="relative h-full flex-1 overflow-hidden bg-black">
          <VideoPreview masterVideoUrl={w.preview.masterVideoUrl} intentHint={w.preview.intentBanner} />
        </div>
      </div>
    </div>
  );
}

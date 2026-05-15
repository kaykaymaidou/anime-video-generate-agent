import { EditorWorkspaceShell } from "@/components/features/editor/EditorWorkspaceShell";
import { EditorWorkspaceProvider } from "@/contexts/editor-workspace-context";

export function EditorPage() {
  return (
    <EditorWorkspaceProvider>
      <EditorWorkspaceShell />
    </EditorWorkspaceProvider>
  );
}

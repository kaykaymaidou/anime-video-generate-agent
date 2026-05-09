import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AnimeCharacterCard = {
  id: string;
  name: string;
  /** 人设立绘 URL（可作镜头 reference 锚点） */
  sheetUrl: string;
  /** 发色块、瞳色、服饰关键词；写入一致性文案 */
  notes: string;
};

function genId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `chr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface AnimeCharacterState {
  characters: AnimeCharacterCard[];
  addCharacter: (partial: Omit<AnimeCharacterCard, "id">) => void;
  updateCharacter: (id: string, patch: Partial<Omit<AnimeCharacterCard, "id">>) => void;
  removeCharacter: (id: string) => void;
  /** 生成可粘贴进「角色与画风一致」的锁人设段落（仅动漫） */
  buildConsistencySnippet: () => string;
}

export function mergeCharacterSnippetIntoNotes(existing: string, snippet: string): string {
  const e = existing.trim();
  const s = snippet.trim();
  if (!s) return e;
  if (e.includes(s)) return e;
  return e ? `${e}\n\n${s}` : s;
}

export const useAnimeCharacterStore = create<AnimeCharacterState>()(
  persist(
    (set, get) => ({
      characters: [],
      addCharacter: (partial) => {
        const name = partial.name.trim();
        if (!name) return;
        const row: AnimeCharacterCard = {
          id: genId(),
          name,
          sheetUrl: partial.sheetUrl.trim(),
          notes: partial.notes.trim(),
        };
        set((s) => ({ characters: [...s.characters, row].slice(0, 24) }));
      },
      updateCharacter: (id, patch) =>
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(patch.name != null ? { name: patch.name.trim() || c.name } : {}),
                  ...(patch.sheetUrl != null ? { sheetUrl: patch.sheetUrl.trim() } : {}),
                  ...(patch.notes != null ? { notes: patch.notes.trim() } : {}),
                }
              : c
          ),
        })),
      removeCharacter: (id) =>
        set((s) => ({ characters: s.characters.filter((c) => c.id !== id) })),
      buildConsistencySnippet: () => {
        const list = get().characters;
        if (!list.length) return "";
        const blocks = list.map((c) => {
          const lines = [
            `【${c.name}】脸型与发型轮廓锁定；服饰主色块一致；全程不接写实肤质。`,
            c.notes ? `外貌服饰要点：${c.notes}` : "",
            c.sheetUrl ? `立绘参考 URL（生成时请对齐）：${c.sheetUrl}` : "",
          ].filter(Boolean);
          return lines.join("\n");
        });
        return `【动漫角色锁】\n${blocks.join("\n---\n")}`;
      },
    }),
    { name: "anime-video-generate-agent-anime-characters", version: 1 }
  )
);

import { useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { buildAnimeTimelineExport, downloadJson } from "@/lib/export-timeline";
import { importAnimeTimelineJson } from "@/lib/import-anime-timeline";
import { clampClientStoryboardMaxShots } from "@/lib/storyboard-limits";
import { useSubmitAgentMutation } from "@/hooks/useAgentMutations";
import { useEditorAgentSocket } from "@/hooks/useEditorAgentSocket";
import { useEditorSubmitShots } from "@/hooks/useEditorSubmitShots";
import { useTimelineConcatMutation } from "@/hooks/useTimelineMutation";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { useAnimeCharacterStore } from "@/store/animeCharacterStore";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";
import type { Shot } from "@/types";
import type { TaskStatus } from "@/store/useTaskStore";

export type EditorWorkspaceContextValue = {
  sheet: {
    open: boolean;
    setOpen: (v: boolean) => void;
    tab: string;
    setTab: (v: string) => void;
    openStrategy: () => void;
    openConcat: () => void;
  };
  storyboard: {
    shots: Shot[];
    setShots: (shots: Shot[]) => void;
    updateShot: ReturnType<typeof useStoryboardStore.getState>["updateShot"];
    referenceLibraryUrls: string[];
    addReferenceLibraryUrl: (u: string) => void;
    removeReferenceLibraryUrl: (u: string) => void;
    animeProjectSnapshots: ReturnType<typeof useStoryboardStore.getState>["animeProjectSnapshots"];
    saveAnimeProjectSnapshot: ReturnType<typeof useStoryboardStore.getState>["saveAnimeProjectSnapshot"];
    restoreAnimeProjectSnapshot: ReturnType<typeof useStoryboardStore.getState>["restoreAnimeProjectSnapshot"];
    deleteAnimeProjectSnapshot: ReturnType<typeof useStoryboardStore.getState>["deleteAnimeProjectSnapshot"];
  };
  form: {
    script: string;
    setScript: (s: string) => void;
    consistencyNotes: string;
    setConsistencyNotes: (v: string | ((prev: string) => string)) => void;
    knowledgeContext: string;
    setKnowledgeContext: (v: string) => void;
    animeStylePreset: string;
    setAnimeStylePreset: (v: string) => void;
    animeMangaBoost: boolean;
    setAnimeMangaBoost: (v: boolean) => void;
    animeCrossShot: boolean;
    setAnimeCrossShot: (v: boolean) => void;
    storyboardMaxShots: number;
    setStoryboardMaxShots: (v: number | ((p: number) => number)) => void;
  };
  concat: {
    transition: string;
    setTransition: (v: string) => void;
    clips: { order: number; url: string }[];
    timelinePending: boolean;
    timelineError: unknown;
    masterVideoUrl: string | null;
    runConcatMaster: () => void;
  };
  generation: {
    submitting: boolean;
    submitShots: (shotIds?: string[]) => Promise<void>;
    taskId: string | null;
  };
  preview: {
    intentBanner: string | null;
    masterVideoUrl: string | null;
  };
  errors: {
    text: string | null;
    hint: string | null;
    code: string | null;
    codeN: string | null;
    docUrl: string | null;
  };
  workspaceBadgeCount: number;
  timelineImport: {
    inputRef: RefObject<HTMLInputElement | null>;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    exportTimelineJson: () => void;
  };
  snapshotUi: {
    labelDraft: string;
    setLabelDraft: (v: string) => void;
  };
  charactersUi: {
    list: ReturnType<typeof useAnimeCharacterStore.getState>["characters"];
    add: ReturnType<typeof useAnimeCharacterStore.getState>["addCharacter"];
    remove: ReturnType<typeof useAnimeCharacterStore.getState>["removeCharacter"];
    buildSnippet: ReturnType<typeof useAnimeCharacterStore.getState>["buildConsistencySnippet"];
    nameDraft: string;
    setNameDraft: (v: string) => void;
    sheetDraft: string;
    setSheetDraft: (v: string) => void;
    notesDraft: string;
    setNotesDraft: (v: string) => void;
  };
  refsUi: {
    urlDraft: string;
    setUrlDraft: (v: string) => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
  };
  task: {
    selectShot: (id: string | null) => void;
  };
};

const EditorWorkspaceContext = createContext<EditorWorkspaceContextValue | null>(null);

export function useEditorWorkspace(): EditorWorkspaceContextValue {
  const ctx = useContext(EditorWorkspaceContext);
  if (!ctx) {
    throw new Error("useEditorWorkspace must be used within EditorWorkspaceProvider");
  }
  return ctx;
}

export function EditorWorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const submitAgent = useSubmitAgentMutation();
  const concatTimeline = useTimelineConcatMutation();

  const setStatus = useTaskStore((s) => s.setStatus);
  const setActiveVideoUrl = useTaskStore((s) => s.setActiveVideoUrl);
  const appendEvent = useTaskStore((s) => s.appendEvent);
  const clearEvents = useTaskStore((s) => s.clearEvents);
  const taskId = useTaskStore((s) => s.taskId);
  const setTaskId = useTaskStore((s) => s.setTaskId);
  const selectShot = useTaskStore((s) => s.selectShot);

  const shots = useStoryboardStore((s) => s.shots);
  const updateShot = useStoryboardStore((s) => s.updateShot);
  const setShots = useStoryboardStore((s) => s.setShots);
  const referenceLibraryUrls = useStoryboardStore((s) => s.referenceLibraryUrls);
  const addReferenceLibraryUrl = useStoryboardStore((s) => s.addReferenceLibraryUrl);
  const removeReferenceLibraryUrl = useStoryboardStore((s) => s.removeReferenceLibraryUrl);
  const animeProjectSnapshots = useStoryboardStore((s) => s.animeProjectSnapshots);
  const saveAnimeProjectSnapshot = useStoryboardStore((s) => s.saveAnimeProjectSnapshot);
  const restoreAnimeProjectSnapshot = useStoryboardStore((s) => s.restoreAnimeProjectSnapshot);
  const deleteAnimeProjectSnapshot = useStoryboardStore((s) => s.deleteAnimeProjectSnapshot);

  const [consistencyNotes, setConsistencyNotes] = useLocalStorageState<string>(
    "anime-video-generate-agent-consistency-notes",
    ""
  );
  const [knowledgeContext, setKnowledgeContext] = useLocalStorageState<string>(
    "anime-video-generate-agent-knowledge-context",
    ""
  );
  const [animeStylePreset, setAnimeStylePreset] = useLocalStorageState<string>(
    "anime-video-generate-agent-anime-style-preset",
    ""
  );
  const [animeMangaBoost, setAnimeMangaBoost] = useLocalStorageState<boolean>(
    "anime-video-generate-agent-anime-manga-boost",
    false
  );
  const [animeCrossShot, setAnimeCrossShot] = useLocalStorageState<boolean>(
    "anime-video-generate-agent-anime-cross-shot",
    false
  );
  const [concatTransition, setConcatTransition] = useLocalStorageState<string>(
    "anime-video-generate-agent-concat-transition",
    "none"
  );
  const [storyboardMaxShots, setStoryboardMaxShots] = useLocalStorageState<number>(
    "anime-video-generate-agent-storyboard-max-shots",
    12
  );

  const animeCharacters = useAnimeCharacterStore((s) => s.characters);
  const addAnimeCharacter = useAnimeCharacterStore((s) => s.addCharacter);
  const removeAnimeCharacter = useAnimeCharacterStore((s) => s.removeCharacter);
  const buildAnimeCharacterSnippet = useAnimeCharacterStore((s) => s.buildConsistencySnippet);

  const [charNameDraft, setCharNameDraft] = useState("");
  const [charSheetDraft, setCharSheetDraft] = useState("");
  const [charNotesDraft, setCharNotesDraft] = useState("");
  const [refUrlDraft, setRefUrlDraft] = useState("");
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const [masterVideoUrl, setMasterVideoUrl] = useState<string | null>(null);
  const [intentBanner, setIntentBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [script, setScript] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorCodeN, setErrorCodeN] = useState<string | null>(null);
  const [errorDocUrl, setErrorDocUrl] = useState<string | null>(null);

  useEffect(() => {
    setStoryboardMaxShots((v) => clampClientStoryboardMaxShots(typeof v === "number" ? v : 12));
  }, [setStoryboardMaxShots]);

  const timelineImportRef = useRef<HTMLInputElement>(null);
  const [snapshotLabelDraft, setSnapshotLabelDraft] = useState("");
  const [workspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const [workspaceSheetTab, setWorkspaceSheetTab] = useState("strategy");

  const workspaceBadgeCount = useMemo(() => {
    let n = 0;
    if (knowledgeContext.trim()) n += 1;
    if (consistencyNotes.trim()) n += 1;
    if (referenceLibraryUrls.length) n += 1;
    if (animeStylePreset.trim()) n += 1;
    if (animeMangaBoost) n += 1;
    if (animeCrossShot) n += 1;
    if (animeCharacters.length) n += 1;
    if (animeProjectSnapshots.length) n += 1;
    return n;
  }, [
    knowledgeContext,
    consistencyNotes,
    referenceLibraryUrls.length,
    animeStylePreset,
    animeMangaBoost,
    animeCrossShot,
    animeCharacters.length,
    animeProjectSnapshots.length,
  ]);

  const concatClips = useMemo(
    () =>
      shots
        .filter((s) => s.videoUrl?.trim())
        .map((s) => ({ order: s.order, url: s.videoUrl!.trim() }))
        .sort((a, b) => a.order - b.order),
    [shots]
  );

  const setStatusSafe = useCallback((s: TaskStatus) => setStatus(s), [setStatus]);

  const { socketRef } = useEditorAgentSocket({
    queryClient,
    appendEvent,
    setIntentBanner,
    setSubmitting,
    setErrorText,
    setErrorHint,
    setErrorCode,
    setErrorCodeN,
    setErrorDocUrl,
    setStatus: setStatusSafe,
    setActiveVideoUrl,
    updateShot,
  });

  const { submitShots } = useEditorSubmitShots({
    socketRef,
    submitAgent,
    shots,
    taskId,
    script,
    consistencyNotes,
    knowledgeContext,
    animeStylePreset,
    animeMangaBoost,
    animeCrossShot,
    storyboardMaxShots,
    setTaskId,
    clearEvents,
    updateShot,
    setSubmitting,
    setIntentBanner,
    setErrorText,
    setErrorHint,
    setErrorCode,
    setErrorCodeN,
    setErrorDocUrl,
    setStatus: setStatusSafe,
  });

  const runConcatMaster = useCallback(() => {
    setMasterVideoUrl(null);
    void (async () => {
      try {
        const res = await concatTimeline.mutateAsync({
          clips: concatClips,
          transition: concatTransition === "fade" ? "fade" : "none",
        });
        setMasterVideoUrl(res.videoUrl);
      } catch {
        /* mutation onError optional */
      }
    })();
  }, [concatClips, concatTransition, concatTimeline]);

  const onTimelineImport = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(String(reader.result));
          const res = importAnimeTimelineJson(raw);
          if (res.ok === false) {
            window.alert(res.reason);
            return;
          }
          if (!window.confirm(`导入 ${res.shots.length} 个动漫镜头？将替换当前分镜列表。`)) {
            return;
          }
          setShots(res.shots);
          const first = res.shots[0];
          if (first?.id) selectShot(first.id);
        } catch {
          window.alert("JSON 无法解析");
        }
      };
      reader.readAsText(f, "utf-8");
    },
    [selectShot, setShots]
  );

  const exportTimelineJson = useCallback(() => {
    const doc = buildAnimeTimelineExport(shots);
    downloadJson(`anime-video-generate-agent-timeline-${doc.generatedAt}.json`, doc);
  }, [shots]);

  const openStrategy = useCallback(() => {
    setWorkspaceSheetTab("strategy");
    setWorkspaceSheetOpen(true);
  }, []);

  const openConcat = useCallback(() => {
    setWorkspaceSheetTab("concat");
    setWorkspaceSheetOpen(true);
  }, []);

  const value = useMemo<EditorWorkspaceContextValue>(
    () => ({
      sheet: {
        open: workspaceSheetOpen,
        setOpen: setWorkspaceSheetOpen,
        tab: workspaceSheetTab,
        setTab: setWorkspaceSheetTab,
        openStrategy,
        openConcat,
      },
      storyboard: {
        shots,
        setShots,
        updateShot,
        referenceLibraryUrls,
        addReferenceLibraryUrl,
        removeReferenceLibraryUrl,
        animeProjectSnapshots,
        saveAnimeProjectSnapshot,
        restoreAnimeProjectSnapshot,
        deleteAnimeProjectSnapshot,
      },
      form: {
        script,
        setScript,
        consistencyNotes,
        setConsistencyNotes,
        knowledgeContext,
        setKnowledgeContext,
        animeStylePreset,
        setAnimeStylePreset,
        animeMangaBoost,
        setAnimeMangaBoost,
        animeCrossShot,
        setAnimeCrossShot,
        storyboardMaxShots,
        setStoryboardMaxShots,
      },
      concat: {
        transition: concatTransition,
        setTransition: setConcatTransition,
        clips: concatClips,
        timelinePending: concatTimeline.isPending,
        timelineError: concatTimeline.error,
        masterVideoUrl,
        runConcatMaster,
      },
      generation: {
        submitting,
        submitShots,
        taskId,
      },
      preview: {
        intentBanner,
        masterVideoUrl,
      },
      errors: {
        text: errorText,
        hint: errorHint,
        code: errorCode,
        codeN: errorCodeN,
        docUrl: errorDocUrl,
      },
      workspaceBadgeCount,
      timelineImport: {
        inputRef: timelineImportRef,
        onFileChange: onTimelineImport,
        exportTimelineJson,
      },
      snapshotUi: {
        labelDraft: snapshotLabelDraft,
        setLabelDraft: setSnapshotLabelDraft,
      },
      charactersUi: {
        list: animeCharacters,
        add: addAnimeCharacter,
        remove: removeAnimeCharacter,
        buildSnippet: buildAnimeCharacterSnippet,
        nameDraft: charNameDraft,
        setNameDraft: setCharNameDraft,
        sheetDraft: charSheetDraft,
        setSheetDraft: setCharSheetDraft,
        notesDraft: charNotesDraft,
        setNotesDraft: setCharNotesDraft,
      },
      refsUi: {
        urlDraft: refUrlDraft,
        setUrlDraft: setRefUrlDraft,
        fileInputRef: refFileInputRef,
      },
      task: {
        selectShot,
      },
    }),
    [
      workspaceSheetOpen,
      workspaceSheetTab,
      openStrategy,
      openConcat,
      shots,
      setShots,
      updateShot,
      referenceLibraryUrls,
      addReferenceLibraryUrl,
      removeReferenceLibraryUrl,
      animeProjectSnapshots,
      saveAnimeProjectSnapshot,
      restoreAnimeProjectSnapshot,
      deleteAnimeProjectSnapshot,
      script,
      consistencyNotes,
      setConsistencyNotes,
      knowledgeContext,
      setKnowledgeContext,
      animeStylePreset,
      setAnimeStylePreset,
      animeMangaBoost,
      setAnimeMangaBoost,
      animeCrossShot,
      setAnimeCrossShot,
      storyboardMaxShots,
      setStoryboardMaxShots,
      concatTransition,
      setConcatTransition,
      concatClips,
      concatTimeline.isPending,
      concatTimeline.error,
      masterVideoUrl,
      runConcatMaster,
      submitting,
      submitShots,
      taskId,
      intentBanner,
      errorText,
      errorHint,
      errorCode,
      errorCodeN,
      errorDocUrl,
      workspaceBadgeCount,
      onTimelineImport,
      exportTimelineJson,
      snapshotLabelDraft,
      animeCharacters,
      addAnimeCharacter,
      removeAnimeCharacter,
      buildAnimeCharacterSnippet,
      charNameDraft,
      charSheetDraft,
      charNotesDraft,
      refUrlDraft,
      selectShot,
    ]
  );

  return <EditorWorkspaceContext.Provider value={value}>{children}</EditorWorkspaceContext.Provider>;
}

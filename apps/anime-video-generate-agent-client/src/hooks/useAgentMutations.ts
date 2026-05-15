import {
  useMutation,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  postAgentSubmit,
  postScriptReview,
  postStoryboardPreview,
  type AnimeStylePresetId,
  type ScriptReviewResponse,
  type StoryboardPreviewShot,
  type SubmitAgentPayload,
} from "@/api/agent";

export function useScriptReviewMutation(
  options?: Omit<
    UseMutationOptions<ScriptReviewResponse, Error, string>,
    "mutationKey" | "mutationFn"
  >
) {
  return useMutation({
    mutationKey: ["agent", "script-review"],
    mutationFn: (script: string) => postScriptReview(script),
    ...options,
  });
}

export type StoryboardPreviewVars = {
  script: string;
  knowledgeContext?: string;
  contextCacheKey?: string;
  progressTaskId?: string;
  consistencyNotes?: string;
  animeStylePreset?: AnimeStylePresetId;
  animePromptBoost?: "manga_storyboard" | "none";
  inheritCrossShotStyle?: boolean;
  storyboardMaxShots?: number;
};

export function useStoryboardPreviewMutation(
  options?: Omit<
    UseMutationOptions<{ shots: StoryboardPreviewShot[] }, Error, StoryboardPreviewVars>,
    "mutationKey" | "mutationFn"
  >
) {
  return useMutation({
    mutationKey: ["agent", "storyboard-preview"],
    mutationFn: (vars: StoryboardPreviewVars) => postStoryboardPreview(vars),
    ...options,
  });
}

export function useSubmitAgentMutation() {
  return useMutation({
    mutationKey: ["agent", "submit"],
    mutationFn: (payload: SubmitAgentPayload) => postAgentSubmit(payload),
  });
}

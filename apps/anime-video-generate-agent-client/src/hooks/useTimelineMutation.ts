import { useMutation } from "@tanstack/react-query";

import {
  postTimelineConcat,
  type TimelineConcatClip,
  type TimelineConcatTransition,
} from "@/api/timeline";

export type TimelineConcatVars = {
  clips: TimelineConcatClip[];
  transition?: TimelineConcatTransition;
};

export function useTimelineConcatMutation() {
  return useMutation({
    mutationKey: ["timeline", "concat"],
    mutationFn: (vars: TimelineConcatVars) =>
      postTimelineConcat(vars.clips, { transition: vars.transition }),
  });
}

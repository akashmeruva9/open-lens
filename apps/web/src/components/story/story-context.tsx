"use client";
import type { Claim, SourceRecord, StoryBundle } from "@openlens/schemas";
import { createContext, useContext } from "react";

export type DossierTab = "claims" | "timeline" | "context" | "sources";

export interface StoryCtx {
  bundle: StoryBundle;
  claimById: Map<string, Claim>;
  claimNo: Map<string, number>;
  sourceById: Map<string, SourceRecord>;
  /** Open the dossier on a claim and show its source passage. */
  focusClaim: (claimId: string) => void;
  focusSource: (sourceId: string) => void;
}

export const StoryContext = createContext<StoryCtx | null>(null);

export function useStory(): StoryCtx {
  const c = useContext(StoryContext);
  if (!c) throw new Error("useStory outside StoryContext");
  return c;
}

export function buildIndexes(bundle: StoryBundle) {
  return {
    claimById: new Map(bundle.claims.map((c) => [c.id, c])),
    claimNo: new Map(bundle.claims.map((c, i) => [c.id, i + 1])),
    sourceById: new Map(bundle.sources.map((s) => [s.id, s])),
  };
}

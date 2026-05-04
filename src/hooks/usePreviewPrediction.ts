// Phase 3/5 — Preview prediction hook
//
// Loads the NativeEnvironmentSnapshot on mount, builds the preview index in
// memory, and also exposes the latest snapshot so submit-time governance can
// judge commands against Mac context instead of trusting PreviewPrediction
// alone.
//
// Behaviour:
//  - while typing: prediction is cleared immediately (no ghost shown)
//  - trailing whitespace suppresses preview so Space acts as "keep typing"
//  - after ~100ms of no typing: resolvePreview runs against the cached index
//  - if the index has not yet loaded, prediction stays null silently
//
// No native probes per keystroke. Snapshot refresh cadence belongs to a later
// runtime hydration slice; the submit path still receives the freshest cached
// snapshot this hook owns.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadNativeEnvironment,
  type NativeEnvironmentSnapshot,
} from "../types/nativeEnvironment";
import {
  buildNativeEnvironmentIndex,
  type NativeEnvironmentIndex,
} from "../resolver/nativeEnvironmentIndex";
import {
  resolvePreview,
  resolveSuggestions,
  type PreviewPrediction,
  type Suggestion,
} from "../resolver/previewResolver";

const DEBOUNCE_MS = 100;

function shouldSuppressPreview(input: string): boolean {
  return !input.trim() || /\s$/.test(input);
}

export type ResolveNowResult =
  | { kind: "resolved"; prediction: PreviewPrediction | null }
  | { kind: "unavailable"; reason: string; raw_input: string };

export interface PreviewPredictionHandle {
  prediction: PreviewPrediction | null;
  snapshot: NativeEnvironmentSnapshot | null;
  resolveNow: (input: string) => ResolveNowResult;
  getSuggestions: (input: string, limit?: number) => Suggestion[];
}

export function usePreviewPrediction(input: string): PreviewPredictionHandle {
  const [prediction, setPrediction] = useState<PreviewPrediction | null>(null);
  const [snapshot, setSnapshot] = useState<NativeEnvironmentSnapshot | null>(null);
  const indexRef = useRef<NativeEnvironmentIndex | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNativeEnvironment()
      .then((nextSnapshot) => {
        if (cancelled) return;
        indexRef.current = buildNativeEnvironmentIndex(nextSnapshot);
        setSnapshot(nextSnapshot);
      })
      .catch((err) => {
        console.error("native environment index unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPrediction(null);
    if (shouldSuppressPreview(input)) return;

    const handle = window.setTimeout(() => {
      const index = indexRef.current;
      if (!index) return;
      setPrediction(resolvePreview(input, index));
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [input]);

  const resolveNow = useCallback((currentInput: string): ResolveNowResult => {
    const index = indexRef.current;
    if (!index) {
      return {
        kind: "unavailable",
        reason: "native environment index unavailable",
        raw_input: currentInput,
      };
    }
    return {
      kind: "resolved",
      prediction: resolvePreview(currentInput, index),
    };
  }, []);

  const getSuggestions = useCallback(
    (currentInput: string, limit = 6): Suggestion[] => {
      const index = indexRef.current;
      if (!index) return [];
      return resolveSuggestions(currentInput, index, limit);
    },
    [],
  );

  return { prediction, snapshot, resolveNow, getSuggestions };
}

// Phase 3 Slice 2 — Preview prediction hook
//
// Loads the NativeEnvironmentSnapshot ONCE on mount, builds the index in
// memory, and exposes a debounced PreviewPrediction for the current input.
//
// Behaviour:
//  - while typing: prediction is cleared immediately (no ghost shown)
//  - after ~300ms of no typing: resolvePreview runs against the cached index
//  - if the index has not yet loaded, prediction stays null silently
//
// No execution. No native probes per keystroke. No invoke beyond the single
// snapshot fetch on mount.

import { useCallback, useEffect, useRef, useState } from "react";
import { loadNativeEnvironment } from "../types/nativeEnvironment";
import {
  buildNativeEnvironmentIndex,
  type NativeEnvironmentIndex,
} from "../resolver/nativeEnvironmentIndex";
import {
  resolvePreview,
  type PreviewPrediction,
} from "../resolver/previewResolver";

const DEBOUNCE_MS = 300;

export type ResolveNowResult =
  | { kind: "resolved"; prediction: PreviewPrediction | null }
  | { kind: "unavailable"; reason: string; raw_input: string };

export interface PreviewPredictionHandle {
  prediction: PreviewPrediction | null;
  resolveNow: (input: string) => ResolveNowResult;
}

export function usePreviewPrediction(input: string): PreviewPredictionHandle {
  const [prediction, setPrediction] = useState<PreviewPrediction | null>(null);
  const indexRef = useRef<NativeEnvironmentIndex | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNativeEnvironment()
      .then((snapshot) => {
        if (cancelled) return;
        indexRef.current = buildNativeEnvironmentIndex(snapshot);
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
    if (!input.trim()) return;

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

  return { prediction, resolveNow };
}

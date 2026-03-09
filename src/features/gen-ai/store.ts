"use client";

import { create } from "zustand";
import type { UISpec } from "./types";

interface GenAIFrameState {
  spec: UISpec;
  generatorFn?: string;
  controlValues: Record<string, unknown>;
}

interface GenAIStore {
  frames: Record<string, GenAIFrameState>;
  activeFrameId: string | null;

  setFrameSpec: (frameId: string, spec: UISpec, controlValues?: Record<string, unknown>) => void;
  getFrameSpec: (frameId: string) => GenAIFrameState | undefined;
  setActiveFrame: (frameId: string | null) => void;
  removeFrame: (frameId: string) => void;
  updateControlValue: (frameId: string, controlId: string, value: unknown) => void;
}

export const useGenAIStore = create<GenAIStore>((set, get) => ({
  frames: {},
  activeFrameId: null,

  setFrameSpec: (frameId, spec, controlValues) => {
    set((state) => ({
      frames: {
        ...state.frames,
        [frameId]: {
          spec,
          generatorFn: spec.generate,
          controlValues: controlValues ?? {},
        },
      },
    }));
  },

  getFrameSpec: (frameId) => {
    return get().frames[frameId];
  },

  setActiveFrame: (frameId) => {
    set({ activeFrameId: frameId });
  },

  removeFrame: (frameId) => {
    set((state) => {
      const { [frameId]: _, ...rest } = state.frames;
      return {
        frames: rest,
        activeFrameId: state.activeFrameId === frameId ? null : state.activeFrameId,
      };
    });
  },

  updateControlValue: (frameId, controlId, value) => {
    set((state) => {
      const frame = state.frames[frameId];
      if (!frame) return state;
      return {
        frames: {
          ...state.frames,
          [frameId]: {
            ...frame,
            controlValues: { ...frame.controlValues, [controlId]: value },
          },
        },
      };
    });
  },
}));

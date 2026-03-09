/**
 * Design System Store
 *
 * Persists the extracted design system and design decisions across
 * sessions using IndexedDB. The AI can reference this context
 * in every conversation.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { designSystemStorage } from "@/core/utils/indexedDB";

// ─── Types ──────────────────────────────────────────────────────────

export interface DesignToken {
  name: string;
  value: string | number;
  type: "color" | "fontSize" | "spacing" | "borderRadius" | "fontFamily" | "fontWeight";
  usage?: string;
}

export interface DesignSystemState {
  /** The extracted design system tokens */
  tokens: DesignToken[];

  /** Design decisions and preferences recorded during conversations */
  decisions: DesignDecision[];

  /** Timestamp of last extraction */
  lastExtractedAt: number | null;

  /** Summary of the design system for including in AI context */
  systemSummary: string;
}

export interface DesignDecision {
  id: string;
  timestamp: number;
  decision: string;
  category: "color" | "typography" | "spacing" | "layout" | "component" | "general";
}

export interface DesignSystemActions {
  /** Update the design system tokens from an extraction */
  setTokens: (tokens: DesignToken[]) => void;

  /** Add a design decision */
  addDecision: (decision: Omit<DesignDecision, "id" | "timestamp">) => void;

  /** Remove a design decision */
  removeDecision: (id: string) => void;

  /** Update the system summary */
  updateSummary: (summary: string) => void;

  /** Clear the entire design system */
  clearDesignSystem: () => void;

  /** Get the design context string for including in AI conversations */
  getDesignContext: () => string;
}

// ─── Store ──────────────────────────────────────────────────────────

let _idCounter = 0;
function generateId(): string {
  return `ds_${Date.now()}_${++_idCounter}`;
}

export const useDesignSystemStore = create<
  DesignSystemState & DesignSystemActions
>()(
  persist(
    (set, get) => ({
      // ── State ─────────────────────────────────────────────────
      tokens: [],
      decisions: [],
      lastExtractedAt: null,
      systemSummary: "",

      // ── Actions ───────────────────────────────────────────────
      setTokens: (tokens) =>
        set({
          tokens,
          lastExtractedAt: Date.now(),
        }),

      addDecision: (decision) =>
        set((state) => ({
          decisions: [
            ...state.decisions,
            {
              ...decision,
              id: generateId(),
              timestamp: Date.now(),
            },
          ],
        })),

      removeDecision: (id) =>
        set((state) => ({
          decisions: state.decisions.filter((d) => d.id !== id),
        })),

      updateSummary: (summary) => set({ systemSummary: summary }),

      clearDesignSystem: () =>
        set({
          tokens: [],
          decisions: [],
          lastExtractedAt: null,
          systemSummary: "",
        }),

      getDesignContext: () => {
        const state = get();
        const parts: string[] = [];

        if (state.tokens.length > 0) {
          parts.push("Design System Tokens:");

          const colorTokens = state.tokens.filter((t) => t.type === "color");
          if (colorTokens.length > 0) {
            parts.push(
              "  Colors: " +
                colorTokens.map((t) => `${t.name}: ${t.value}`).join(", ")
            );
          }

          const fontSizeTokens = state.tokens.filter((t) => t.type === "fontSize");
          if (fontSizeTokens.length > 0) {
            parts.push(
              "  Type scale: " +
                fontSizeTokens
                  .map((t) => `${t.name}: ${t.value}px`)
                  .join(", ")
            );
          }

          const spacingTokens = state.tokens.filter((t) => t.type === "spacing");
          if (spacingTokens.length > 0) {
            parts.push(
              "  Spacing: " +
                spacingTokens
                  .map((t) => `${t.value}px`)
                  .join(", ")
            );
          }

          const radiusTokens = state.tokens.filter(
            (t) => t.type === "borderRadius"
          );
          if (radiusTokens.length > 0) {
            parts.push(
              "  Border radii: " +
                radiusTokens
                  .map((t) => `${t.value}px`)
                  .join(", ")
            );
          }
        }

        if (state.decisions.length > 0) {
          parts.push("");
          parts.push("Design Decisions:");
          for (const d of state.decisions.slice(-10)) {
            // Last 10 decisions
            parts.push(`  [${d.category}] ${d.decision}`);
          }
        }

        if (state.systemSummary) {
          parts.push("");
          parts.push("Design System Summary:");
          parts.push(`  ${state.systemSummary}`);
        }

        return parts.join("\n");
      },
    }),
    {
      name: "design-system-store",
      storage: createJSONStorage(() => designSystemStorage),
      version: 1,
    }
  )
);

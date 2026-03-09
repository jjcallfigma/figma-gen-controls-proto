/**
 * Canvas state persistence utilities
 * Handles saving and loading canvas state to/from IndexedDB
 * with automatic migration from localStorage on first load.
 */

import { CanvasObject, ComponentDefinition } from "@/types/canvas";
import { canvasDB } from "./indexedDB";

const CANVAS_IDB_KEY = "canvas-state";

// Legacy localStorage key — used only for migration
const LEGACY_LS_KEY = "figma-clone-canvas-state";

const STORAGE_VERSION = 1;

export interface PersistedCanvasState {
  version: number;
  timestamp: number;

  objects: Record<string, CanvasObject>;
  objectIds: string[];

  pages: Record<string, { id: string; name: string; objectIds: string[] }>;
  pageIds: string[];
  currentPageId: string | null;

  components: Record<string, ComponentDefinition>;
  componentIds: string[];

  canvasSettings: {
    backgroundColor: string;
    backgroundOpacity: number;
  };

  viewport?: {
    zoom: number;
    panX: number;
    panY: number;
  };
}

export class CanvasPersistence {
  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------

  static async saveCanvasState(
    state: Partial<PersistedCanvasState>,
  ): Promise<boolean> {
    if (typeof window === "undefined") return false;

    try {
      const persistedState: PersistedCanvasState = {
        version: STORAGE_VERSION,
        timestamp: Date.now(),
        objects: state.objects || {},
        objectIds: state.objectIds || [],
        pages: state.pages || {},
        pageIds: state.pageIds || [],
        currentPageId: state.currentPageId || null,
        components: state.components || {},
        componentIds: state.componentIds || [],
        canvasSettings: state.canvasSettings || {
          backgroundColor: "#ffffff",
          backgroundOpacity: 1,
        },
        viewport: state.viewport,
      };

      const { hasLargeImages, totalImageSizeKB } =
        this.analyzeImageSizes(persistedState);

      let finalState = persistedState;
      let wasOptimized = false;

      if (hasLargeImages) {
        console.log(
          "🗜️ [PERSISTENCE] Large images detected, optimizing before save:",
          { totalImageSizeKB, objectCount: Object.keys(persistedState.objects).length },
        );
        finalState = this.optimizeStateForStorage(persistedState);
        wasOptimized = true;
      }

      await canvasDB.set(CANVAS_IDB_KEY, finalState);

      if (wasOptimized) {
        console.log("💾 [PERSISTENCE] Canvas state saved (optimized):", {
          objectCount: Object.keys(finalState.objects).length,
          wasOptimized,
          originalImageSizeKB: totalImageSizeKB,
        });
      }

      return true;
    } catch (error) {
      console.error("🔴 [PERSISTENCE] Failed to save canvas state:", error);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Load (with automatic localStorage → IndexedDB migration)
  // ------------------------------------------------------------------

  static async loadCanvasState(): Promise<PersistedCanvasState | null> {
    if (typeof window === "undefined") return null;

    try {
      // Try IndexedDB first
      let parsed = await canvasDB.get<PersistedCanvasState>(CANVAS_IDB_KEY);

      // Migrate from localStorage if IndexedDB is empty
      if (!parsed) {
        parsed = this.readFromLocalStorage() ?? undefined;
        if (parsed) {
          console.log(
            "🔄 [PERSISTENCE] Migrating canvas state from localStorage → IndexedDB",
          );
          await canvasDB.set(CANVAS_IDB_KEY, parsed);
          try {
            localStorage.removeItem(LEGACY_LS_KEY);
          } catch {
            // Ignore removal errors
          }
        }
      }

      if (!parsed) {
        console.log("📭 [PERSISTENCE] No saved canvas state found");
        return null;
      }

      if (parsed.version !== STORAGE_VERSION) {
        console.log("🔄 [PERSISTENCE] Version mismatch, migration needed");
        return null;
      }

      console.log(
        `📂 [PERSISTENCE] Canvas state loaded (${Object.keys(parsed.objects).length} objects)`,
      );
      return parsed;
    } catch (error) {
      console.error("🔴 [PERSISTENCE] Failed to load canvas state:", error);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Clear
  // ------------------------------------------------------------------

  static async clearCanvasState(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      await canvasDB.delete(CANVAS_IDB_KEY);
      console.log("🗑️ [PERSISTENCE] Canvas state cleared");
    } catch (error) {
      console.error("🔴 [PERSISTENCE] Failed to clear canvas state:", error);
    }
  }

  // ------------------------------------------------------------------
  // Debounced auto-save
  // ------------------------------------------------------------------

  private static debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DEBOUNCE_MS = 200;
  private static readonly DEBOUNCE_MS_LARGE_IMAGES = 1000;

  static scheduleDebouncedSave(state: any, eventType: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const hasLargeImages = Object.values(state.objects || {}).some(
      (obj: any) =>
        obj.fills?.some(
          (fill: any) =>
            fill.type === "image" &&
            fill.imageUrl?.startsWith("data:") &&
            fill.imageUrl.length > 1_000_000,
        ),
    );

    const debounceMs = hasLargeImages
      ? this.DEBOUNCE_MS_LARGE_IMAGES
      : this.DEBOUNCE_MS;

    this.debounceTimer = setTimeout(() => {
      if (
        hasLargeImages ||
        eventType.includes("image") ||
        eventType.includes("paste")
      ) {
        console.log("💾 [PERSISTENCE] Auto-saving state after", eventType, {
          objectCount: Object.keys(state.objects).length,
          hasLargeImages,
          debounceMs,
        });
      }
      this.saveCanvasState(state);
      this.debounceTimer = null;
    }, debounceMs);
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /** Read legacy localStorage data (for migration only) */
  private static readFromLocalStorage(): PersistedCanvasState | null {
    try {
      const raw = localStorage.getItem(LEGACY_LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PersistedCanvasState;
    } catch {
      return null;
    }
  }

  private static analyzeImageSizes(state: PersistedCanvasState): {
    hasLargeImages: boolean;
    totalImageSizeKB: number;
    largeImageCount: number;
  } {
    let totalImageSizeKB = 0;
    let largeImageCount = 0;
    const threshold = 500;

    Object.values(state.objects).forEach((obj) => {
      if (obj.fills) {
        obj.fills.forEach((fill) => {
          if (fill.type === "image" && fill.imageUrl.startsWith("data:")) {
            const sizeKB = Math.round((fill.imageUrl.length * 2) / 1024);
            totalImageSizeKB += sizeKB;
            if (sizeKB > threshold) {
              largeImageCount++;
            }
          }
        });
      }
    });

    return { hasLargeImages: largeImageCount > 0, totalImageSizeKB, largeImageCount };
  }

  private static optimizeStateForStorage(
    state: PersistedCanvasState,
    thresholdKB: number = 500,
  ): PersistedCanvasState {
    const optimizedObjects: Record<string, CanvasObject> = {};

    Object.entries(state.objects).forEach(([id, obj]) => {
      const optimizedObj = { ...obj };

      if (optimizedObj.fills) {
        optimizedObj.fills = optimizedObj.fills.map((fill) => {
          if (fill.type === "image" && fill.imageUrl.startsWith("data:")) {
            const sizeKB = Math.round((fill.imageUrl.length * 2) / 1024);
            if (sizeKB > thresholdKB) {
              console.log(
                `🗜️ [PERSISTENCE] Replacing large image in ${obj.name || "object"} (${sizeKB}KB → placeholder)`,
              );
              return {
                ...fill,
                imageUrl: "placeholder",
                imageWidth: fill.imageWidth || 400,
                imageHeight: fill.imageHeight || 400,
              };
            }
          }
          return fill;
        });
      }

      optimizedObjects[id] = optimizedObj;
    });

    return { ...state, objects: optimizedObjects };
  }

  // ------------------------------------------------------------------
  // Storage info (debugging)
  // ------------------------------------------------------------------

  static async getStorageInfo(): Promise<{
    hasData: boolean;
    timestamp?: number;
    objectCount?: number;
  }> {
    if (typeof window === "undefined") return { hasData: false };
    try {
      const parsed = await canvasDB.get<PersistedCanvasState>(CANVAS_IDB_KEY);
      if (!parsed) return { hasData: false };
      return {
        hasData: true,
        timestamp: parsed.timestamp,
        objectCount: Object.keys(parsed.objects).length,
      };
    } catch {
      return { hasData: false };
    }
  }
}

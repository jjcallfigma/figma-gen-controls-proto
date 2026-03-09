import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { settingsStorage } from "@/core/utils/indexedDB";

export interface AppSettings {
  // Visual settings
  theme: "light" | "dark" | "system";
  showRulers: boolean;
  showPixelGrid: boolean;
  showGridLines: boolean;

  // UI settings
  showLayersPanel: boolean;
  showPropertiesPanel: boolean;

  // Canvas settings
  snapToGrid: boolean;
  snapToObjects: boolean;
  snapThreshold: number;

  // Performance settings
  highQualityRendering: boolean;

  // Accessibility
  reducedMotion: boolean;
}

export interface SettingsActions {
  // Theme actions
  setTheme: (theme: AppSettings["theme"]) => void;
  toggleTheme: () => void;

  // Visual toggles
  toggleRulers: () => void;
  togglePixelGrid: () => void;

  // UI toggles
  toggleLayersPanel: () => void;
  togglePropertiesPanel: () => void;

  // Canvas toggles
  toggleSnapToGrid: () => void;
  toggleSnapToObjects: () => void;
  setSnapThreshold: (threshold: number) => void;

  // Performance toggles
  toggleHighQualityRendering: () => void;

  // Accessibility
  toggleReducedMotion: () => void;

  // Reset
  resetSettings: () => void;
}

export type SettingsStore = AppSettings & SettingsActions;

const defaultSettings: AppSettings = {
  // Visual settings
  theme: "system",
  showRulers: false,
  showPixelGrid: false,
  showGridLines: false,

  // UI settings
  showLayersPanel: true,
  showPropertiesPanel: true,

  // Canvas settings
  snapToGrid: true,
  snapToObjects: true,
  snapThreshold: 5,

  // Performance settings
  highQualityRendering: true,

  // Accessibility
  reducedMotion: false,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      // Theme actions
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
        })),

      // Visual toggles
      toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
      togglePixelGrid: () =>
        set((state) => ({ showPixelGrid: !state.showPixelGrid })),

      // UI toggles
      toggleLayersPanel: () =>
        set((state) => ({ showLayersPanel: !state.showLayersPanel })),
      togglePropertiesPanel: () =>
        set((state) => ({ showPropertiesPanel: !state.showPropertiesPanel })),

      // Canvas toggles
      toggleSnapToGrid: () =>
        set((state) => ({ snapToGrid: !state.snapToGrid })),
      toggleSnapToObjects: () =>
        set((state) => ({ snapToObjects: !state.snapToObjects })),
      setSnapThreshold: (snapThreshold) => set({ snapThreshold }),

      // Performance toggles
      toggleHighQualityRendering: () =>
        set((state) => ({
          highQualityRendering: !state.highQualityRendering,
        })),

      // Accessibility
      toggleReducedMotion: () =>
        set((state) => ({ reducedMotion: !state.reducedMotion })),

      // Reset
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "figma-clone-settings",
      storage: createJSONStorage(() => settingsStorage),
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0 || !version) {
          return { ...defaultSettings, ...(persistedState as Partial<AppSettings>) };
        }
        return persistedState as SettingsStore;
      },
    }
  )
);

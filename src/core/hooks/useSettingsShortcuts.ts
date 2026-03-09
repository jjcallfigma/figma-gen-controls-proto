import { useTheme } from "@/contexts/ThemeContext";
import { useSettingsStore } from "@/core/state/settingsStore";
import { useAppStore } from "@/core/state/store";
import { useEffect } from "react";

export function useSettingsShortcuts() {
  const settingsStore = useSettingsStore();
  const { toggleTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as any)?.contentEditable === "true"
      ) {
        return;
      }

      // Settings shortcuts
      if (
        event.shiftKey &&
        event.key.toLowerCase() === "r" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        settingsStore.toggleRulers();
        return;
      }

      if (
        event.shiftKey &&
        (event.key === "'" || event.key === '"' || event.code === "Quote") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        settingsStore.togglePixelGrid();
        return;
      }

      // Theme shortcut
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        toggleTheme();
        return;
      }

      // UI panel shortcuts
      if (
        event.metaKey &&
        event.key === "\\" &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        settingsStore.toggleLayersPanel();
        return;
      }

      if (
        event.metaKey &&
        event.key === "." &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        settingsStore.togglePropertiesPanel();
        return;
      }

      // Snap shortcut
      if (
        event.metaKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "s" &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        settingsStore.toggleSnapToObjects();
        return;
      }

      // Canvas shortcuts
      if (
        event.shiftKey &&
        event.key === "0" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const { dispatch } = useAppStore.getState();
        dispatch({
          type: "viewport.zoom.fit",
          payload: {},
        });
        return;
      }

      if (
        event.shiftKey &&
        event.key === "1" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const { dispatch } = useAppStore.getState();
        dispatch({
          type: "viewport.zoom.set",
          payload: { zoom: 1 },
        });
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [settingsStore, toggleTheme]);
}

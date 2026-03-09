/**
 * Hook for managing canvas persistence
 * Provides utilities for manual save/load/clear operations
 */

import { useAppStore } from "@/core/state/store";
import { CanvasPersistence } from "@/core/utils/persistence";
import { useCallback, useEffect, useState } from "react";

interface StorageInfo {
  hasData: boolean;
  timestamp?: number;
  objectCount?: number;
}

export function usePersistence() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({ hasData: false });

  useEffect(() => {
    const updateInfo = () => {
      CanvasPersistence.getStorageInfo().then(setStorageInfo);
    };

    updateInfo();

    const interval = setInterval(updateInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  const saveNow = useCallback(async () => {
    const state = useAppStore.getState();
    const success = await CanvasPersistence.saveCanvasState({
      objects: state.objects,
      objectIds: state.objectIds,
      pages: state.pages,
      pageIds: state.pageIds,
      currentPageId: state.currentPageId,
      components: state.components,
      componentIds: state.componentIds,
      canvasSettings: state.canvasSettings,
      viewport: {
        zoom: state.viewport.zoom,
        panX: state.viewport.panX,
        panY: state.viewport.panY,
      },
    });

    if (success) {
      setStorageInfo(await CanvasPersistence.getStorageInfo());
    }

    return success;
  }, []);

  const loadSaved = useCallback(async () => {
    const persistedState = await CanvasPersistence.loadCanvasState();
    if (!persistedState) return false;

    useAppStore.getState().dispatch({
      type: "canvas.state.loaded",
      payload: {
        objects: persistedState.objects,
        objectIds: persistedState.objectIds,
        pages: persistedState.pages,
        pageIds: persistedState.pageIds,
        currentPageId: persistedState.currentPageId,
        components: persistedState.components,
        componentIds: persistedState.componentIds,
        canvasSettings: persistedState.canvasSettings,
      },
    });

    if (persistedState.viewport) {
      useAppStore.setState((draft) => {
        draft.viewport.zoom = persistedState.viewport!.zoom;
        draft.viewport.panX = persistedState.viewport!.panX;
        draft.viewport.panY = persistedState.viewport!.panY;
      });
    }

    return true;
  }, []);

  const clearSaved = useCallback(async () => {
    await CanvasPersistence.clearCanvasState();
    setStorageInfo(await CanvasPersistence.getStorageInfo());
  }, []);

  const newCanvas = useCallback(() => {
    useAppStore.getState().dispatch({
      type: "canvas.state.reset",
      payload: {},
    });
  }, []);

  return {
    hasData: storageInfo.hasData,
    timestamp: storageInfo.timestamp,
    objectCount: storageInfo.objectCount,

    saveNow,
    loadSaved,
    clearSaved,
    newCanvas,

    lastSaved: storageInfo.timestamp ? new Date(storageInfo.timestamp) : null,
    isEmpty: !storageInfo.hasData,
  };
}

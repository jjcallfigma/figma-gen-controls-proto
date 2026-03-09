/**
 * Hook to handle client-side persistence loading after hydration
 * This prevents hydration mismatches by loading saved state only on the client
 */

import { useAppStore } from "@/core/state/store";
import { CanvasPersistence } from "@/core/utils/persistence";
import { useEffect, useState } from "react";

export function useClientSidePersistence() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useAppStore((state) => state.dispatch);

  useEffect(() => {
    if (typeof window === "undefined" || isLoaded) return;

    console.log(
      "🔄 [CLIENT-PERSISTENCE] Hook starting, will load after hydration",
    );

    const loadAfterHydration = () => {
      requestAnimationFrame(() => {
        setIsLoading(true);
        console.log(
          "🔄 [CLIENT-PERSISTENCE] Attempting to load persisted state",
        );

        CanvasPersistence.loadCanvasState()
          .then((persistedState) => {
            if (persistedState) {
              console.log(
                "✅ [PERSISTENCE] Loading saved state after hydration",
                {
                  objectsCount: Object.keys(persistedState.objects).length,
                  objectIds: persistedState.objectIds,
                  pages: persistedState.pages,
                  currentPageId: persistedState.currentPageId,
                },
              );

              dispatch({
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
            } else {
              console.log(
                "ℹ️ [CLIENT-PERSISTENCE] No persisted state found - starting fresh",
              );
            }
          })
          .catch((error) => {
            console.error(
              "❌ [CLIENT-PERSISTENCE] Error loading persisted state:",
              error,
            );
          })
          .finally(() => {
            setIsLoading(false);
            setIsLoaded(true);
          });
      });
    };

    const timer = setTimeout(loadAfterHydration, 50);
    return () => clearTimeout(timer);
  }, [dispatch, isLoaded]);

  return { isLoaded, isLoading };
}

"use client";

import GlobalKeyboardShortcuts from "@/components/app/GlobalKeyboardShortcuts";
import CanvasWithPropertiesWrapper, {
  LayersPanelProvider,
} from "@/components/canvas/CanvasWithPropertiesWrapper";
import FloatingToolbar from "@/components/FloatingToolbar";
import LayersPanel from "@/components/LayersPanel";
import { toast } from "@/components/ui/toast";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { DemoSceneService } from "@/core/services/demoSceneService";
import { useAppStore } from "@/core/state/store";
import { DemoScene } from "@/types/demo";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DemoSceneClient() {
  const router = useRouter();
  const params = useParams();
  const sceneName = params.sceneName as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoScene, setDemoScene] = useState<DemoScene | null>(null);

  // Store actions for loading demo scene
  const dispatch = useAppStore((state) => state.dispatch);

  useEffect(() => {
    const loadDemoScene = async () => {
      // Show loading toast
      const loadingToast = toast.loading("Loading demo scene...", {
        description: `Finding scene: ${sceneName}`,
      });

      try {
        console.log("🎬 [DEMO] Loading demo scene:", sceneName);

        // Initialize default scenes if none exist
        DemoSceneService.initializeDefaultScenes();

        let scene: DemoScene | null = null;

        // Check if this is a URL with embedded scene data
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const encodedScene = urlParams.get("scene");

          if (encodedScene) {
            console.log("🔗 [DEMO] Found embedded scene data in URL");
            scene = DemoSceneService.decodeSceneFromUrl(encodedScene);

            if (scene) {
              console.log(
                "✅ [DEMO] Successfully decoded scene from URL:",
                scene.name
              );
            } else {
              console.error(
                "🔴 [DEMO] Failed to decode scene from URL parameter"
              );
            }
          }
        }

        // If no embedded data, try traditional loading methods
        if (!scene) {
          // Try to find scene by ID first
          scene = DemoSceneService.getScene(sceneName);

          // If not found by ID, try to find by name
          if (!scene) {
            const manifest = DemoSceneService.getManifest();
            const decodedName = decodeURIComponent(sceneName).replace(
              /-/g,
              " "
            );

            // Find scene by matching name (case insensitive)
            const foundScene = Object.values(manifest.scenes).find(
              (s) => s.name.toLowerCase() === decodedName.toLowerCase()
            );

            if (foundScene) {
              scene = foundScene;
            }
          }
        }

        if (!scene) {
          toast.dismiss(loadingToast);
          setError(`Demo scene "${sceneName}" not found`);
          setIsLoading(false);
          toast.error("Demo scene not found", {
            description: `Could not find scene: ${sceneName}`,
          });
          return;
        }

        setDemoScene(scene);

        // Load the scene into the canvas store

        // Clear current state and load demo scene
        dispatch({
          type: "LOAD_DEMO_SCENE",
          payload: {
            objects: scene.objects,
            objectIds: scene.objectIds,
            pages: scene.pages,
            pageIds: scene.pageIds,
            currentPageId: scene.currentPageId,
          },
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        });

        setIsLoading(false);

        // Dismiss loading toast and show welcome toast
        toast.dismiss(loadingToast);
        if (scene) {
          toast.success(`Welcome to "${scene.name}"!`, {
            description: `Demo scene with ${
              Object.keys(scene.objects).length
            } objects loaded`,
          });
        }
      } catch (err) {
        console.error("🔴 [DEMO] Failed to load demo scene:", err);
        toast.dismiss(loadingToast);
        toast.error("Failed to load demo scene", {
          description:
            err instanceof Error ? err.message : "Unknown error occurred",
        });
        setError(
          err instanceof Error ? err.message : "Failed to load demo scene"
        );
        setIsLoading(false);
      }
    };

    loadDemoScene();
  }, [sceneName, dispatch]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-xs">
            Loading demo scene...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Demo Scene Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Main Canvas
          </button>
        </div>
      </div>
    );
  }

  return (
    <NavigationProvider>
      <LayersPanelProvider>
        <div className="h-screen flex">
          {/* Main content using the existing wrapper structure */}
          <CanvasWithPropertiesWrapper />

          {/* Global keyboard shortcuts */}
          <GlobalKeyboardShortcuts />

          {/* Floating UI Components */}
          <FloatingToolbar />
          <LayersPanel />
        </div>
      </LayersPanelProvider>
    </NavigationProvider>
  );
}

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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function DemoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoScene, setDemoScene] = useState<DemoScene | null>(null);

  // Store actions for loading demo scene
  const dispatch = useAppStore((state) => state.dispatch);

  useEffect(() => {
    const loadDemoScene = async () => {
      // Show loading toast
      const loadingToast = toast.loading("Loading demo scene...", {
        description: "Decoding scene data from URL",
      });

      try {
        const encodedScene = searchParams.get("scene");

        if (!encodedScene) {
          toast.dismiss(loadingToast);
          setError("No demo scene data provided in URL");
          setIsLoading(false);
          toast.error("Invalid demo URL", {
            description: "No scene data found in URL parameter",
          });
          return;
        }

        console.log("🔗 [DEMO] Loading demo scene from URL parameter");

        // Decode scene data from URL
        const scene = DemoSceneService.decodeSceneFromUrl(encodedScene);

        if (!scene) {
          toast.dismiss(loadingToast);
          setError("Invalid or corrupted demo scene data in URL");
          setIsLoading(false);
          toast.error("Failed to decode demo scene", {
            description:
              "The demo scene data in the URL appears to be corrupted",
          });
          return;
        }

        setDemoScene(scene);

        // Load the scene into the canvas store
        console.log("🎬 [DEMO] Loading scene data into store:", {
          name: scene.name,
          objectCount: Object.keys(scene.objects).length,
          pageCount: scene.pageIds.length,
        });

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
        console.log("✅ [DEMO] Demo scene loaded successfully from URL");

        // Dismiss loading toast and show success
        toast.dismiss(loadingToast);
        toast.success(`Demo scene "${scene.name}" loaded successfully!`, {
          description: `Loaded ${
            Object.keys(scene.objects).length
          } objects across ${scene.pageIds.length} page(s)`,
        });
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
  }, [searchParams, dispatch]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-xs">
            Loading shared demo scene...
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
            Demo Scene Error
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

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-xs">
              Loading demo scene...
            </p>
          </div>
        </div>
      }
    >
      <DemoPageContent />
    </Suspense>
  );
}

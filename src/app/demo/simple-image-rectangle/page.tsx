"use client";

import GlobalKeyboardShortcuts from "@/components/app/GlobalKeyboardShortcuts";
import CanvasWithPropertiesWrapper, {
  LayersPanelProvider,
} from "@/components/canvas/CanvasWithPropertiesWrapper";
import FloatingToolbar from "@/components/FloatingToolbar";
import LayersPanel from "@/components/LayersPanel";
import { DemoSceneService } from "@/core/services/demoSceneService";
import { useAppStore } from "@/core/state/store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SimpleImageRectangleDemoPage() {
  const router = useRouter();
  const dispatch = useAppStore((state) => state.dispatch);

  useEffect(() => {
    // Create and load the simple demo scene
    const demoScene = DemoSceneService.createSimpleImageRectangleScene();

    console.log("🎬 [DEMO] Loading simple image rectangle scene:", demoScene);

    // Load the scene into the store
    dispatch({
      type: "LOAD_DEMO_SCENE",
      payload: {
        objects: demoScene.objects,
        objectIds: demoScene.objectIds,
        pages: demoScene.pages,
        pageIds: demoScene.pageIds,
        currentPageId: demoScene.currentPageId,
      },
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
  }, [dispatch]);

  return (
    <LayersPanelProvider>
      <div className="h-screen flex">
        {/* Demo Scene Banner */}
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Demo:</span>
            <span className="text-sm">Simple Image Rectangle</span>
            <button
              onClick={() => router.push("/")}
              className="ml-2 text-xs bg-green-700 hover:bg-green-800 px-2 py-1 rounded"
            >
              Exit Demo
            </button>
          </div>
        </div>

        {/* Main content using the existing wrapper structure */}
        <CanvasWithPropertiesWrapper />

        {/* Global keyboard shortcuts */}
        <GlobalKeyboardShortcuts />

        {/* Floating UI Components */}
        <FloatingToolbar />
        <LayersPanel />
      </div>
    </LayersPanelProvider>
  );
}

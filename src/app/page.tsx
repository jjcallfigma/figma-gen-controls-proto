"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import GlobalKeyboardShortcuts from "@/components/app/GlobalKeyboardShortcuts";
import CanvasWithPropertiesWrapper, {
  LayersPanelProvider,
} from "@/components/canvas/CanvasWithPropertiesWrapper";
import FloatingToolbar from "@/components/FloatingToolbar";
import LayersPanel from "@/components/LayersPanel";
import NavigationBar from "@/components/NavigationBar";
import InsertSidebar from "@/components/InsertSidebar";
import SearchSidebar from "@/components/SearchSidebar";
import AiAssistantSidebar from "@/components/AiAssistantSidebar";
import DemoControlsPopover from "@/features/gen-ai/demo/DemoControlsPopover";
import MakeEditorOverlay from "@/components/MakeEditorOverlay";
import { NavigationProvider, useNavigation } from "@/contexts/NavigationContext";

import { useClientSidePersistence } from "@/hooks/useClientSidePersistence";

// ── Dev-only debug panel ──────────────────────────────────────────────────────
// Dynamically imported so it is excluded from production bundles.
const GenAiDebugPanel =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/features/gen-ai/debug/GenAiDebugPanel"), { ssr: false })
    : null;

function HomePageContent() {
  const { activeTab, isNavigationCollapsed } = useNavigation();

  // Initialize client-side persistence (loads saved state after hydration)
  useClientSidePersistence();

  // Install window.__debug helpers once on mount (dev only)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    Promise.all([
      import("@/lib/debug"),
      import("@/core/state/store"),
      import("@/features/gen-ai/debug/genAiDebugStore"),
    ]).then(([{ installDebugHelpers }, { store }, { useGenAiDebugStore }]) => {
      installDebugHelpers(store, useGenAiDebugStore);
    });
  }, []);

  const renderSidebar = () => {
    switch (activeTab) {
      case 'page':
        return <LayersPanel />;
      case 'insert':
        return <InsertSidebar />;
      case 'search':
        return <SearchSidebar />;
      case 'ai-assistant':
        return null; // AiAssistantSidebar is always mounted separately
      default:
        return <LayersPanel />;
    }
  };

  return (
    <div className="h-screen flex">
      {/* Left Navigation Bar - conditionally visible */}
      {!isNavigationCollapsed && <NavigationBar />}

      {/* Main content using the existing wrapper structure */}
      <CanvasWithPropertiesWrapper />

      {/* Global keyboard shortcuts */}
      <GlobalKeyboardShortcuts />

      {/* Floating UI Components */}
      <FloatingToolbar />
      
      {/* Dynamic Sidebar based on active tab */}
      {renderSidebar()}

      {/* AI Assistant — always mounted so Make chat streams survive tab switches */}
      <AiAssistantSidebar visible={activeTab === 'ai-assistant'} />

      {/* Demo controls popover for /ui slash command */}
      <DemoControlsPopover />

      {/* Make Editor Overlay — fullscreen when editing a Make node */}
      <MakeEditorOverlay />

      {/* Debug Portal Issues */}

      {/* Gen-AI debug panel — dev only, excluded from production bundle */}
      {GenAiDebugPanel && <GenAiDebugPanel />}
    </div>
  );
}

export default function HomePage() {
  return (
    <NavigationProvider>
      <LayersPanelProvider>
        <HomePageContent />
      </LayersPanelProvider>
    </NavigationProvider>
  );
}

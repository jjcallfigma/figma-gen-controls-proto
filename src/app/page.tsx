"use client";

import React from "react";
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
import MakeEditorOverlay from "@/components/MakeEditorOverlay";
import { NavigationProvider, useNavigation } from "@/contexts/NavigationContext";
import { Agentation } from "agentation";

import { useClientSidePersistence } from "@/hooks/useClientSidePersistence";

function HomePageContent() {
  const { activeTab, isNavigationCollapsed } = useNavigation();
  
  // Initialize client-side persistence (loads saved state after hydration)
  useClientSidePersistence();

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

      {/* Make Editor Overlay — fullscreen when editing a Make node */}
      <MakeEditorOverlay />

      {/* Debug Portal Issues */}

      {/* Agentation — dev-only annotation overlay */}
      {process.env.NODE_ENV === "development" && <Agentation />}
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

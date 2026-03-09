"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type NavigationTab = 'page' | 'insert' | 'search' | 'ai-assistant';

interface NavigationContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isNavigationCollapsed: boolean;
  setIsNavigationCollapsed: (collapsed: boolean) => void;
  isPropertiesPanelCollapsed: boolean;
  setIsPropertiesPanelCollapsed: (collapsed: boolean) => void;
}

export const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<NavigationTab>('page');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);
  const [isPropertiesPanelCollapsed, setIsPropertiesPanelCollapsed] = useState(false);

  return (
    <NavigationContext.Provider value={{ activeTab, setActiveTab, sidebarWidth, setSidebarWidth, isNavigationCollapsed, setIsNavigationCollapsed, isPropertiesPanelCollapsed, setIsPropertiesPanelCollapsed }}>
      {children}
    </NavigationContext.Provider>
  );
}

// Default values for when used outside provider (during SSR/static generation)
const defaultNavigationContext: NavigationContextType = {
  activeTab: 'page',
  setActiveTab: () => {},
  sidebarWidth: 240,
  setSidebarWidth: () => {},
  isNavigationCollapsed: false,
  setIsNavigationCollapsed: () => {},
  isPropertiesPanelCollapsed: false,
  setIsPropertiesPanelCollapsed: () => {},
};

export function useNavigation() {
  const context = useContext(NavigationContext);
  // Return default values during SSR/static generation instead of throwing
  if (context === undefined) {
    return defaultNavigationContext;
  }
  return context;
}

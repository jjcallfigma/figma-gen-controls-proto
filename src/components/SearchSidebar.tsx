"use client";

import React, { useState, useCallback } from "react";
import { Icon24Close } from "./icons/icon-24-close";
import SearchInput from "./SearchInput";
import { useNavigation } from "@/contexts/NavigationContext";

export default function SearchSidebar() {
  const { setActiveTab, sidebarWidth, setSidebarWidth, isNavigationCollapsed } = useNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isResizing, setIsResizing] = useState(false);

  // Handle panel resizing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX; // Normal direction for east resize
        const newWidth = Math.max(240, Math.min(500, startWidth + deltaX));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth, setSidebarWidth]
  );

  return (
    <div
      className={`fixed top-0 h-full z-40 flex-shrink-0 border-r select-none ${isNavigationCollapsed ? 'left-0' : 'left-[48px]'}`}
      style={{
        width: `${sidebarWidth}px`,
        backgroundColor: "var(--color-bg-elevated)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Resize Handle */}
      <div
        className="absolute right-0 top-0 w-1 h-full cursor-ew-resize"
        onMouseDown={handleMouseDown}
      />
      <div className="h-full flex flex-col">
        {/* Header */}
        <div
          className="flex items-center justify-between pl-4 pr-3 pt-3 pb-3 flex-shrink-0 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <span 
              className="text-[13px] font-medium leading-[22px] tracking-[-0.0325px]"
              style={{ 
                color: "var(--color-text)"
              }}
            >
              Find
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('page')}
              className="w-6 h-6 flex items-center justify-center hover:bg-[var(--color-bg-secondary)] transition-colors rounded"
              style={{ color: "var(--color-icon)" }}
            >
              <Icon24Close />
            </button>
          </div>
        </div>

        {/* Search Section */}
        <SearchInput 
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search all libraries"
          onAdjustClick={() => {
            // Handle adjust/filter button click
          }}
        />

        {/* Content */}
        <div className="flex-1 p-4">
          {searchQuery ? (
            <div className="space-y-2">
              <div className="text-sm text-gray-500 mb-2">
                Results for "{searchQuery}"
              </div>
              <div className="text-sm text-gray-400">
                No results found. Try a different search term.
              </div>
            </div>
          ) : (<></>)}
        </div>
      </div>
    </div>
  );
}

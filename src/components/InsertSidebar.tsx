"use client";

import React, { useState, useCallback } from "react";
import { Icon24Close } from "./icons/icon-24-close";
import { Icon24Library } from "./icons/icon-24-library";
import SearchInput from "./SearchInput";
import { useNavigation } from "@/contexts/NavigationContext";

export default function InsertSidebar() {
  const { setActiveTab, sidebarWidth, setSidebarWidth, isNavigationCollapsed } = useNavigation();
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
        className={`fixed top-0 h-full z-40 flex-shrink-0 border-r select-none bg-[var(--color-bg-elevated)] border-[var(--color-border)] ${isNavigationCollapsed ? 'left-0' : 'left-[48px]'}`}
        style={{
          width: `${sidebarWidth}px`,
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
              Assets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-6 h-6 flex items-center justify-center hover:bg-[var(--color-bg-secondary)] transition-colors rounded color-[var(--color-icon)]"
            >
              <Icon24Library />
            </button>
            <button
              onClick={() => setActiveTab('page')}
              className="w-6 h-6 flex items-center justify-center hover:bg-[var(--color-bg-secondary)] transition-colors rounded color-[var(--color-icon)]"
            >
              <Icon24Close />
            </button>
          </div>
        </div>

        {/* Search Section */}
        <SearchInput 
          placeholder="Search all libraries"
          onAdjustClick={() => {
            // Handle adjust/filter button click
          }}
        />

        {/* Breadcrumb */}
        <div className="px-4 pb-2">
          <div className="text-[11px] font-medium leading-[16px] color-[var(--color-text)]">
            All libraries
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-2 pb-4">
          <div className="grid grid-cols-1">
            {/* Library Cards */}
            {Array.from({ length: 4 }, (_, index) => (
              <div 
                key={index}
                className="flex flex-col cursor-pointer hover:bg-[var(--color-bg-secondary)] rounded-[5px] p-2 transition-colors"
              >
                {/* Preview Area */}
                <div className="w-full mb-2 rounded-[5px] aspect-video bg-[var(--color-bg-secondary)]"/>
                
                {/* Library Info */}
                <div className="flex flex-col">
                  <div className="text-[11px] font-medium leading-[16px] color-[var(--color-text)]">
                    Library
                  </div>
                  <div className="text-[11px] leading-[16px] color-[var(--color-text-secondary)]">
                    10 components
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

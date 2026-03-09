"use client";

import React, { useRef, useState } from "react";
import ColorPopover from "./ColorPopover";

interface ColorTriggerProps {
  color: string;
  opacity?: number;
  onColorChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  title?: string;
  showOpacity?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function ColorTrigger({
  color,
  opacity = 1,
  onColorChange,
  onOpacityChange,
  title = "Color",
  showOpacity = true,
  className = "",
  size = "md",
}: ColorTriggerProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!triggerRef.current) return;

    // Get trigger position for popover placement
    const rect = triggerRef.current.getBoundingClientRect();
    const x = rect.left - 240 - 8; // Position to the left with gap
    const y = rect.top;

    setPopoverPosition({ x, y });
    setIsPopoverOpen(true);
  };

  const handleClose = () => {
    setIsPopoverOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        className={`
          ${sizeClasses[size]} 
          rounded-[3px] 
          outline outline-1 outline-[--color-bordertranslucent] outline-offset-[-1px] 
          shrink-0 overflow-hidden 
          hover:outline-8 
          transition-all
          ${className}
        `}
        style={{
          backgroundColor: color,
          opacity: showOpacity ? opacity : 1,
        }}
        title={`Edit ${title.toLowerCase()}`}
      />

      <ColorPopover
        isOpen={isPopoverOpen}
        onClose={handleClose}
        position={popoverPosition}
        color={color}
        opacity={opacity}
        onColorChange={onColorChange}
        onOpacityChange={onOpacityChange}
        title={title}
        showOpacity={showOpacity}
      />
    </>
  );
}

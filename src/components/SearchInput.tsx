"use client";

import React from "react";
import { Icon24Search } from "./icons/icon-24-search";
import { Icon24AdjustSmall } from "./icons/icon-24-adjust-small";

interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  onAdjustClick?: () => void;
  className?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search all libraries",
  onAdjustClick,
  className = "",
}: SearchInputProps) {
  return (
    <div className={`pl-[16px] px-[12px] py-[12px] flex-shrink-0 ${className}`}>
      <div className="flex gap-[8px] items-center w-full ">
        <div 
          className="flex items-center rounded-[5px] py-2 flex-1 bg-[var(--color-bg-secondary)] h-[24px]"
        >
          <Icon24Search 
            style={{ color: "var(--color-icon)" }}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none outline-none"
            style={{ 
              color: "var(--color-text)",
              fontSize: "11px",
              lineHeight: "16px"
            }}
          />
        </div>
        <button 
          onClick={onAdjustClick}
          className="w-6 h-6 flex items-center justify-center hover:bg-[var(--color-bg-secondary)] transition-colors rounded"
          style={{ color: "var(--color-icon)" }}
        >
          <Icon24AdjustSmall />
        </button>
      </div>
    </div>
  );
}

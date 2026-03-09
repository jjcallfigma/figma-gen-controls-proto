"use client";

import React from "react";
import { Icon24CloseSmall } from "../icons/icon-24-close-small";

export interface PropertyPopoverHeaderProps {
  title?: string;
  onClose: () => void;
  children?: React.ReactNode;
  showTabs?: boolean;
}

export default function PropertyPopoverHeader({
  title,
  onClose,
  children,
  showTabs = false,
}: PropertyPopoverHeaderProps) {
  return (
    <>
      {/* Main header with title and close button */}
      {title && (
        <div
          className="flex items-center justify-between pr-2 pl-4 py-3 border-b popover-header"
          data-draggable="true"
        >
          <div className="text-xs font-medium" data-draggable="true">
            {title}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-[5px] hover:bg-secondary flex items-center justify-center"
            title="Close"
          >
            <Icon24CloseSmall />
          </button>
        </div>
      )}

      {/* Optional tabs/controls section */}
      {children && <div className="border-b">{children}</div>}
    </>
  );
}

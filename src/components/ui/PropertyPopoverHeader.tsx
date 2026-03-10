"use client";

import React from "react";
import { Icon24CloseSmall } from "../icons/icon-24-close-small";

export interface PropertyPopoverHeaderProps {
  title?: string;
  onClose: () => void;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
  actionTitle?: string;
  children?: React.ReactNode;
  showTabs?: boolean;
}

export default function PropertyPopoverHeader({
  title,
  onClose,
  onAction,
  actionIcon,
  actionTitle,
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
          <div className="text-xs font-medium flex-1" data-draggable="true">
            {title}
          </div>
          <div className="flex items-center gap-0.5">
            {onAction && actionIcon && (
              <button
                onClick={onAction}
                className="w-6 h-6 rounded-[5px] hover:bg-secondary flex items-center justify-center"
                title={actionTitle}
              >
                {actionIcon}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-[5px] hover:bg-secondary flex items-center justify-center"
              title="Close"
            >
              <Icon24CloseSmall />
            </button>
          </div>
        </div>
      )}

      {/* Optional tabs/controls section */}
      {children && <div className="border-b">{children}</div>}
    </>
  );
}

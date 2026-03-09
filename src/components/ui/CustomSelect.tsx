"use client";

import { cn } from "@/lib/utils";
import * as SelectPrimitive from "@radix-ui/react-select";
import React from "react";
import { Icon24Check } from "../icons/icon-24-check";
import { Icon24ChevronDown } from "../icons/icon-24-chevron-down";
import { Icon24ChevronUp } from "../icons/icon-24-chevron-up";

interface CustomSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  trigger: React.ReactElement;
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Custom Select component that accepts any trigger element
 * Uses standard Radix Select with proper asChild forwarding
 */

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <Icon24ChevronUp className="text-menu" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <Icon24ChevronDown className="text-menu" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

export function CustomSelect({
  value,
  onValueChange,
  trigger,
  children,
  onOpenChange,
}: CustomSelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      onOpenChange={onOpenChange}
    >
      <SelectPrimitive.Trigger asChild>
        {trigger}
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            "relative z-[70] max-h-[--radix-select-content-available-height] min-w-[6rem] overflow-y-auto overflow-x-hidden rounded-[13px] bg-menu text-default data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin] shadow-400",
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1"
          )}
          position="popper"
          side="bottom"
          align="center"
        >
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport className="p-2">
            {children}
          </SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// Custom Select content components that work with CustomSelect
// Since CustomSelect already renders content, this is just a wrapper for the children
const CustomSelectContent = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);

const CustomSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full text-white cursor-default select-none items-center rounded-[5px] py-1 h-6 pl-5 pr-2 text-xs outline-none hover:bg-menu-hover focus:bg-menu-selected focus:text-menu data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-1 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Icon24Check className="text-menu" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
CustomSelectItem.displayName = "CustomSelectItem";

const CustomSelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
CustomSelectSeparator.displayName = "CustomSelectSeparator";

// Export the custom select components
export { CustomSelectContent, CustomSelectItem, CustomSelectSeparator };

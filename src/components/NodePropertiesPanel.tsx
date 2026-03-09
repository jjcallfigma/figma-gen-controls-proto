"use client";

import { JsxNode } from "@/core/utils/jsxParser";
import {
  displayOpacityValue,
  displayTwValue,
  parseTailwindClasses,
  replaceClass,
  toTwValue,
} from "@/core/utils/tailwindParser";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Canvas components (exact reuse) ─────────────────────────────────
import { Button } from "./ui/button";
import { PropertyInput } from "./ui/PropertyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

// ─── Canvas icons (exact reuse) ──────────────────────────────────────
import { Icon24AlLayoutGridHorizontalSmall } from "./icons/icon-24-al-layout-grid-horizontal-small";
import { Icon24AlLayoutGridNoneSmall } from "./icons/icon-24-al-layout-grid-none-small";
import { Icon24AlLayoutGridVerticalSmall } from "./icons/icon-24-al-layout-grid-vertical-small";
import { Icon24AlPaddingBottom } from "./icons/icon-24-al-padding-bottom";
import { Icon24AlPaddingHorizontal } from "./icons/icon-24-al-padding-horizontal";
import { Icon24AlPaddingLeft } from "./icons/icon-24-al-padding-left";
import { Icon24AlPaddingRight } from "./icons/icon-24-al-padding-right";
import { Icon24AlPaddingSides } from "./icons/icon-24-al-padding-sides";
import { Icon24AlPaddingTop } from "./icons/icon-24-al-padding-top";
import { Icon24AlPaddingVertical } from "./icons/icon-24-al-padding-vertical";
import { Icon24AlSpacingHorizontal } from "./icons/icon-24-al-spacing-horizontal";
import { Icon24AlSpacingVertical } from "./icons/icon-24-al-spacing-vertical";
import { Icon24Corners } from "./icons/icon-24-corners";
import { Icon24GridView } from "./icons/icon-24-grid-view";
import { Icon24Opacity } from "./icons/icon-24-opacity";
import { Icon24TextAlignCenter } from "./icons/icon-24-text-align-center";
import { Icon24TextAlignJustified } from "./icons/icon-24-text-align-justified";
import { Icon24TextAlignLeft } from "./icons/icon-24-text-align-left";
import { Icon24TextAlignRight } from "./icons/icon-24-text-align-right";
import { Icon24TextLetterSpacing } from "./icons/icon-24-text-letter-spacing";
import { Icon24TextLineHeight } from "./icons/icon-24-text-line-height";

// ─── Inspector-specific icons ────────────────────────────────────────
import { Icon16Component } from "./icons/icon-16-component";
import { Icon24EyeSmall } from "./icons/icon-24-eye-small";
import { Icon24HiddenSmall } from "./icons/icon-24-hidden-small";

// ─── Color picker ─────────────────────────────────────────────────────
import { Icon24Close } from "./icons/icon-24-close";
import ColorPopover from "./ui/ColorPopover";

// ─── Types ───────────────────────────────────────────────────────────

export interface InspectorSelection {
  nodeId: number;
  name: string;
  className: string;
  textContent: string;
  rect: { left: number; top: number; width: number; height: number };
}

interface NodePropertiesPanelProps {
  selection: InspectorSelection | null;
  jsxNode: JsxNode | null;
  onPropChange: (nodeId: number, propName: string, newValue: string) => void;
  onTextChange: (nodeId: number, newText: string) => void;
  onDelete: (nodeId: number) => void;
  onDeselect: () => void;
}

// ─── Known prop values for shadcn / common components ────────────────

const KNOWN_PROP_VALUES: Record<string, Record<string, string[]>> = {
  Button: {
    variant: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    size: ["default", "sm", "lg", "icon"],
    type: ["button", "submit", "reset"],
  },
  Badge: {
    variant: ["default", "secondary", "destructive", "outline"],
  },
  Toggle: {
    variant: ["default", "outline"],
    size: ["default", "sm", "lg"],
  },
  ToggleGroupItem: {
    variant: ["default", "outline"],
    size: ["default", "sm", "lg"],
  },
  Input: {
    type: ["text", "password", "email", "number", "search", "tel", "url", "date", "time", "file"],
  },
  Textarea: {
    rows: ["3", "5", "8", "10"],
  },
  Separator: {
    orientation: ["horizontal", "vertical"],
  },
  Alert: {
    variant: ["default", "destructive"],
  },
  Sheet: {
    side: ["top", "right", "bottom", "left"],
  },
  SheetContent: {
    side: ["top", "right", "bottom", "left"],
  },
  Accordion: {
    type: ["single", "multiple"],
  },
};

const HTML_PROP_VALUES: Record<string, string[]> = {
  type: ["text", "password", "email", "number", "submit", "button", "reset", "checkbox", "radio", "file", "hidden"],
  target: ["_self", "_blank", "_parent", "_top"],
  role: ["button", "link", "tab", "tabpanel", "dialog", "alert", "status", "navigation", "main", "form"],
  autocomplete: ["off", "on", "name", "email", "username", "current-password", "new-password"],
};

function getKnownValues(componentName: string, propName: string): string[] | null {
  const componentValues = KNOWN_PROP_VALUES[componentName]?.[propName];
  if (componentValues && componentValues.length > 0) return componentValues;
  const htmlValues = HTML_PROP_VALUES[propName];
  if (htmlValues) return htmlValues;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function NodePropertiesPanel({
  selection,
  jsxNode,
  onPropChange,
  onTextChange,
  onDelete,
  onDeselect,
}: NodePropertiesPanelProps) {
  if (!selection || !jsxNode) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-8 h-8 rounded-lg mb-2.5 flex items-center justify-center"
          style={{ backgroundColor: "var(--color-bg-secondary)" }}
        >
          <Icon16Component style={{ color: "var(--color-icon-tertiary)" }} />
        </div>
        <p
          className="text-[11px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Click an element to inspect
        </p>
      </div>
    );
  }

  const componentName = jsxNode.name;
  const className = jsxNode.props.find((p) => p.name === "className")?.value || "";

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">
      {/* ─── Header ─── */}
      <div
        className="flex items-center justify-between px-3 flex-shrink-0 h-12 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* <Icon16Component
            style={{ color: "var(--color-icon-component)", flexShrink: 0 }}
          /> */}
          <span
            className="text-[13px] font-medium truncate"
            style={{ color: "var(--color-text)" }}
          >
            {jsxNode.name}
          </span>
        </div>
        <div className="flex items-center">
    
          <Button
            variant="ghost"
            size="icon"
            onClick={onDeselect}
            
            title="Deselect (Esc)"
          >
            <Icon24Close />
          </Button>
        </div>
      </div>

      {/* ─── Scrollable content: Content + Props + Style ─── */}
      <div className="flex-1 overflow-y-auto">
        {/* Content & Props (from former Props tab) */}
        {jsxNode.props.length > 0 && (
          <>
        <ContentAndPropsSection
          selection={selection}
          jsxNode={jsxNode}
          componentName={componentName}
          onPropChange={onPropChange}
          onTextChange={onTextChange}
        />
        <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
        </>
        )}

        {/* Style (visual Tailwind controls) */}
        <StyleTab
          selection={selection}
          jsxNode={jsxNode}
          className={className}
          onClassChange={(newCls) => onPropChange(selection.nodeId, "className", newCls)}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLE TAB — Visual Tailwind class editing using canvas components
// ═══════════════════════════════════════════════════════════════════════

function StyleTab({
  selection,
  jsxNode,
  className,
  onClassChange,
}: {
  selection: InspectorSelection;
  jsxNode: JsxNode;
  className: string;
  onClassChange: (newClassName: string) => void;
}) {
  const tw = useMemo(() => parseTailwindClasses(className), [className]);

  // Helper: swap a class by simple prefix (works for px-, w-, items-, etc.)
  const setClass = useCallback(
    (prefix: string, value: string | null) => {
      const updated = replaceClass(className, prefix, value);
      onClassChange(updated);
    },
    [className, onClassChange]
  );

  // Helper: swap one exact class for another (safe for text-*, font-*, border-* ambiguity)
  const swapClass = useCallback(
    (oldClass: string | null, newClass: string | null) => {
      const classes = className.split(/\s+/).filter(Boolean);
      const filtered = oldClass ? classes.filter((c) => c !== oldClass) : classes;
      if (newClass) filtered.push(newClass);
      onClassChange(filtered.join(" "));
    },
    [className, onClassChange]
  );

  const hasLayout = tw.layout.display === "flex" || tw.layout.display === "grid" || tw.layout.display === "inline-flex";

  return (
    <>
      {/* ═══ Layout ═══ */}
      <div className="pl-4 pr-2 pb-3">
        <div
          className="text-xs font-medium h-10 flex items-center"
          style={{ color: "var(--color-text)" }}
        >
          Layout
        </div>

        {/* Display mode toggle (with direction merged) + wrap toggle */}
        <div className="grid grid-cols-[1fr_24px] w-full gap-2 h-8 items-center">
          <ToggleGroup
            type="single"
            value={
              tw.layout.display === "hidden" ? "block"
              : tw.layout.display === "flex"
                ? (tw.layout.direction === "flex-col" || tw.layout.direction === "flex-col-reverse" ? "flex-col" : "flex-row")
                : (tw.layout.display || "block")
            }
            onValueChange={(val) => {
              if (!val) return;
              let updated = className;
              if (val === "flex-row") {
                updated = replaceClass(updated, "flex|grid|block|inline|hidden|inline-flex|inline-block|inline-grid|table", "flex");
                updated = replaceClass(updated, "flex-row|flex-col|flex-row-reverse|flex-col-reverse", "flex-row");
              } else if (val === "flex-col") {
                updated = replaceClass(updated, "flex|grid|block|inline|hidden|inline-flex|inline-block|inline-grid|table", "flex");
                updated = replaceClass(updated, "flex-row|flex-col|flex-row-reverse|flex-col-reverse", "flex-col");
              } else {
                updated = replaceClass(updated, "flex|grid|block|inline|hidden|inline-flex|inline-block|inline-grid|table", val);
                updated = replaceClass(updated, "flex-row|flex-col|flex-row-reverse|flex-col-reverse", null);
              }
              onClassChange(updated);
            }}
            className="w-full bg-secondary rounded-[5px]"
          >
            <ToggleGroupItem value="block">
              <Icon24AlLayoutGridNoneSmall />
            </ToggleGroupItem>
            <ToggleGroupItem value="flex-row">
              <Icon24AlLayoutGridHorizontalSmall />
            </ToggleGroupItem>
            <ToggleGroupItem value="flex-col">
              <Icon24AlLayoutGridVerticalSmall />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid">
              <Icon24GridView />
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Wrap toggle (flex only) in the 24px slot */}
          {tw.layout.display === "flex" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const isWrapped = tw.layout.wrap === "flex-wrap";
                setClass("flex-wrap|flex-nowrap|flex-wrap-reverse", isWrapped ? null : "flex-wrap");
              }}
              className={tw.layout.wrap === "flex-wrap" ? "bg-selected hover:bg-selected-secondary" : ""}
              title={tw.layout.wrap === "flex-wrap" ? "Disable wrap" : "Enable wrap"}
            >
              <span className="text-[9px] font-medium">W</span>
            </Button>
          ) : (
            <div />
          )}
        </div>

        {/* W + H — always visible in Layout */}
        <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
          <PropertyInput
            label="Width"
            value={displayTwValue(tw.sizing.width || "auto")}
            onChange={(v) => setClass("w-", v && v !== "auto" ? `w-${toTwValue(v, "size")}` : null)}
            type="text"
            leadingLabel="W"
          />
          <PropertyInput
            label="Height"
            value={displayTwValue(tw.sizing.height || "auto")}
            onChange={(v) => setClass("h-", v && v !== "auto" ? `h-${toTwValue(v, "size")}` : null)}
            type="text"
            leadingLabel="H"
          />
        </div>

        {hasLayout && (
          <>
            {/* Align + Justify */}
            <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
              <Select
                value={tw.layout.alignItems || "stretch"}
                onValueChange={(val) => setClass("items-", `items-${val}`)}
              >
                <SelectTrigger className="h-6 text-xs">
                  <SelectValue placeholder="Align" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="end">End</SelectItem>
                  <SelectItem value="stretch">Stretch</SelectItem>
                  <SelectItem value="baseline">Baseline</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={tw.layout.justifyContent || "start"}
                onValueChange={(val) => setClass("justify-", `justify-${val}`)}
              >
                <SelectTrigger className="h-6 text-xs">
                  <SelectValue placeholder="Justify" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="end">End</SelectItem>
                  <SelectItem value="between">Between</SelectItem>
                  <SelectItem value="around">Around</SelectItem>
                  <SelectItem value="evenly">Evenly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Gap — matches LayoutPanel's gap input */}
            <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
              <PropertyInput
                label="Gap"
                value={displayTwValue(tw.layout.gap || "0")}
                onChange={(v) => setClass("gap", v && v !== "0" ? `gap-${toTwValue(v, "spacing")}` : null)}
                type="text"
                leadingIcon={
                  tw.layout.display === "flex" && tw.layout.direction?.includes("col")
                    ? <Icon24AlSpacingVertical className="text-secondary" />
                    : <Icon24AlSpacingHorizontal className="text-secondary" />
                }
              />
            </div>
          </>
        )}

        {/* Min/Max W */}
        {(tw.sizing.minWidth || tw.sizing.maxWidth) && (
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <PropertyInput
              label="Min Width"
              value={displayTwValue(tw.sizing.minWidth || "")}
              onChange={(v) => setClass("min-w-", v ? `min-w-${toTwValue(v, "size")}` : null)}
              type="text"
              leadingLabel="↧"
            />
            <PropertyInput
              label="Max Width"
              value={displayTwValue(tw.sizing.maxWidth || "")}
              onChange={(v) => setClass("max-w-", v ? `max-w-${toTwValue(v, "size")}` : null)}
              type="text"
              leadingLabel="↥"
            />
          </div>
        )}

        {/* Min/Max H */}
        {(tw.sizing.minHeight || tw.sizing.maxHeight) && (
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <PropertyInput
              label="Min Height"
              value={displayTwValue(tw.sizing.minHeight || "")}
              onChange={(v) => setClass("min-h-", v ? `min-h-${toTwValue(v, "size")}` : null)}
              type="text"
              leadingLabel="↧"
            />
            <PropertyInput
              label="Max Height"
              value={displayTwValue(tw.sizing.maxHeight || "")}
              onChange={(v) => setClass("max-h-", v ? `max-h-${toTwValue(v, "size")}` : null)}
              type="text"
              leadingLabel="↥"
            />
          </div>
        )}

        {/* Overflow */}
        {tw.overflow && (
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <Select
              value={tw.overflow?.replace("overflow-", "") || "visible"}
              onValueChange={(val) => setClass("overflow-", `overflow-${val}`)}
            >
              <SelectTrigger className="h-6 text-xs">
                <SelectValue placeholder="Overflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visible">Visible</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="scroll">Scroll</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ═══ Appearance ═══ */}
      <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
      <div className="pl-4 pr-2 pb-3">
        <div
          className="text-xs font-medium h-10 flex items-center justify-between"
          style={{ color: "var(--color-text)" }}
        >
          Appearance
          {/* Visibility toggle — matches canvas AppearancePanel */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (tw.layout.display === "hidden") {
                setClass("flex|grid|block|inline|hidden|inline-flex|inline-block|inline-grid|table", "block");
              } else {
                setClass("flex|grid|block|inline|hidden|inline-flex|inline-block|inline-grid|table", "hidden");
              }
            }}
            title={tw.layout.display === "hidden" ? "Show element" : "Hide element"}
          >
            {tw.layout.display === "hidden" ? <Icon24HiddenSmall /> : <Icon24EyeSmall />}
          </Button>
        </div>

        {/* Opacity + Border Radius */}
        <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
          <PropertyInput
            label="Opacity"
            value={displayOpacityValue(tw.effects.opacity || "100")}
            onChange={(v) => setClass("opacity-", v && v !== "100" ? `opacity-${toTwValue(v, "opacity")}` : null)}
            type="text"
            leadingIcon={<Icon24Opacity className="text-secondary" />}
          />
          <PropertyInput
            label="Border Radius"
            value={displayTwValue(tw.border.radius === "rounded" ? "rounded" : tw.border.radius || "none")}
            onChange={(v) => {
              const cls = !v || v === "none" ? null : v === "rounded" ? "rounded" : `rounded-${toTwValue(v, "radius")}`;
              setClass("rounded", cls);
            }}
            type="text"
            leadingIcon={<Icon24Corners />}
          />
        </div>
      </div>
      <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />

      {/* ═══ Spacing ═══ */}
      <SpacingSection tw={tw} className={className} setClass={setClass} />

      {/* ═══ Typography ═══ */}
      {(tw.typography.fontSize || tw.typography.fontWeight || tw.typography.textColor || tw.typography.textAlign || tw.typography.lineHeight || tw.typography.letterSpacing) && (
        <>
        <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
        <div className="pl-4 pr-2 pb-3">
          <div
            className="text-xs font-medium h-10 flex items-center"
            style={{ color: "var(--color-text)" }}
          >
            Typography
          </div>

          {/* Font Size + Weight — matches TypographyPanel pattern */}
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <Select
              value={tw.typography.fontSize || "base"}
              onValueChange={(val) => {
                const old = tw.typography.fontSize ? `text-${tw.typography.fontSize}` : null;
                swapClass(old, `text-${val}`);
              }}
            >
              <SelectTrigger className="h-6 text-xs">
                <SelectValue placeholder="Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xs">XS</SelectItem>
                <SelectItem value="sm">SM</SelectItem>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="lg">LG</SelectItem>
                <SelectItem value="xl">XL</SelectItem>
                <SelectItem value="2xl">2XL</SelectItem>
                <SelectItem value="3xl">3XL</SelectItem>
                <SelectItem value="4xl">4XL</SelectItem>
                <SelectItem value="5xl">5XL</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={tw.typography.fontWeight || "normal"}
              onValueChange={(val) => {
                const old = tw.typography.fontWeight ? `font-${tw.typography.fontWeight}` : null;
                swapClass(old, `font-${val}`);
              }}
            >
              <SelectTrigger className="h-6 text-xs">
                <SelectValue placeholder="Weight" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thin">Thin</SelectItem>
                <SelectItem value="extralight">Extra Light</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semi Bold</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
                <SelectItem value="extrabold">Extra Bold</SelectItem>
                <SelectItem value="black">Black</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Line Height + Letter Spacing — matches TypographyPanel */}
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <PropertyInput
              label="Line Height"
              value={displayTwValue(tw.typography.lineHeight || "")}
              onChange={(v) => setClass("leading-", v ? `leading-${toTwValue(v, "line-height")}` : null)}
              type="text"
              leadingIcon={<Icon24TextLineHeight className="text-secondary" />}
            />
            <PropertyInput
              label="Letter Spacing"
              value={displayTwValue(tw.typography.letterSpacing || "")}
              onChange={(v) => setClass("tracking-", v ? `tracking-${toTwValue(v, "letter-spacing")}` : null)}
              type="text"
              leadingIcon={<Icon24TextLetterSpacing className="text-secondary" />}
            />
          </div>

          {/* Text Align — matches TypographyPanel's alignment ToggleGroup */}
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <ToggleGroup
              type="single"
              value={tw.typography.textAlign || "left"}
              onValueChange={(val) => {
                if (!val) return;
                const old = tw.typography.textAlign ? `text-${tw.typography.textAlign}` : null;
                swapClass(old, `text-${val}`);
              }}
              className="w-full bg-secondary rounded-[5px]"
            >
              <ToggleGroupItem value="left">
                <Icon24TextAlignLeft />
              </ToggleGroupItem>
              <ToggleGroupItem value="center">
                <Icon24TextAlignCenter />
              </ToggleGroupItem>
              <ToggleGroupItem value="right">
                <Icon24TextAlignRight />
              </ToggleGroupItem>
              <ToggleGroupItem value="justify">
                <Icon24TextAlignJustified />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Text Color */}
          {tw.typography.textColor && (
            <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
              <div className="flex items-center gap-1.5">
                <ColorSwatch
                  value={tw.typography.textColor}
                  onChange={(hex) => {
                    const old = tw.typography.textColor ? `text-${tw.typography.textColor}` : null;
                    swapClass(old, `text-[${hex}]`);
                  }}
                  title="Text Color"
                />
                <PropertyInput
                  label="Text Color"
                  value={tw.typography.textColor}
                  onChange={(v) => {
                    const old = tw.typography.textColor ? `text-${tw.typography.textColor}` : null;
                    swapClass(old, v ? `text-${v}` : null);
                  }}
                  type="text"
                />
              </div>
            </div>
          )}
        </div>
        </>
      )}
      <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />

      {/* ═══ Fill ═══ */}
      <div className="pl-4 pr-2 pb-3">
        <div
          className="text-xs font-medium h-10 flex items-center"
          style={{ color: "var(--color-text)" }}
        >
          Fill
        </div>
        <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
          <div className="flex items-center gap-1.5">
            <ColorSwatch
              value={tw.background.color || "transparent"}
              onChange={(hex) => {
                const old = tw.background.color ? `bg-${tw.background.color}` : null;
                swapClass(old, `bg-[${hex}]`);
              }}
              title="Background"
            />
            <PropertyInput
              label="Background"
              value={tw.background.color || "transparent"}
              onChange={(v) => {
                const old = tw.background.color ? `bg-${tw.background.color}` : null;
                swapClass(old, v && v !== "transparent" ? `bg-${v}` : null);
              }}
              type="text"
            />
          </div>
        </div>
      </div>

      {/* ═══ Border ═══ */}
      {(tw.border.width || tw.border.color) && (
        <>
        <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
        <div className="pl-4 pr-2 pb-3">
          <div
            className="text-xs font-medium h-10 flex items-center"
            style={{ color: "var(--color-text)" }}
          >
            Border
          </div>

          {/* Border Color */}
          {tw.border.color && (
            <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
              <div className="flex items-center gap-1.5">
                <ColorSwatch
                  value={tw.border.color}
                  onChange={(hex) => {
                    const old = tw.border.color ? `border-${tw.border.color}` : null;
                    swapClass(old, `border-[${hex}]`);
                  }}
                  title="Border Color"
                />
                <PropertyInput
                  label="Border Color"
                  value={tw.border.color}
                  onChange={(v) => {
                    const old = tw.border.color ? `border-${tw.border.color}` : null;
                    swapClass(old, v ? `border-${v}` : null);
                  }}
                  type="text"
                />
              </div>
            </div>
          )}
        </div>
        </>
      )}

      

      {/* ═══ Position ═══ */}
      {tw.position.type && (
        <>
        <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
        <div className="pl-4 pr-2 pb-3">
          <div
            className="text-xs font-medium h-10 flex items-center"
            style={{ color: "var(--color-text)" }}
          >
            Position
          </div>

          {/* Position type — ToggleGroup */}
          <div className="grid grid-cols-[1fr_24px] gap-2 h-8 items-center">
            <ToggleGroup
              type="single"
              value={tw.position.type}
              onValueChange={(val) => {
                if (!val) return;
                setClass("relative|absolute|fixed|sticky|static", val);
              }}
              className="w-full bg-secondary rounded-[5px]"
            >
              <ToggleGroupItem value="relative">
                <span className="text-[9px] font-medium">Rel</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="absolute">
                <span className="text-[9px] font-medium">Abs</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="fixed">
                <span className="text-[9px] font-medium">Fix</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="sticky">
                <span className="text-[9px] font-medium">Stk</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Inset / TRBL */}
          {(tw.position.top || tw.position.right || tw.position.bottom || tw.position.left || tw.position.inset) && (
            <>
              {tw.position.inset !== undefined && (
                <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
                  <PropertyInput
                    label="Inset"
                    value={displayTwValue(tw.position.inset)}
                    onChange={(v) => setClass("inset-", v ? `inset-${toTwValue(v, "spacing")}` : null)}
                    type="text"
                    leadingLabel="⬚"
                  />
                </div>
              )}
              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
                <PropertyInput
                  label="Top"
                  value={displayTwValue(tw.position.top || "auto")}
                  onChange={(v) => setClass("top-", v && v !== "auto" ? `top-${toTwValue(v, "spacing")}` : null)}
                  type="text"
                  leadingLabel="T"
                />
                <PropertyInput
                  label="Right"
                  value={displayTwValue(tw.position.right || "auto")}
                  onChange={(v) => setClass("right-", v && v !== "auto" ? `right-${toTwValue(v, "spacing")}` : null)}
                  type="text"
                  leadingLabel="R"
                />
              </div>
              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
                <PropertyInput
                  label="Bottom"
                  value={displayTwValue(tw.position.bottom || "auto")}
                  onChange={(v) => setClass("bottom-", v && v !== "auto" ? `bottom-${toTwValue(v, "spacing")}` : null)}
                  type="text"
                  leadingLabel="B"
                />
                <PropertyInput
                  label="Left"
                  value={displayTwValue(tw.position.left || "auto")}
                  onChange={(v) => setClass("left-", v && v !== "auto" ? `left-${toTwValue(v, "spacing")}` : null)}
                  type="text"
                  leadingLabel="L"
                />
              </div>
            </>
          )}

          {/* Z-Index */}
          {tw.position.zIndex && (
            <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
              <PropertyInput
                label="Z-Index"
                value={displayTwValue(tw.position.zIndex)}
                onChange={(v) => setClass("z-", v ? `z-${toTwValue(v, "z-index")}` : null)}
                type="text"
                leadingLabel="Z"
              />
            </div>
          )}
        </div>
        </>
      )}

      {/* ═══ Other classes ═══ */}
      {tw.other.length > 0 && (
        <>
        <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
        <div className="pl-4 pr-2 pb-3">
          <div
            className="text-xs font-medium h-10 flex items-center"
            style={{ color: "var(--color-text)" }}
          >
            Other Classes
          </div>
          <div
            className="text-[10px] font-mono leading-relaxed break-all"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {tw.other.join(" ")}
          </div>
        </div>
        </>
      )}
      <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />

      {/* ═══ Element info ═══ */}
      <div className="pl-4 pr-2 pb-3">
        <div
          className="text-xs font-medium h-10 flex items-center"
          style={{ color: "var(--color-text)" }}
        >
          Element
        </div>
        <div className="space-y-0.5">
          <ReadOnlyRow label="Tag" value={`<${jsxNode.name}>`} />
          <ReadOnlyRow label="ID" value={`${jsxNode.id}`} />
          {selection.rect && (
            <ReadOnlyRow
              label="Size"
              value={`${Math.round(selection.rect.width)} × ${Math.round(selection.rect.height)}`}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Spacing Section — replicates FrameSpecificControls padding pattern ──

function SpacingSection({
  tw,
  className,
  setClass,
}: {
  tw: ReturnType<typeof parseTailwindClasses>;
  className: string;
  setClass: (prefix: string, value: string | null) => void;
}) {
  const [showIndividualPadding, setShowIndividualPadding] = useState(false);
  const [showIndividualMargin, setShowIndividualMargin] = useState(false);

  const hasPaddingIndividual = !!(tw.spacing.paddingT || tw.spacing.paddingR || tw.spacing.paddingB || tw.spacing.paddingL);
  const hasMarginIndividual = !!(tw.spacing.marginT || tw.spacing.marginR || tw.spacing.marginB || tw.spacing.marginL);

  // Auto-expand if individual values exist
  useEffect(() => {
    if (hasPaddingIndividual) setShowIndividualPadding(true);
  }, [hasPaddingIndividual]);

  useEffect(() => {
    if (hasMarginIndividual) setShowIndividualMargin(true);
  }, [hasMarginIndividual]);

  return (
    <div className="pl-4 pr-2 pb-3">
      <div
        className="text-xs font-medium h-10 flex items-center"
        style={{ color: "var(--color-text)" }}
      >
        Spacing
      </div>

      {/* ─── Padding ─── */}
      {!showIndividualPadding ? (
        /* 2-value mode: Horizontal + Vertical + toggle button */
        <div className="grid grid-cols-[1fr_1fr_24px] gap-x-2 h-8 items-center">
          <PropertyInput
            label="Horizontal Padding"
            value={displayTwValue(tw.spacing.paddingX || tw.spacing.padding || "0")}
            onChange={(v) => setClass("px-", v && v !== "0" ? `px-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingIcon={<Icon24AlPaddingHorizontal className="text-secondary" />}
          />
          <PropertyInput
            label="Vertical Padding"
            value={displayTwValue(tw.spacing.paddingY || tw.spacing.padding || "0")}
            onChange={(v) => setClass("py-", v && v !== "0" ? `py-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingIcon={<Icon24AlPaddingVertical className="text-secondary" />}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowIndividualPadding(true)}
          >
            <Icon24AlPaddingSides />
          </Button>
        </div>
      ) : (
        /* 4-value mode: Individual padding for each side */
        <div className="grid grid-cols-[1fr_1fr_24px] grid-rows-[32px_32px] gap-x-2 items-center">
          <PropertyInput
            label="Left"
            value={displayTwValue(tw.spacing.paddingL || tw.spacing.paddingX || tw.spacing.padding || "0")}
            onChange={(v) => setClass("pl-", v && v !== "0" ? `pl-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingIcon={<Icon24AlPaddingLeft className="text-secondary" />}
          />
          <PropertyInput
            label="Top"
            value={displayTwValue(tw.spacing.paddingT || tw.spacing.paddingY || tw.spacing.padding || "0")}
            onChange={(v) => setClass("pt-", v && v !== "0" ? `pt-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingIcon={<Icon24AlPaddingTop className="text-secondary" />}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowIndividualPadding(false)}
            className="bg-selected hover:bg-selected-secondary"
          >
            <Icon24AlPaddingSides className="text-brand" />
          </Button>
          <PropertyInput
            label="Right"
            value={displayTwValue(tw.spacing.paddingR || tw.spacing.paddingX || tw.spacing.padding || "0")}
            onChange={(v) => setClass("pr-", v && v !== "0" ? `pr-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingIcon={<Icon24AlPaddingRight className="text-secondary" />}
          />
          <PropertyInput
            label="Bottom"
            value={displayTwValue(tw.spacing.paddingB || tw.spacing.paddingY || tw.spacing.padding || "0")}
            onChange={(v) => setClass("pb-", v && v !== "0" ? `pb-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingIcon={<Icon24AlPaddingBottom className="text-secondary" />}
          />
        </div>
      )}

      {/* ─── Margin ─── */}
      <div className="mt-1" />
      {!showIndividualMargin ? (
        /* 2-value mode: Horizontal + Vertical + toggle button */
        <div className="grid grid-cols-[1fr_1fr_24px] gap-x-2 h-8 items-center">
          <PropertyInput
            label="Horizontal Margin"
            value={displayTwValue(tw.spacing.marginX || tw.spacing.margin || "0")}
            onChange={(v) => setClass("mx-", v && v !== "0" ? `mx-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingLabel="H"
          />
          <PropertyInput
            label="Vertical Margin"
            value={displayTwValue(tw.spacing.marginY || tw.spacing.margin || "0")}
            onChange={(v) => setClass("my-", v && v !== "0" ? `my-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingLabel="V"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowIndividualMargin(true)}
          >
            <Icon24AlPaddingSides />
          </Button>
        </div>
      ) : (
        /* 4-value mode: Individual margin */
        <div className="grid grid-cols-[1fr_1fr_24px] grid-rows-[32px_32px] gap-x-2 items-center">
          <PropertyInput
            label="Left Margin"
            value={displayTwValue(tw.spacing.marginL || tw.spacing.marginX || tw.spacing.margin || "0")}
            onChange={(v) => setClass("ml-", v && v !== "0" ? `ml-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingLabel="L"
          />
          <PropertyInput
            label="Top Margin"
            value={displayTwValue(tw.spacing.marginT || tw.spacing.marginY || tw.spacing.margin || "0")}
            onChange={(v) => setClass("mt-", v && v !== "0" ? `mt-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingLabel="T"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowIndividualMargin(false)}
            className="bg-selected hover:bg-selected-secondary"
          >
            <Icon24AlPaddingSides className="text-brand" />
          </Button>
          <PropertyInput
            label="Right Margin"
            value={displayTwValue(tw.spacing.marginR || tw.spacing.marginX || tw.spacing.margin || "0")}
            onChange={(v) => setClass("mr-", v && v !== "0" ? `mr-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingLabel="R"
          />
          <PropertyInput
            label="Bottom Margin"
            value={displayTwValue(tw.spacing.marginB || tw.spacing.marginY || tw.spacing.margin || "0")}
            onChange={(v) => setClass("mb-", v && v !== "0" ? `mb-${toTwValue(v, "spacing")}` : null)}
            type="text"
            leadingLabel="B"
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PROPS TAB — Raw component properties (original behavior)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// CONTENT & PROPS SECTION — Text content + Component props (no className)
// ═══════════════════════════════════════════════════════════════════════

function ContentAndPropsSection({
  selection,
  jsxNode,
  componentName,
  onPropChange,
  onTextChange,
}: {
  selection: InspectorSelection;
  jsxNode: JsxNode;
  componentName: string;
  onPropChange: (nodeId: number, propName: string, newValue: string) => void;
  onTextChange: (nodeId: number, newText: string) => void;
}) {
  const componentProps = jsxNode.props.filter(
    (p) => p.name !== "className" && p.name !== "key" && !p.name.startsWith("data-make-")
  );

  const hasContent = !!selection.textContent;
  const hasProps = componentProps.length > 0;

  if (!hasContent && !hasProps) return null;

  return (
    <>
      {/* Text content — always-editable textarea */}
      {hasContent && (
        <div className="pl-4 pr-3 py-3">
          <ContentTextarea
            value={selection.textContent}
            onCommit={(val) => onTextChange(selection.nodeId, val)}
          />
        </div>
      )}
      {hasContent && hasProps && (
        <div className="my-0" style={{ borderTop: "1px solid var(--color-border)" }} />
      )}

      {/* Component props (excluding className — handled visually in StyleTab) */}
      {hasProps && (
        <div className="pl-4 pr-10 pb-3">
          <div
            className="text-xs font-medium h-10 flex items-center"
            style={{ color: "var(--color-text)" }}
          >
            Props
          </div>
          {componentProps.map((prop) => {
            const knownValues = getKnownValues(componentName, prop.name);
            if (knownValues) {
              const cleanValue = prop.value.replace(/^["']|["']$/g, "");
              return (
                <div key={prop.name} className="grid grid-cols-[72px_1fr] gap-2 h-8 items-center">
                  <span
                    className="text-[11px] truncate"
                    style={{ color: "var(--color-text)" }}
                  >
                    {prop.name}
                  </span>
                  <Select
                    value={cleanValue}
                    onValueChange={(val) => onPropChange(selection.nodeId, prop.name, val)}
                  >
                    <SelectTrigger className="h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="item-aligned"
                    >
                      {knownValues.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return (
              <div key={prop.name} className="grid grid-cols-[72px_1fr] gap-2 h-8 items-center">
                <span
                  className="text-[11px] truncate"
                  style={{ color: "var(--color-text)" }}
                >
                  {prop.name}
                </span>
                <PropertyInput
                  label={prop.name}
                  value={prop.value}
                  onChange={(val) => onPropChange(selection.nodeId, prop.name, String(val ?? ""))}
                  type="text"
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center h-6 gap-2">
      <span
        className="text-[11px] w-12 flex-shrink-0"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </span>
      <span
        className="text-[11px] font-mono truncate"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── ContentTextarea: always-editable text area for content ──────────

function ContentTextarea({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleCommit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCommit();
        textareaRef.current?.blur();
      }
      if (e.key === "Escape") {
        setDraft(value);
        textareaRef.current?.blur();
      }
      e.stopPropagation();
    },
    [handleCommit, value]
  );

  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      className="w-full min-w-0 rounded-[5px] px-1.5 py-1 text-[11px] outline-none border border-transparent hover:border-default focus:border-selected bg-secondary"
      style={{
        color: "var(--color-text)",
        resize: "vertical",
        minHeight: "48px",
        lineHeight: "1.4",
      }}
      rows={2}
    />
  );
}

// ─── ColorSwatch: clickable swatch that opens a color picker ─────────

function ColorSwatch({
  value,
  onChange,
  title = "Color",
}: {
  /** Tailwind color value, e.g. "blue-500", "[#3b82f6]", "primary" */
  value: string;
  /** Called with hex string when user picks a new color */
  onChange: (hex: string) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const hex = twColorToHex(value);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // Position to the left of the swatch with some gap
    setPos({ x: rect.left - 248, y: Math.min(rect.top, window.innerHeight - 340) });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        className="w-4 h-4 rounded-[3px] flex-shrink-0 cursor-pointer outline outline-1 outline-[var(--color-border)] outline-offset-[-1px] hover:outline-2 transition-[outline-width]"
        style={{ backgroundColor: hex }}
        title={`Edit ${title.toLowerCase()}`}
      />
      <ColorPopover
        isOpen={open}
        onClose={() => setOpen(false)}
        position={pos}
        color={hex}
        onColorChange={onChange}
        showOpacity={false}
        title={title}
      />
    </>
  );
}

/** Convert Tailwind color value → hex for the color picker */
function twColorToHex(value: string): string {
  // Arbitrary value: [#3b82f6] → #3b82f6
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1);
    if (/^#[0-9a-fA-F]{3,8}$/.test(inner)) return inner;
  }
  // Named color → lookup
  const css = tailwindColorToCSS(value);
  // If it's a valid hex, return directly
  if (css.startsWith("#")) return css;
  // CSS variables or other values → default gray
  return "#d4d4d8";
}

/** Best-effort Tailwind color name → CSS color */
function tailwindColorToCSS(tw: string): string {
  const map: Record<string, string> = {
    "white": "#fff",
    "black": "#000",
    "transparent": "transparent",
    "current": "currentColor",
    "gray-50": "#f9fafb", "gray-100": "#f3f4f6", "gray-200": "#e5e7eb", "gray-300": "#d1d5db",
    "gray-400": "#9ca3af", "gray-500": "#6b7280", "gray-600": "#4b5563", "gray-700": "#374151",
    "gray-800": "#1f2937", "gray-900": "#111827", "gray-950": "#030712",
    "slate-50": "#f8fafc", "slate-100": "#f1f5f9", "slate-200": "#e2e8f0", "slate-300": "#cbd5e1",
    "slate-400": "#94a3b8", "slate-500": "#64748b", "slate-600": "#475569", "slate-700": "#334155",
    "slate-800": "#1e293b", "slate-900": "#0f172a", "slate-950": "#020617",
    "zinc-50": "#fafafa", "zinc-100": "#f4f4f5", "zinc-200": "#e4e4e7", "zinc-300": "#d4d4d8",
    "zinc-400": "#a1a1aa", "zinc-500": "#71717a", "zinc-600": "#52525b", "zinc-700": "#3f3f46",
    "zinc-800": "#27272a", "zinc-900": "#18181b", "zinc-950": "#09090b",
    "blue-50": "#eff6ff", "blue-100": "#dbeafe", "blue-200": "#bfdbfe", "blue-300": "#93c5fd",
    "blue-400": "#60a5fa", "blue-500": "#3b82f6", "blue-600": "#2563eb", "blue-700": "#1d4ed8",
    "blue-800": "#1e40af", "blue-900": "#1e3a8a", "blue-950": "#172554",
    "red-50": "#fef2f2", "red-100": "#fee2e2", "red-200": "#fecaca", "red-300": "#fca5a5",
    "red-400": "#f87171", "red-500": "#ef4444", "red-600": "#dc2626", "red-700": "#b91c1c",
    "red-800": "#991b1b", "red-900": "#7f1d1d",
    "green-50": "#f0fdf4", "green-100": "#dcfce7", "green-200": "#bbf7d0", "green-300": "#86efac",
    "green-400": "#4ade80", "green-500": "#22c55e", "green-600": "#16a34a", "green-700": "#15803d",
    "green-800": "#166534", "green-900": "#14532d",
    "yellow-50": "#fefce8", "yellow-100": "#fef9c3", "yellow-200": "#fef08a", "yellow-300": "#fde047",
    "yellow-400": "#facc15", "yellow-500": "#eab308", "yellow-600": "#ca8a04",
    "purple-50": "#faf5ff", "purple-100": "#f3e8ff", "purple-200": "#e9d5ff", "purple-300": "#d8b4fe",
    "purple-400": "#c084fc", "purple-500": "#a855f7", "purple-600": "#9333ea", "purple-700": "#7e22ce",
    "orange-50": "#fff7ed", "orange-100": "#ffedd5", "orange-200": "#fed7aa", "orange-300": "#fdba74",
    "orange-400": "#fb923c", "orange-500": "#f97316", "orange-600": "#ea580c",
    "primary": "var(--primary)", "secondary": "var(--secondary)", "accent": "var(--accent)",
    "muted": "var(--muted)", "destructive": "var(--destructive)", "card": "var(--card)",
    "popover": "var(--popover)", "background": "var(--background)", "foreground": "var(--foreground)",
    "primary-foreground": "var(--primary-foreground)", "secondary-foreground": "var(--secondary-foreground)",
    "muted-foreground": "var(--muted-foreground)", "accent-foreground": "var(--accent-foreground)",
    "destructive-foreground": "var(--destructive-foreground)",
  };
  return map[tw] || "#d4d4d8";
}

// ─── InlinePropertyRow (used in Props tab) ───────────────────────────

function InlinePropertyRow({
  label,
  value,
  onCommit,
  multiline,
  monospace,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  monospace?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleCommit = useCallback(() => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCommit();
      }
      if (e.key === "Escape") {
        setDraft(value);
        setEditing(false);
      }
      e.stopPropagation();
    },
    [handleCommit, value]
  );

  if (editing) {
    const InputTag = multiline ? "textarea" : "input";
    return (
      <div className="py-0.5">
        <div className="flex items-start gap-2">
          <span
            className="text-[11px] w-12 flex-shrink-0 pt-1"
            style={{ color: "var(--color-text)" }}
          >
            {label}
          </span>
          <InputTag
            ref={inputRef as any}
            value={draft}
            onChange={(e: any) => setDraft(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown as any}
            className="flex-1 min-w-0 rounded-[5px] px-1.5 py-0.5 text-[11px] outline-none border border-selected bg-secondary"
            style={{
              fontFamily: monospace ? "'Roboto Mono', monospace" : undefined,
              color: "var(--color-text)",
              resize: multiline ? "vertical" : "none",
              minHeight: multiline ? "48px" : undefined,
              lineHeight: "1.4",
            }}
            rows={multiline ? 2 : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="py-0.5 cursor-pointer rounded-sm hover:bg-[var(--color-bg-secondary)]"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-start gap-2">
        <span
          className="text-[11px] w-12 flex-shrink-0 leading-6"
          style={{ color: "var(--color-text)" }}
        >
          {label}
        </span>
        <span
          className="text-[11px] truncate leading-6 min-w-0 flex-1"
          style={{
            fontFamily: monospace ? "'Roboto Mono', monospace" : undefined,
            color: "var(--color-text)",
          }}
        >
          {value || <span style={{ color: "var(--color-text-quaternary)" }}>—</span>}
        </span>
      </div>
    </div>
  );
}


"use client";

import { ImageAdjustments, ImageFill, SolidFill } from "@/types/canvas";
import { Icon24BlendmodeActiveSmall } from "../icons/icon-24-blendmode-active-small";
import { Icon24BlendmodeSmall } from "../icons/icon-24-blendmode-small";
import { Icon24CloseSmall } from "../icons/icon-24-close-small";
import { Icon24FillSolidSmall } from "../icons/icon-24-fill-solid-small";
import { Icon24ImageSmall } from "../icons/icon-24-image-small";
import ColorPickerContent from "./ColorPickerContent";
import {
  CustomSelect,
  CustomSelectContent,
  CustomSelectItem,
  CustomSelectSeparator,
} from "./CustomSelect";
import ImagePickerContent from "./ImagePickerContent";
import { usePropertyPopover } from "./PropertyPopover";
import { Button } from "./button";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

export interface FillPopoverContentProps {
  activeTab: "solid" | "image";
  onTabChange: (tab: "solid" | "image") => void;

  // Fill data
  activeFill?: SolidFill | ImageFill;

  // Popover control
  onClose?: () => void;

  // Callbacks
  onBlendModeChange?: (blendMode: string) => void;

  // Solid fill callbacks
  onColorChange?: (color: string) => void;
  onRgbaChange?: (rgba: { r: number; g: number; b: number; a: number }) => void;
  onColorPickerStart?: () => void;
  onColorPickerEnd?: () => void;

  // Image fill callbacks
  onImageFitChange?: (fit: "fill" | "fit" | "crop" | "tile") => void;
  onImageRotation?: () => void;
  onImageUpload?: () => void;
  onImageAdjustmentChange?: (
    adjustment: keyof ImageAdjustments,
    value: number
  ) => void;
  onImageTileScaleChange?: (scale: number) => void;
}

export default function FillPopoverContent({
  activeTab,
  onTabChange,
  activeFill,
  onClose,
  onBlendModeChange,
  onColorChange,
  onRgbaChange,
  onColorPickerStart,
  onColorPickerEnd,
  onImageFitChange,
  onImageRotation,
  onImageUpload,
  onImageAdjustmentChange,
  onImageTileScaleChange,
}: FillPopoverContentProps) {
  const { onSelectOpenChange } = usePropertyPopover();

  return (
    <>
      {/* Header with tabs and close button */}
      <div
        className="flex items-center justify-between pr-2 pl-1 py-2 border-b popover-header"
        data-draggable="true"
      >
        <Tabs defaultValue="custom">
          <TabsList>
            <TabsTrigger value="custom">Custom</TabsTrigger>
            <TabsTrigger value="libraries">Libraries</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-[5px] hover:bg-secondary flex items-center justify-center"
            title="Close"
          >
            <Icon24CloseSmall />
          </button>
        )}
      </div>

      <div
        className="flex items-center justify-between mb-4 p-2 border-b property-section-header"
        data-draggable="true"
      >
        {/* Fill Type Tabs */}
        <div className="flex gap-1 justify-between w-full">
          <div className="flex gap-1">
            <button
              onClick={() => onTabChange("solid")}
              className={`text-xs rounded-[5px] hover:bg-secondary ${
                activeTab === "solid" ? "bg-secondary" : "bg-default"
              }`}
            >
              <Icon24FillSolidSmall />
            </button>

            {/* Only show image tab if image callbacks are provided */}
            {onImageFitChange &&
              onImageRotation &&
              onImageUpload &&
              onImageAdjustmentChange && (
                <button
                  onClick={() => onTabChange("image")}
                  className={`text-xs rounded-[5px] hover:bg-secondary ${
                    activeTab === "image" ? "bg-secondary" : "bg-default"
                  }`}
                >
                  <Icon24ImageSmall />
                </button>
              )}
          </div>

          {/* Blend Mode Select - only show if we have image callbacks (indicating this is for object fills, not canvas background) */}
          {(onImageFitChange || activeFill?.blendMode) && (
            <CustomSelect
              value={activeFill?.blendMode || "pass-through"}
              onValueChange={onBlendModeChange || (() => {})}
              onOpenChange={onSelectOpenChange}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-xs hover:bg-secondary rounded-[5px] inline-flex items-center justify-center"
                >
                  {activeFill?.blendMode &&
                  activeFill.blendMode !== "normal" ? (
                    <Icon24BlendmodeActiveSmall />
                  ) : (
                    <Icon24BlendmodeSmall />
                  )}
                </Button>
              }
            >
              <CustomSelectContent>
                <CustomSelectItem value="normal">Normal</CustomSelectItem>
                <CustomSelectSeparator />
                <CustomSelectItem value="darken">Darken</CustomSelectItem>
                <CustomSelectItem value="multiply">Multiply</CustomSelectItem>
                <CustomSelectItem value="plus-darker">
                  Plus darker
                </CustomSelectItem>
                <CustomSelectItem value="color-burn">
                  Color Burn
                </CustomSelectItem>
                <CustomSelectSeparator />
                <CustomSelectItem value="lighten">Lighten</CustomSelectItem>
                <CustomSelectItem value="screen">Screen</CustomSelectItem>
                <CustomSelectItem value="plus-lighter">
                  Plus lighter
                </CustomSelectItem>
                <CustomSelectItem value="color-dodge">
                  Color dodge
                </CustomSelectItem>
                <CustomSelectSeparator />
                <CustomSelectItem value="overlay">Overlay</CustomSelectItem>
                <CustomSelectItem value="soft-light">
                  Soft Light
                </CustomSelectItem>
                <CustomSelectItem value="hard-light">
                  Hard Light
                </CustomSelectItem>
                <CustomSelectSeparator />
                <CustomSelectItem value="difference">
                  Difference
                </CustomSelectItem>
                <CustomSelectItem value="exclusion">Exclusion</CustomSelectItem>
                <CustomSelectSeparator />
                <CustomSelectItem value="hue">Hue</CustomSelectItem>
                <CustomSelectItem value="saturation">
                  Saturation
                </CustomSelectItem>
                <CustomSelectItem value="color">Color</CustomSelectItem>
                <CustomSelectItem value="luminosity">
                  Luminosity
                </CustomSelectItem>
              </CustomSelectContent>
            </CustomSelect>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "solid" && activeFill?.type === "solid" && (
        <ColorPickerContent
          color={(activeFill as SolidFill).color || "#FFFFFF"}
          opacity={activeFill.opacity || 1}
          onColorChange={onColorChange}
          onRgbaChange={onRgbaChange}
          onColorPickerStart={onColorPickerStart}
          onColorPickerEnd={onColorPickerEnd}
          showOpacity={true}
        />
      )}

      {activeTab === "image" &&
        activeFill?.type === "image" &&
        onImageFitChange &&
        onImageRotation &&
        onImageUpload &&
        onImageAdjustmentChange && (
          <ImagePickerContent
            imageFill={activeFill as ImageFill}
            onFitChange={onImageFitChange}
            onRotation={onImageRotation}
            onImageUpload={onImageUpload}
            onAdjustmentChange={onImageAdjustmentChange}
            onTileScaleChange={onImageTileScaleChange}
            onSelectOpenChange={onSelectOpenChange}
            isSelectOpen={false} // Managed by PropertyPopover context
          />
        )}
    </>
  );
}

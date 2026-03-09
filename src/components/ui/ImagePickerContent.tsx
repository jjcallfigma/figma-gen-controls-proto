"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { createCheckerboardPattern, isEmptyImageUrl } from "@/core/utils/fills";
import { ImageAdjustments, ImageFill } from "@/types/canvas";
import { Icon24Rotate } from "../icons/icon-24-rotate";

interface ImagePickerContentProps {
  imageFill: ImageFill;
  onFitChange: (fit: "fill" | "fit" | "crop" | "tile") => void;
  onRotation: () => void;
  onImageUpload: () => void;
  onAdjustmentChange: (
    adjustment: keyof ImageAdjustments,
    value: number
  ) => void;
  onTileScaleChange?: (scale: number) => void;

  onSelectOpenChange?: (open: boolean) => void;
  isSelectOpen?: boolean;
}

export default function ImagePickerContent({
  imageFill,
  onFitChange,
  onRotation,
  onImageUpload,
  onAdjustmentChange,
  onTileScaleChange,
  onSelectOpenChange,
  isSelectOpen,
}: ImagePickerContentProps) {
  const imageAdjustments = imageFill.adjustments || {};
  const isPlaceholder = isEmptyImageUrl(imageFill.imageUrl);

  return (
    <div className="space-y-4">
      <div className="space-y-3 pl-4 pr-2">
        {/* Fit/Fill options */}
        <div className="flex gap-2 items-end justify-between">
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <div onClick={(e) => e.stopPropagation()}>
                <Select
                  value={imageFill.fit || "fill"}
                  onValueChange={onFitChange}
                  onOpenChange={(open) => {
                    if (onSelectOpenChange) onSelectOpenChange(open);
                  }}
                >
                  <SelectTrigger
                    className="text-xs w-[100px]"
                    onMouseDown={() => {
                      if (onSelectOpenChange) onSelectOpenChange(true);
                    }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="item-aligned">
                    <SelectItem value="fill">Fill</SelectItem>
                    <SelectItem value="fit">Fit</SelectItem>
                    <SelectItem value="crop">Crop</SelectItem>
                    <SelectItem value="tile">Tile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tile Scale Input - only show for tile mode */}
            {imageFill.fit === "tile" && onTileScaleChange && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={imageFill.tileScale || 100}
                    onChange={(e) =>
                      onTileScaleChange(parseInt(e.target.value) || 100)
                    }
                    className="w-12 h-6 text-xs bg-transparent border border-[--color-bordertranslucent] rounded px-1 text-center"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rotate 90° Button */}
          <Button
            onClick={onRotation}
            variant="icon"
            size="icon"
            className=""
            title="Rotate 90°"
          >
            <Icon24Rotate />
          </Button>
        </div>
      </div>

      {/* Image Upload */}
      <div className="space-y-3 px-4">
        {/* Image Preview */}
        {isPlaceholder ? (
          // Show checkerboard pattern for placeholder
          <div
            className="group relative w-full h-[208px] rounded-[5px] outline outline-1 outline-[--color-bordertranslucent] outline-offset-[-1px] overflow-hidden"
            style={{
              backgroundImage: `url('${createCheckerboardPattern()}')`,
              backgroundSize: "26px 26px",
              backgroundRepeat: "repeat",
              backgroundPosition: "0 0",
            }}
            onClick={onImageUpload}
          >
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <Button>Upload from computer</Button>
            </div>
          </div>
        ) : (
          // Show actual image
          <div
            className="group relative w-full h-[208px] rounded-[5px] outline outline-1 outline-[--color-bordertranslucent] outline-offset-[-1px] overflow-hidden"
            style={{
              backgroundImage: `url('${createCheckerboardPattern()}')`,
              backgroundSize: "16px 16px",
              backgroundRepeat: "repeat",
              backgroundPosition: "0 0",
            }}
            onClick={onImageUpload}
          >
            <img
              src={imageFill.imageUrl}
              alt="Fill preview"
              className="w-full h-full object-contain"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <Button>Upload from computer</Button>
            </div>
          </div>
        )}
      </div>

      {/* Image Adjustments */}
      {imageFill.imageUrl && (
        <div className="space-y-4 pb-4 px-4">
          {/* Exposure */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Exposure</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.exposure || 0]}
              onValueChange={(values) =>
                onAdjustmentChange("exposure", values[0])
              }
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>

          {/* Contrast */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Contrast</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.contrast || 0]}
              onValueChange={(values) =>
                onAdjustmentChange("contrast", values[0])
              }
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>

          {/* Saturation */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Saturation</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.saturation || 0]}
              onValueChange={(values) =>
                onAdjustmentChange("saturation", values[0])
              }
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>

          {/* Temperature */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Temperature</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.temperature || 0]}
              onValueChange={(values) =>
                onAdjustmentChange("temperature", values[0])
              }
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>

          {/* Tint */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Tint</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.tint || 0]}
              onValueChange={(values) => onAdjustmentChange("tint", values[0])}
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>

          {/* Highlights */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Highlights</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.highlights || 0]}
              onValueChange={(values) =>
                onAdjustmentChange("highlights", values[0])
              }
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>

          {/* Shadows */}
          <div className="flex justify-between">
            <div className="flex justify-between text-secondary text-xs">
              <span>Shadows</span>
            </div>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[imageAdjustments.shadows || 0]}
              onValueChange={(values) =>
                onAdjustmentChange("shadows", values[0])
              }
              defaultToMiddle={true}
              className="w-[120px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

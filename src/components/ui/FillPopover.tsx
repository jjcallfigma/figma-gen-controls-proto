interface FillPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  enabledFillTypes: string[];
  activeFillType: string;
  onFillTypeChange: (type: any) => void;
  solidFill?: any;
  imageFill?: any;
  blendMode: string;
  onBlendModeChange: (blendMode: string) => void;
  onColorChange?: (color: string) => void;
  onRgbaChange?: (rgba: any) => void;
  onImageFitChange?: (fit: any) => void;
  onImageRotation?: () => void;
  onImageUpload?: () => void;
  onImageAdjustmentChange?: (adjustment: any, value: number) => void;
  isSelectOpen?: boolean;
  onSelectOpenChange?: (open: boolean) => void;
}

export default function FillPopover({ isOpen }: FillPopoverProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed z-50 bg-default rounded-[13px] shadow-500">
      <div>Fill Popover Placeholder</div>
    </div>
  );
}

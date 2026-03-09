import React from "react";
import { RgbaColorPicker } from "react-colorful";

interface StyledColorPickerProps {
  color: { r: number; g: number; b: number; a: number };
  onChange: (color: { r: number; g: number; b: number; a: number }) => void;
  style?: React.CSSProperties;
  pointerSize?: "small" | "medium" | "large";
}

export default function StyledColorPicker({
  color,
  onChange,
  style,
  pointerSize = "small",
}: StyledColorPickerProps) {
  const getPointerClass = () => {
    switch (pointerSize) {
      case "small":
        return "react-colorful--small";
      case "large":
        return "react-colorful--large";
      default:
        return "";
    }
  };

  return (
    <div className={`styled-color-picker ${getPointerClass()}`}>
      <RgbaColorPicker color={color} onChange={onChange} style={style} />
      <style jsx>{`
        .styled-color-picker.react-colorful--small .react-colorful__pointer {
          width: 10px !important;
          height: 10px !important;
        }

        .styled-color-picker.react-colorful--small
          .react-colorful__saturation-pointer {
          width: 10px !important;
          height: 10px !important;
          border: 2px solid white !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
        }

        .styled-color-picker.react-colorful--small .react-colorful__hue-pointer,
        .styled-color-picker.react-colorful--small
          .react-colorful__alpha-pointer {
          width: 6px !important;
          height: 100% !important;
          border-radius: 3px !important;
        }

        .styled-color-picker.react-colorful--large .react-colorful__pointer {
          width: 18px !important;
          height: 18px !important;
        }

        .styled-color-picker.react-colorful--large
          .react-colorful__saturation-pointer {
          width: 18px !important;
          height: 18px !important;
        }

        .styled-color-picker.react-colorful--large .react-colorful__hue-pointer,
        .styled-color-picker.react-colorful--large
          .react-colorful__alpha-pointer {
          width: 12px !important;
          height: 100% !important;
        }
      `}</style>
    </div>
  );
}

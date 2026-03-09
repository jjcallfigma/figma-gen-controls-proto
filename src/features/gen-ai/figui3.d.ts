import type { DetailedHTMLProps, HTMLAttributes, ReactNode, Ref } from "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type FigAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
      value?: string | number;
      min?: string | number;
      max?: string | number;
      step?: string | number;
      text?: string;
      precision?: string | number;
      transform?: string | number;
      checked?: boolean | string;
      disabled?: boolean | string;
      placeholder?: string;
      units?: string;
      picker?: string;
      dropdown?: string;
      fields?: string;
      coordinates?: string;
      "aspect-ratio"?: string;
      direction?: string;
      label?: string;
      name?: string;
      selected?: boolean | string;
      ref?: Ref<HTMLElement>;
    };

    type FigAttrsC = FigAttrs & { children?: ReactNode };

    interface IntrinsicElements {
      "fig-slider": FigAttrs;
      "fig-switch": FigAttrs;
      "fig-checkbox": FigAttrs;
      "fig-radio": FigAttrs;
      "fig-dropdown": FigAttrsC;
      "fig-input-text": FigAttrs;
      "fig-input-number": FigAttrs;
      "fig-input-color": FigAttrs;
      "fig-input-fill": FigAttrs;
      "fig-input-angle": FigAttrs;
      "fig-input-joystick": FigAttrs;
      "fig-segmented-control": FigAttrsC;
      "fig-segment": FigAttrsC;
      "fig-easing-curve": FigAttrs;
      "fig-3d-rotate": FigAttrs;
      "fig-field": FigAttrsC;
      "fig-button": FigAttrsC;
      "fig-tabs": FigAttrsC;
      "fig-tab": FigAttrsC;
      "fig-tooltip": FigAttrsC;
      "fig-chit": FigAttrs;
      "fig-spinner": FigAttrs;
      "fig-shimmer": FigAttrs;
      "fig-layer": FigAttrsC;
      "fig-header": FigAttrsC;
      "fig-content": FigAttrsC;
      "fig-popover": FigAttrsC;
      "fig-fill-picker": FigAttrs;
      "fig-combo-input": FigAttrsC;
      "fig-image": FigAttrs;
      "fig-avatar": FigAttrs;
      "fig-toast": FigAttrsC;
    }
  }
}

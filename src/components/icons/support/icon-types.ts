import type { SVGProps } from "react";

export interface SVGIconProps extends SVGProps<SVGSVGElement> {
  /**
   * The size of the icon. Defaults to the icon's natural size.
   */
  size?: number | string;
}

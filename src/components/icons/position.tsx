import { memo } from "react";

import type { SVGIconProps } from "./support/icon-types";

/**
 * Simple position/move icon for property labels
 */
export const Icon16Position = memo(function Icon16Position(
  props: SVGIconProps
) {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16" {...props}>
      <path
        fill="var(--color-icon)"
        fillRule="evenodd"
        d="M8 2a.5.5 0 0 1 .5.5V7h4.5a.5.5 0 0 1 0 1H8.5v4.5a.5.5 0 0 1-1 0V8H3a.5.5 0 0 1 0-1h4.5V2.5A.5.5 0 0 1 8 2z"
        clipRule="evenodd"
      />
    </svg>
  );
});

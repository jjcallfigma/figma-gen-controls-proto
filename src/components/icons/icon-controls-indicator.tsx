import { memo } from "react";

import type { SVGIconProps } from "./support/icon-types";

export const IconControlsIndicator = memo(function IconControlsIndicator(props: SVGIconProps) {
  return (
    <svg width="6" height="11" fill="none" viewBox="0 0 6 11" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 0a.5.5 0 0 1 .5.5v2c0 .014-.004.027-.005.041A3.001 3.001 0 0 1 6 5.5a3.001 3.001 0 0 1-2.505 2.958c.001.014.005.028.005.042v2a.5.5 0 0 1-1 0v-2c0-.014.003-.028.004-.042A3.001 3.001 0 0 1 0 5.5a3.001 3.001 0 0 1 2.504-2.959A.506.506 0 0 1 2.5 2.5v-2A.5.5 0 0 1 3 0m0 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4"
        fill="currentColor"
      />
    </svg>
  );
});

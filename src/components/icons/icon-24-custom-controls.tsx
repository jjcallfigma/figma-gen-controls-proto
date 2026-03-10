import { memo } from "react";

import type { SVGIconProps } from "./support/icon-types";

export const Icon24CustomControls = memo(function Icon24CustomControls(props: SVGIconProps) {
  return (
    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        fill="var(--color-icon)"
        d="M8.5 18a.5.5 0 0 0 .5-.5v-1.551A2.5 2.5 0 0 0 11 13.5a2.5 2.5 0 0 0-2-2.45V6.5a.5.5 0 0 0-1 0v4.55A2.5 2.5 0 0 0 6 13.5a2.5 2.5 0 0 0 2 2.449V17.5a.5.5 0 0 0 .5.5m7 0a.5.5 0 0 0 .5-.5v-4.55a2.5 2.5 0 0 0 2-2.45 2.5 2.5 0 0 0-2-2.449V6.5a.5.5 0 0 0-1 0v2.051A2.5 2.5 0 0 0 13 10.5a2.5 2.5 0 0 0 2 2.45V17.5a.5.5 0 0 0 .5.5m0-6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m-7 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3"
      />
    </svg>
  );
});

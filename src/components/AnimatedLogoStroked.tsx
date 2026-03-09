/**
 * AnimatedLogoStroked – Figma logo loading animation (stroked variant).
 * Used as a loading indicator for Make-to-Design generation overlay.
 */

import * as React from "react";
import "./animated-logo-stroked.css";

export type AnimatedLogoStrokedVariant = "default" | "light" | "dark";

export interface AnimatedLogoStrokedProps {
  variant?: AnimatedLogoStrokedVariant;
  progressPaused?: boolean;
  className?: string;
}

const ROOT = "animatedLogoStroked";
const STROKED_LOGO = "strokedLogo";
const LOGO_TOP = "logoTop";
const LOGO_MIDDLE = "logoMiddle";
const LOGO_BOTTOM = "logoBottom";
const STROKED_ELEMENT = "strokedElement";
const PILL_LEFT = "pillLeft";
const PILL_CENTER = "pillCenter";
const PILL_RIGHT = "pillRight";
const LINE_CONTAINER = "lineContainer";
const MIDDLE_LINE = "middleLine";
const PETAL = "petal";
const CIRCLE = "circle";
const DRIP = "drip";

function cn(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function AnimatedLogoStroked(props: AnimatedLogoStrokedProps) {
  const { variant = "default", progressPaused, className } = props;

  const rootClassName = cn(
    ROOT,
    variant === "light" && `${ROOT}--light`,
    variant === "dark" && `${ROOT}--dark`,
    progressPaused && `${ROOT}--fadeIn`,
    className,
  );

  return (
    <div className={rootClassName}>
      <div className={STROKED_LOGO}>
        <div className={LOGO_TOP}>
          <div className={`${PILL_LEFT} ${STROKED_ELEMENT}`} />
          <div className={`${PILL_CENTER} ${STROKED_ELEMENT}`} />
          <div className={`${PILL_RIGHT} ${STROKED_ELEMENT}`} />
          <div className={LINE_CONTAINER}>
            <div className={`${MIDDLE_LINE} ${STROKED_ELEMENT}`} />
          </div>
        </div>
        <div className={LOGO_MIDDLE}>
          <div className={`${PETAL} ${STROKED_ELEMENT}`} />
          <div className={`${CIRCLE} ${STROKED_ELEMENT}`} />
        </div>
        <div className={LOGO_BOTTOM}>
          <div className={`${DRIP} ${STROKED_ELEMENT}`} />
          <div />
        </div>
      </div>
    </div>
  );
}

// Mock for @fpl/tokens module
declare module "@fpl/tokens" {
  import { ReactNode } from "react";

  export interface ColorThemeProps {
    brand?: string;
    children: ReactNode;
  }

  export function ColorTheme(props: ColorThemeProps): JSX.Element;
}

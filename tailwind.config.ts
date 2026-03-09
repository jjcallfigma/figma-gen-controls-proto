import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      backgroundColor: {
        // Core semantic colors
        default: "var(--color-bg)",
        selected: "var(--color-bg-selected)",
        brand: "var(--color-bg-brand)",
        component: "var(--color-bg-component)",
        danger: "var(--color-bg-danger)",
        success: "var(--color-bg-success)",
        warning: "var(--color-bg-warning)",
        assistive: "var(--color-bg-assistive)",
        design: "var(--color-bg-design)",
        disabled: "var(--color-bg-disabled)",
        secondary: "var(--color-bg-secondary)",
        tertiary: "var(--color-bg-tertiary)",
        hover: "var(--color-bg-hover)",
        pressed: "var(--color-bg-pressed)",
        info: "var(--color-bg-info)",
        inverse: "var(--color-bg-inverse)",
        elevated: "var(--color-bg-elevated)",

        // Application/context-specific colors
        figjam: "var(--color-bg-figjam)",
        handoff: "var(--color-bg-handoff)",
        measure: "var(--color-bg-measure)",
        menu: "var(--color-bg-menu)",
        toolbar: "var(--color-bg-toolbar)",
        tooltip: "var(--color-bg-tooltip)",
        fs: "var(--color-bg-fs)",
        onselected: "var(--color-bg-onselected)",

        // Desktop variants
        "desktop-backgrounded": "var(--color-bg-desktop-backgrounded)",
        "desktop-foreground": "var(--color-bg-desktop-foreground)",
        "desktop-fullscreen": "var(--color-bg-desktop-fullscreen)",

        // State variants (hover, pressed, etc.)
        "selected-hover": "var(--color-bg-selected-hover)",
        "selected-pressed": "var(--color-bg-selected-pressed)",
        "selected-secondary": "var(--color-bg-selected-secondary)",
        "selected-tertiary": "var(--color-bg-selected-tertiary)",
        "selected-strong": "var(--color-bg-selected-strong)",

        "brand-hover": "var(--color-bg-brand-hover)",
        "brand-pressed": "var(--color-bg-brand-pressed)",
        "brand-secondary": "var(--color-bg-brand-secondary)",
        "brand-tertiary": "var(--color-bg-brand-tertiary)",

        "component-hover": "var(--color-bg-component-hover)",
        "component-pressed": "var(--color-bg-component-pressed)",
        "component-secondary": "var(--color-bg-component-secondary)",
        "component-tertiary": "var(--color-bg-component-tertiary)",
        "component-tertiary-hover": "var(--color-bg-component-tertiary-hover)",

        "danger-hover": "var(--color-bg-danger-hover)",
        "danger-pressed": "var(--color-bg-danger-pressed)",
        "danger-secondary": "var(--color-bg-danger-secondary)",
        "danger-tertiary": "var(--color-bg-danger-tertiary)",

        "success-hover": "var(--color-bg-success-hover)",
        "success-pressed": "var(--color-bg-success-pressed)",
        "success-secondary": "var(--color-bg-success-secondary)",
        "success-tertiary": "var(--color-bg-success-tertiary)",

        "warning-hover": "var(--color-bg-warning-hover)",
        "warning-pressed": "var(--color-bg-warning-pressed)",
        "warning-secondary": "var(--color-bg-warning-secondary)",
        "warning-tertiary": "var(--color-bg-warning-tertiary)",

        "assistive-hover": "var(--color-bg-assistive-hover)",
        "assistive-pressed": "var(--color-bg-assistive-pressed)",
        "assistive-secondary": "var(--color-bg-assistive-secondary)",
        "assistive-tertiary": "var(--color-bg-assistive-tertiary)",

        "design-hover": "var(--color-bg-design-hover)",
        "design-pressed": "var(--color-bg-design-pressed)",
        "design-secondary": "var(--color-bg-design-secondary)",
        "design-tertiary": "var(--color-bg-design-tertiary)",

        "disabled-secondary": "var(--color-bg-disabled-secondary)",
        "secondary-hover": "var(--color-bg-secondary-hover)",
        "secondary-pressed": "var(--color-bg-secondary-pressed)",
        "elevated-hover": "var(--color-bg-elevated-hover)",
        "strong-hover": "var(--color-bg-strong-hover)",
        "strong-pressed": "var(--color-bg-strong-pressed)",

        "onselected-hover": "var(--color-bg-onselected-hover)",
        "onselected-pressed": "var(--color-bg-onselected-pressed)",

        "transparent-hover": "var(--color-bg-transparent-hover)",
        "transparent-pressed": "var(--color-bg-transparent-pressed)",

        // Application-specific variants
        "figjam-hover": "var(--color-bg-figjam-hover)",
        "figjam-pressed": "var(--color-bg-figjam-pressed)",
        "figjam-secondary": "var(--color-bg-figjam-secondary)",
        "figjam-tertiary": "var(--color-bg-figjam-tertiary)",

        "handoff-hover": "var(--color-bg-handoff-hover)",
        "handoff-pressed": "var(--color-bg-handoff-pressed)",
        "handoff-secondary": "var(--color-bg-handoff-secondary)",
        "handoff-tertiary": "var(--color-bg-handoff-tertiary)",

        "measure-hover": "var(--color-bg-measure-hover)",
        "measure-pressed": "var(--color-bg-measure-pressed)",
        "measure-secondary": "var(--color-bg-measure-secondary)",
        "measure-tertiary": "var(--color-bg-measure-tertiary)",

        "menu-disabled": "var(--color-bg-menu-disabled)",
        "menu-hover": "var(--color-bg-menu-hover)",
        "menu-pressed": "var(--color-bg-menu-pressed)",
        "menu-secondary": "var(--color-bg-menu-secondary)",
        "menu-tertiary": "var(--color-bg-menu-tertiary)",
        "menu-selected": "var(--color-bg-menu-selected)",
        "menu-selected-hover": "var(--color-bg-menu-selected-hover)",
        "menu-selected-pressed": "var(--color-bg-menu-selected-pressed)",
        "menu-selected-secondary": "var(--color-bg-menu-selected-secondary)",
        "menu-selected-tertiary": "var(--color-bg-menu-selected-tertiary)",

        "toolbar-disabled": "var(--color-bg-toolbar-disabled)",
        "toolbar-hover": "var(--color-bg-toolbar-hover)",
        "toolbar-pressed": "var(--color-bg-toolbar-pressed)",
        "toolbar-secondary": "var(--color-bg-toolbar-secondary)",
        "toolbar-tertiary": "var(--color-bg-toolbar-tertiary)",
        "toolbar-selected": "var(--color-bg-toolbar-selected)",
        "toolbar-selected-hover": "var(--color-bg-toolbar-selected-hover)",
        "toolbar-selected-pressed": "var(--color-bg-toolbar-selected-pressed)",
        "toolbar-selected-secondary":
          "var(--color-bg-toolbar-selected-secondary)",
        "toolbar-selected-tertiary":
          "var(--color-bg-toolbar-selected-tertiary)",

        "tooltip-disabled": "var(--color-bg-tooltip-disabled)",
        "tooltip-hover": "var(--color-bg-tooltip-hover)",
        "tooltip-pressed": "var(--color-bg-tooltip-pressed)",
        "tooltip-secondary": "var(--color-bg-tooltip-secondary)",
        "tooltip-tertiary": "var(--color-bg-tooltip-tertiary)",
        "tooltip-selected": "var(--color-bg-tooltip-selected)",
        "tooltip-selected-hover": "var(--color-bg-tooltip-selected-hover)",
        "tooltip-selected-pressed": "var(--color-bg-tooltip-selected-pressed)",
        "tooltip-selected-secondary":
          "var(--color-bg-tooltip-selected-secondary)",
        "tooltip-selected-tertiary":
          "var(--color-bg-tooltip-selected-tertiary)",

        // Desktop variants
        "desktop-backgrounded-disabled":
          "var(--color-bg-desktop-backgrounded-disabled)",
        "desktop-backgrounded-hover":
          "var(--color-bg-desktop-backgrounded-hover)",
        "desktop-backgrounded-pressed":
          "var(--color-bg-desktop-backgrounded-pressed)",
        "desktop-backgrounded-secondary":
          "var(--color-bg-desktop-backgrounded-secondary)",
        "desktop-backgrounded-tertiary":
          "var(--color-bg-desktop-backgrounded-tertiary)",

        "desktop-foreground-disabled":
          "var(--color-bg-desktop-foreground-disabled)",
        "desktop-foreground-hover": "var(--color-bg-desktop-foreground-hover)",
        "desktop-foreground-pressed":
          "var(--color-bg-desktop-foreground-pressed)",
        "desktop-foreground-secondary":
          "var(--color-bg-desktop-foreground-secondary)",
        "desktop-foreground-tertiary":
          "var(--color-bg-desktop-foreground-tertiary)",

        "desktop-fullscreen-disabled":
          "var(--color-bg-desktop-fullscreen-disabled)",
        "desktop-fullscreen-hover": "var(--color-bg-desktop-fullscreen-hover)",
        "desktop-fullscreen-pressed":
          "var(--color-bg-desktop-fullscreen-pressed)",
        "desktop-fullscreen-secondary":
          "var(--color-bg-desktop-fullscreen-secondary)",
        "desktop-fullscreen-tertiary":
          "var(--color-bg-desktop-fullscreen-tertiary)",

        // FS (Fullscreen/file system) variants
        "fs-assistive": "var(--color-bg-fs-assistive)",
        "fs-assistive-secondary": "var(--color-bg-fs-assistive-secondary)",
        "fs-assistive-tertiary": "var(--color-bg-fs-assistive-tertiary)",
        "fs-component": "var(--color-bg-fs-component)",
        "fs-component-secondary": "var(--color-bg-fs-component-secondary)",
        "fs-component-tertiary": "var(--color-bg-fs-component-tertiary)",
        "fs-design": "var(--color-bg-fs-design)",
        "fs-design-secondary": "var(--color-bg-fs-design-secondary)",
        "fs-design-tertiary": "var(--color-bg-fs-design-tertiary)",
        "fs-measure": "var(--color-bg-fs-measure)",
        "fs-measure-hover": "var(--color-bg-fs-measure-hover)",
        "fs-measure-secondary": "var(--color-bg-fs-measure-secondary)",
        "fs-measure-tertiary": "var(--color-bg-fs-measure-tertiary)",
        "fs-selected": "var(--color-bg-fs-selected)",
        "fs-selected-secondary": "var(--color-bg-fs-selected-secondary)",
        "fs-tertiary": "var(--color-bg-fs-tertiary)",
      },
      textColor: {
        // Core semantic colors
        default: "var(--color-text)",
        selected: "var(--color-text-selected)",
        brand: "var(--color-text-brand)",
        component: "var(--color-text-component)",
        danger: "var(--color-text-danger)",
        success: "var(--color-text-success)",
        warning: "var(--color-text-warning)",
        assistive: "var(--color-text-assistive)",
        design: "var(--color-text-design)",
        disabled: "var(--color-text-disabled)",
        secondary: "var(--color-text-secondary)",
        tertiary: "var(--color-text-tertiary)",
        hover: "var(--color-text-hover)",

        // Application/context-specific colors
        figjam: "var(--color-text-figjam)",
        handoff: "var(--color-text-handoff)",
        measure: "var(--color-text-measure)",
        menu: "var(--color-text-menu)",
        toolbar: "var(--color-text-toolbar)",
        tooltip: "var(--color-text-tooltip)",
        fs: "var(--color-text-fs)",
        onselected: "var(--color-text-onselected)",

        // "On" colors for text on colored backgrounds
        onbrand: "var(--color-text-onbrand)",
        oncomponent: "var(--color-text-oncomponent)",
        ondanger: "var(--color-text-ondanger)",
        onsuccess: "var(--color-text-onsuccess)",
        onwarning: "var(--color-text-onwarning)",
        onassistive: "var(--color-text-onassistive)",
        ondesign: "var(--color-text-ondesign)",
        ondisabled: "var(--color-text-ondisabled)",
        onfigjam: "var(--color-text-onfigjam)",
        oninverse: "var(--color-text-oninverse)",
        onmeasure: "var(--color-text-onmeasure)",

        // State variants
        "selected-secondary": "var(--color-text-selected-secondary)",
        "selected-tertiary": "var(--color-text-selected-tertiary)",

        "brand-secondary": "var(--color-text-brand-secondary)",
        "brand-tertiary": "var(--color-text-brand-tertiary)",

        "component-pressed": "var(--color-text-component-pressed)",
        "component-secondary": "var(--color-text-component-secondary)",
        "component-tertiary": "var(--color-text-component-tertiary)",

        "danger-secondary": "var(--color-text-danger-secondary)",
        "danger-tertiary": "var(--color-text-danger-tertiary)",

        "success-secondary": "var(--color-text-success-secondary)",
        "success-tertiary": "var(--color-text-success-tertiary)",

        "warning-secondary": "var(--color-text-warning-secondary)",
        "warning-tertiary": "var(--color-text-warning-tertiary)",

        "assistive-pressed": "var(--color-text-assistive-pressed)",
        "assistive-secondary": "var(--color-text-assistive-secondary)",
        "assistive-tertiary": "var(--color-text-assistive-tertiary)",

        "design-pressed": "var(--color-text-design-pressed)",
        "design-secondary": "var(--color-text-design-secondary)",
        "design-tertiary": "var(--color-text-design-tertiary)",

        "secondary-hover": "var(--color-text-secondary-hover)",
        "tertiary-hover": "var(--color-text-tertiary-hover)",

        "onbrand-secondary": "var(--color-text-onbrand-secondary)",
        "onbrand-tertiary": "var(--color-text-onbrand-tertiary)",
        "oncomponent-secondary": "var(--color-text-oncomponent-secondary)",
        "oncomponent-tertiary": "var(--color-text-oncomponent-tertiary)",
        "ondanger-secondary": "var(--color-text-ondanger-secondary)",
        "ondanger-tertiary": "var(--color-text-ondanger-tertiary)",
        "onsuccess-secondary": "var(--color-text-onsuccess-secondary)",
        "onsuccess-tertiary": "var(--color-text-onsuccess-tertiary)",
        "onwarning-secondary": "var(--color-text-onwarning-secondary)",
        "onwarning-tertiary": "var(--color-text-onwarning-tertiary)",
        "onassistive-secondary": "var(--color-text-onassistive-secondary)",
        "onassistive-tertiary": "var(--color-text-onassistive-tertiary)",
        "ondesign-secondary": "var(--color-text-ondesign-secondary)",
        "ondesign-tertiary": "var(--color-text-ondesign-tertiary)",
        "onfigjam-secondary": "var(--color-text-onfigjam-secondary)",
        "onfigjam-tertiary": "var(--color-text-onfigjam-tertiary)",
        "onmeasure-secondary": "var(--color-text-onmeasure-secondary)",
        "onmeasure-tertiary": "var(--color-text-onmeasure-tertiary)",
        "onselected-secondary": "var(--color-text-onselected-secondary)",
        "onselected-tertiary": "var(--color-text-onselected-tertiary)",
        "onselected-strong": "var(--color-text-onselected-strong)",

        // Application-specific variants
        "figjam-pressed": "var(--color-text-figjam-pressed)",
        "figjam-secondary": "var(--color-text-figjam-secondary)",
        "figjam-tertiary": "var(--color-text-figjam-tertiary)",

        "handoff-secondary": "var(--color-text-handoff-secondary)",
        "handoff-tertiary": "var(--color-text-handoff-tertiary)",

        "measure-secondary": "var(--color-text-measure-secondary)",
        "measure-tertiary": "var(--color-text-measure-tertiary)",

        "menu-danger": "var(--color-text-menu-danger)",
        "menu-disabled": "var(--color-text-menu-disabled)",
        "menu-hover": "var(--color-text-menu-hover)",
        "menu-ondisabled": "var(--color-text-menu-ondisabled)",
        "menu-onselected": "var(--color-text-menu-onselected)",
        "menu-secondary": "var(--color-text-menu-secondary)",
        "menu-secondary-hover": "var(--color-text-menu-secondary-hover)",
        "menu-selected": "var(--color-text-menu-selected)",
        "menu-selected-secondary": "var(--color-text-menu-selected-secondary)",
        "menu-selected-tertiary": "var(--color-text-menu-selected-tertiary)",
        "menu-tertiary": "var(--color-text-menu-tertiary)",
        "menu-tertiary-hover": "var(--color-text-menu-tertiary-hover)",
        "menu-warning": "var(--color-text-menu-warning)",

        "toolbar-danger": "var(--color-text-toolbar-danger)",
        "toolbar-disabled": "var(--color-text-toolbar-disabled)",
        "toolbar-hover": "var(--color-text-toolbar-hover)",
        "toolbar-ondisabled": "var(--color-text-toolbar-ondisabled)",
        "toolbar-onselected": "var(--color-text-toolbar-onselected)",
        "toolbar-secondary": "var(--color-text-toolbar-secondary)",
        "toolbar-secondary-hover": "var(--color-text-toolbar-secondary-hover)",
        "toolbar-selected": "var(--color-text-toolbar-selected)",
        "toolbar-selected-secondary":
          "var(--color-text-toolbar-selected-secondary)",
        "toolbar-selected-tertiary":
          "var(--color-text-toolbar-selected-tertiary)",
        "toolbar-tertiary": "var(--color-text-toolbar-tertiary)",
        "toolbar-tertiary-hover": "var(--color-text-toolbar-tertiary-hover)",
        "toolbar-warning": "var(--color-text-toolbar-warning)",

        "tooltip-danger": "var(--color-text-tooltip-danger)",
        "tooltip-disabled": "var(--color-text-tooltip-disabled)",
        "tooltip-hover": "var(--color-text-tooltip-hover)",
        "tooltip-ondisabled": "var(--color-text-tooltip-ondisabled)",
        "tooltip-onselected": "var(--color-text-tooltip-onselected)",
        "tooltip-secondary": "var(--color-text-tooltip-secondary)",
        "tooltip-secondary-hover": "var(--color-text-tooltip-secondary-hover)",
        "tooltip-selected": "var(--color-text-tooltip-selected)",
        "tooltip-selected-secondary":
          "var(--color-text-tooltip-selected-secondary)",
        "tooltip-selected-tertiary":
          "var(--color-text-tooltip-selected-tertiary)",
        "tooltip-tertiary": "var(--color-text-tooltip-tertiary)",
        "tooltip-tertiary-hover": "var(--color-text-tooltip-tertiary-hover)",
        "tooltip-warning": "var(--color-text-tooltip-warning)",

        // Desktop variants
        "desktop-backgrounded": "var(--color-text-desktop-backgrounded)",
        "desktop-backgrounded-danger":
          "var(--color-text-desktop-backgrounded-danger)",
        "desktop-backgrounded-disabled":
          "var(--color-text-desktop-backgrounded-disabled)",
        "desktop-backgrounded-hover":
          "var(--color-text-desktop-backgrounded-hover)",
        "desktop-backgrounded-ondisabled":
          "var(--color-text-desktop-backgrounded-ondisabled)",
        "desktop-backgrounded-secondary":
          "var(--color-text-desktop-backgrounded-secondary)",
        "desktop-backgrounded-secondary-hover":
          "var(--color-text-desktop-backgrounded-secondary-hover)",
        "desktop-backgrounded-tertiary":
          "var(--color-text-desktop-backgrounded-tertiary)",
        "desktop-backgrounded-tertiary-hover":
          "var(--color-text-desktop-backgrounded-tertiary-hover)",
        "desktop-backgrounded-warning":
          "var(--color-text-desktop-backgrounded-warning)",

        "desktop-foreground": "var(--color-text-desktop-foreground)",
        "desktop-foreground-danger":
          "var(--color-text-desktop-foreground-danger)",
        "desktop-foreground-disabled":
          "var(--color-text-desktop-foreground-disabled)",
        "desktop-foreground-hover":
          "var(--color-text-desktop-foreground-hover)",
        "desktop-foreground-ondisabled":
          "var(--color-text-desktop-foreground-ondisabled)",
        "desktop-foreground-secondary":
          "var(--color-text-desktop-foreground-secondary)",
        "desktop-foreground-secondary-hover":
          "var(--color-text-desktop-foreground-secondary-hover)",
        "desktop-foreground-tertiary":
          "var(--color-text-desktop-foreground-tertiary)",
        "desktop-foreground-tertiary-hover":
          "var(--color-text-desktop-foreground-tertiary-hover)",
        "desktop-foreground-warning":
          "var(--color-text-desktop-foreground-warning)",

        "desktop-fullscreen": "var(--color-text-desktop-fullscreen)",
        "desktop-fullscreen-danger":
          "var(--color-text-desktop-fullscreen-danger)",
        "desktop-fullscreen-disabled":
          "var(--color-text-desktop-fullscreen-disabled)",
        "desktop-fullscreen-hover":
          "var(--color-text-desktop-fullscreen-hover)",
        "desktop-fullscreen-ondisabled":
          "var(--color-text-desktop-fullscreen-ondisabled)",
        "desktop-fullscreen-secondary":
          "var(--color-text-desktop-fullscreen-secondary)",
        "desktop-fullscreen-secondary-hover":
          "var(--color-text-desktop-fullscreen-secondary-hover)",
        "desktop-fullscreen-tertiary":
          "var(--color-text-desktop-fullscreen-tertiary)",
        "desktop-fullscreen-tertiary-hover":
          "var(--color-text-desktop-fullscreen-tertiary-hover)",
        "desktop-fullscreen-warning":
          "var(--color-text-desktop-fullscreen-warning)",

        // FS (Fullscreen/file system) variants
        "fs-assistive": "var(--color-text-fs-assistive)",
        "fs-component": "var(--color-text-fs-component)",
        "fs-design": "var(--color-text-fs-design)",
        "fs-measure": "var(--color-text-fs-measure)",
        "fs-onassistive": "var(--color-text-fs-onassistive)",
        "fs-oncomponent": "var(--color-text-fs-oncomponent)",
        "fs-ondesign": "var(--color-text-fs-ondesign)",
        "fs-onmeasure": "var(--color-text-fs-onmeasure)",
        "fs-onselected": "var(--color-text-fs-onselected)",
        "fs-secondary": "var(--color-text-fs-secondary)",
        "fs-selected": "var(--color-text-fs-selected)",
        "fs-tertiary": "var(--color-text-fs-tertiary)",
      },
      borderColor: {
        // Core semantic colors
        default: "var(--color-border)",
        selected: "var(--color-border-selected)",
        brand: "var(--color-border-brand)",
        component: "var(--color-border-component)",
        danger: "var(--color-border-danger)",
        success: "var(--color-border-success)",
        warning: "var(--color-border-warning)",
        assistive: "var(--color-border-assistive)",
        design: "var(--color-border-design)",
        disabled: "var(--color-border-disabled)",
        strong: "var(--color-border-strong)",

        // Application/context-specific colors
        figjam: "var(--color-border-figjam)",
        handoff: "var(--color-border-handoff)",
        measure: "var(--color-border-measure)",
        menu: "var(--color-border-menu)",
        toolbar: "var(--color-border-toolbar)",
        tooltip: "var(--color-border-tooltip)",
        fs: "var(--color-border-fs)",
        onselected: "var(--color-border-onselected)",

        // "On" colors for borders on colored backgrounds
        onbrand: "var(--color-border-onbrand)",
        oncomponent: "var(--color-border-oncomponent)",
        ondanger: "var(--color-border-ondanger)",
        onsuccess: "var(--color-border-onsuccess)",
        onwarning: "var(--color-border-onwarning)",
        onassistive: "var(--color-border-onassistive)",
        ondesign: "var(--color-border-ondesign)",
        onfigjam: "var(--color-border-onfigjam)",
        onmeasure: "var(--color-border-onmeasure)",

        // Strong variants
        "selected-strong": "var(--color-border-selected-strong)",
        "brand-strong": "var(--color-border-brand-strong)",
        "component-strong": "var(--color-border-component-strong)",
        "danger-strong": "var(--color-border-danger-strong)",
        "success-strong": "var(--color-border-success-strong)",
        "warning-strong": "var(--color-border-warning-strong)",
        "assistive-strong": "var(--color-border-assistive-strong)",
        "design-strong": "var(--color-border-design-strong)",
        "disabled-strong": "var(--color-border-disabled-strong)",
        "figjam-strong": "var(--color-border-figjam-strong)",
        "handoff-strong": "var(--color-border-handoff-strong)",
        "measure-strong": "var(--color-border-measure-strong)",

        "onbrand-strong": "var(--color-border-onbrand-strong)",
        "oncomponent-strong": "var(--color-border-oncomponent-strong)",
        "ondanger-strong": "var(--color-border-ondanger-strong)",
        "onsuccess-strong": "var(--color-border-onsuccess-strong)",
        "onwarning-strong": "var(--color-border-onwarning-strong)",
        "onassistive-strong": "var(--color-border-onassistive-strong)",
        "ondesign-strong": "var(--color-border-ondesign-strong)",
        "onfigjam-strong": "var(--color-border-onfigjam-strong)",
        "onmeasure-strong": "var(--color-border-onmeasure-strong)",
        "onselected-strong": "var(--color-border-onselected-strong)",

        // Component variants
        "component-hover": "var(--color-border-component-hover)",
        "component-selected": "var(--color-border-component-selected)",

        // Desktop variants
        "desktop-backgrounded": "var(--color-border-desktop-backgrounded)",
        "desktop-backgrounded-disabled":
          "var(--color-border-desktop-backgrounded-disabled)",
        "desktop-backgrounded-strong":
          "var(--color-border-desktop-backgrounded-strong)",
        "desktop-foreground": "var(--color-border-desktop-foreground)",
        "desktop-foreground-disabled":
          "var(--color-border-desktop-foreground-disabled)",
        "desktop-foreground-strong":
          "var(--color-border-desktop-foreground-strong)",
        "desktop-fullscreen": "var(--color-border-desktop-fullscreen)",
        "desktop-fullscreen-disabled":
          "var(--color-border-desktop-fullscreen-disabled)",
        "desktop-fullscreen-strong":
          "var(--color-border-desktop-fullscreen-strong)",

        // Menu variants
        "menu-disabled": "var(--color-border-menu-disabled)",
        "menu-disabled-strong": "var(--color-border-menu-disabled-strong)",
        "menu-onselected": "var(--color-border-menu-onselected)",
        "menu-onselected-strong": "var(--color-border-menu-onselected-strong)",
        "menu-selected": "var(--color-border-menu-selected)",
        "menu-selected-strong": "var(--color-border-menu-selected-strong)",
        "menu-strong": "var(--color-border-menu-strong)",

        // Toolbar variants
        "toolbar-disabled": "var(--color-border-toolbar-disabled)",
        "toolbar-onselected": "var(--color-border-toolbar-onselected)",
        "toolbar-selected": "var(--color-border-toolbar-selected)",
        "toolbar-selected-strong":
          "var(--color-border-toolbar-selected-strong)",
        "toolbar-strong": "var(--color-border-toolbar-strong)",

        // Tooltip variants
        "tooltip-disabled": "var(--color-border-tooltip-disabled)",
        "tooltip-disabled-strong":
          "var(--color-border-tooltip-disabled-strong)",
        "tooltip-onselected": "var(--color-border-tooltip-onselected)",
        "tooltip-onselected-strong":
          "var(--color-border-tooltip-onselected-strong)",
        "tooltip-selected": "var(--color-border-tooltip-selected)",
        "tooltip-selected-strong":
          "var(--color-border-tooltip-selected-strong)",
        "tooltip-strong": "var(--color-border-tooltip-strong)",

        // FS (Fullscreen/file system) variants
        "fs-assistive": "var(--color-border-fs-assistive)",
        "fs-assistive-strong": "var(--color-border-fs-assistive-strong)",
        "fs-component": "var(--color-border-fs-component)",
        "fs-component-strong": "var(--color-border-fs-component-strong)",
        "fs-design": "var(--color-border-fs-design)",
        "fs-design-strong": "var(--color-border-fs-design-strong)",
        "fs-measure": "var(--color-border-fs-measure)",
        "fs-measure-strong": "var(--color-border-fs-measure-strong)",
        "fs-onassistive": "var(--color-border-fs-onassistive)",
        "fs-onassistive-strong": "var(--color-border-fs-onassistive-strong)",
        "fs-oncomponent": "var(--color-border-fs-oncomponent)",
        "fs-oncomponent-strong": "var(--color-border-fs-oncomponent-strong)",
        "fs-ondesign": "var(--color-border-fs-ondesign)",
        "fs-ondesign-strong": "var(--color-border-fs-ondesign-strong)",
        "fs-onmeasure": "var(--color-border-fs-onmeasure)",
        "fs-onmeasure-strong": "var(--color-border-fs-onmeasure-strong)",
        "fs-onselected": "var(--color-border-fs-onselected)",
        "fs-onselected-strong": "var(--color-border-fs-onselected-strong)",
        "fs-selected": "var(--color-border-fs-selected)",
        "fs-selected-strong": "var(--color-border-fs-selected-strong)",
        "fs-strong": "var(--color-border-fs-strong)",
      },
      // Icon colors (for SVG fill, etc.)
      fill: {
        // Semantic colors
        selected: "var(--color-icon-selected)",
        brand: "var(--color-icon-brand)",
        component: "var(--color-icon-component)",
        danger: "var(--color-icon-danger)",
        success: "var(--color-icon-success)",
        warning: "var(--color-icon-warning)",
        assistive: "var(--color-icon-assistive)",
        design: "var(--color-icon-design)",
        disabled: "var(--color-icon-disabled)",
        secondary: "var(--color-icon-secondary)",
        tertiary: "var(--color-icon-tertiary)",
        hover: "var(--color-icon-hover)",
        pressed: "var(--color-icon-pressed)",
        // Application/context-specific colors
        figjam: "var(--color-icon-figjam)",
        handoff: "var(--color-icon-handoff)",
        measure: "var(--color-icon-measure)",
        menu: "var(--color-icon-menu)",
        toolbar: "var(--color-icon-toolbar)",
        tooltip: "var(--color-icon-tooltip)",
        fs: "var(--color-icon-fs)",
        onselected: "var(--color-icon-onselected)",
        // "On" colors for icons on colored backgrounds
        onbrand: "var(--color-icon-onbrand)",
        oncomponent: "var(--color-icon-oncomponent)",
        ondanger: "var(--color-icon-ondanger)",
        onsuccess: "var(--color-icon-onsuccess)",
        onwarning: "var(--color-icon-onwarning)",
        onassistive: "var(--color-icon-onassistive)",
        ondesign: "var(--color-icon-ondesign)",
        ondisabled: "var(--color-icon-ondisabled)",
        onfigjam: "var(--color-icon-onfigjam)",
        onmeasure: "var(--color-icon-onmeasure)",
        oninverse: "var(--color-icon-oninverse)",
      },

      colors: {
        border: "var(--color-border)",
        input: "var(--color-input)",
        ring: "var(--color-ring)",
        background: "var(--color-bg)",
        foreground: "var(--color-text)",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "var(--color-bg-elevated)",
          foreground: "var(--color-text)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      fontSize: {
        xs: "11px",
        base: "11px",
      },
      fontWeight: {
        normal: "450",
        medium: "550",
        semibold: "600",
        bold: "700",
      },
      boxShadow: {
        "100": "0 1px 3px 0 #00000026, 0 0 .5px 0 #0000004d",
        "200":
          "0 1px 3px 0 #0000001a, 0 3px 8px 0 #0000001a, 0 0 .5px 0 #0000002e",
        "300":
          "0 1px 3px 0 #0000001a, 0 5px 12px 0 #00000021, 0 0 .5px 0 #00000026",
        "400":
          "0 2px 5px 0 #00000026, 0 10px 16px 0 #0000001f, 0 0 .5px 0 #0000001f",
        "500":
          "0 2px 5px 0 #00000026, 0 10px 24px 0 #0000002e, 0 0 .5px 0 #00000014",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;

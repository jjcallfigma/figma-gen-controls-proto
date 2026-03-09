"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-menu group-[.toaster]:w-max group-[.toaster]:py-3 group-[.toaster]:-translate-x-1/2 group-[.toaster]:left-1/2 group-[.toaster]:text-menu group-[.toaster]:text-xs group-[.toaster]:border-none group-[.toaster]:mb-[48px] group-[.toaster]:shadow-400 group-[.toaster]:rounded-[13px]",
          description: "group-[.toast]:text-secondary",
          actionButton:
            "group-[.action-button]:bg-red-500 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-secondary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

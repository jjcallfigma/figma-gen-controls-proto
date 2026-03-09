"use client";

import { Button } from "@/components/ui/button";
import { toast as sonnerToast } from "sonner";
import { Icon24Check } from "../icons/icon-24-check";
import { Icon24Close } from "../icons/icon-24-close";
import { Icon24Loading } from "../icons/icon-24-loading";
import { Icon24Warning } from "../icons/icon-24-warning";

interface ToastProps {
  id: string | number;
  title: string;
  description?: string;
  type?: "success" | "error" | "loading" | "info";
  action?: {
    label: string;
    onClick: () => void;
  };
  cancel?: {
    label: string;
    onClick: () => void;
  };
}

/** Custom toast component with Figma design system styling */
function Toast(props: ToastProps) {
  const { title, description, type = "info", action, cancel, id } = props;

  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return "bg-menu text-menu text-xs font-regular  ";
      case "error":
        return "bg-error text-error text-xs font-regular";
      case "loading":
        return "bg-menu text-menu text-xs font-regular";
      default:
        return "bg-menu text-menu text-xs font-regular";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <Icon24Check />;
      case "error":
        return <Icon24Warning />;
      case "loading":
        return <Icon24Loading />;
      default:
        return <Icon24Check />;
    }
  };

  return (
    <div
      className={`
        flex rounded-[13px] shadow-400 w-max max-w-[600px] items-center pl-4 pr-2 py-0 gap-3 left-1/2  transition-none animate-none h-10
        
        ${getTypeStyles()}
      `}
    >
      {/* Icon */}
      {/* <div className="flex-shrink-0">{getIcon()}</div> */}

      {/* Content */}
      <div className="flex items-center w-full gap-2 h-full">
        <div className="text-xs shrink-0">{title}</div>
        {/* {description && (
          <p
            className={`mt-1 text-xs leading-4 ${
              type === "success" || type === "error"
                ? "text-menu"
                : "text-secondary"
            }`}
          >
            {description}
          </p>
        )} */}

        {/* Actions */}
        {(action || cancel) && (
          <div className=" flex w-full gap-2">
            {action && (
              <Button
                variant="outline"
                onClick={() => {
                  action.onClick();
                  sonnerToast.dismiss(id);
                }}
              >
                {action.label}
              </Button>
            )}
            {cancel && (
              <button
                className={`
                  px-3 py-1.5 rounded text-xs font-medium transition-colors
                  ${
                    type === "success" || type === "error"
                      ? "bg-white/10 hover:bg-white/20 text-white/80"
                      : "bg-secondary hover:bg-secondary-hover text-secondary"
                  }
                `}
                onClick={() => {
                  cancel.onClick();
                  sonnerToast.dismiss(id);
                }}
              >
                {cancel.label}
              </button>
            )}
          </div>
        )}

        <div className="h-full border-l border-neutral-600 flex items-center pl-2">
          <button
            className={`
          flex-shrink-0 rounded hover:bg-neutral-700
          
        `}
            onClick={() => sonnerToast.dismiss(id)}
          >
            <Icon24Close />
          </button>
        </div>
      </div>

      {/* Close button */}
    </div>
  );
}

/** Custom toast functions */
export const toast = {
  success: (
    title: string,
    options?: Partial<Omit<ToastProps, "id" | "type" | "title">>,
  ) => {
    return sonnerToast.custom((id) => (
      <Toast id={id} title={title} type="success" {...options} />
    ));
  },

  error: (
    title: string,
    options?: Partial<Omit<ToastProps, "id" | "type" | "title">>,
  ) => {
    return sonnerToast.custom((id) => (
      <Toast id={id} title={title} type="error" {...options} />
    ));
  },

  loading: (
    title: string,
    options?: Partial<Omit<ToastProps, "id" | "type" | "title">>,
  ) => {
    return sonnerToast.custom((id) => (
      <Toast id={id} title={title} type="loading" {...options} />
    ));
  },

  info: (
    title: string,
    options?: Partial<Omit<ToastProps, "id" | "type" | "title">>,
  ) => {
    return sonnerToast.custom((id) => (
      <Toast id={id} title={title} type="info" {...options} />
    ));
  },

  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

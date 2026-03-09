import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import React from "react";

export const USER_AVATAR_URL =
  "https://cdn3.emoji.gg/emojis/4481-steve-jobs.png";

export function UserAvatar({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <Avatar className={`${className} flex-shrink-0`}>
      <AvatarImage src={USER_AVATAR_URL} alt="User" />
      <AvatarFallback>GC</AvatarFallback>
    </Avatar>
  );
}

export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="animate-spin flex-shrink-0"
    >
      <path
        d="M8 2a6 6 0 105.3 3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Checkmark({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="flex-shrink-0"
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ErrorIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="flex-shrink-0"
      style={{ color: "var(--color-error, #e53e3e)" }}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 6l4 4M10 6l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StreamingDot() {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full animate-pulse ml-0.5 align-middle"
      style={{ backgroundColor: "var(--color-text-tertiary)" }}
    />
  );
}

export const chatStyles = {
  text: {
    primary: "var(--color-text)",
    secondary: "var(--color-text-secondary)",
    tertiary: "var(--color-text-tertiary)",
  },
  fontSize: {
    body: "12px",
    small: "11px",
    label: "13px",
  },
  radius: {
    block: 8,
    card: 10,
    bubble: 16,
    pill: 9999,
  },
  border: "var(--color-border)",
  bg: {
    card: "var(--color-bg)",
    secondary: "var(--color-bg-secondary)",
    tertiary: "var(--color-bg-tertiary)",
  },
} as const;

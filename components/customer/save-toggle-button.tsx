"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Bookmark } from "lucide-react";

type SaveToggleButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed" | "type"> & {
  appearance?: "icon" | "pill";
  saved: boolean;
  "aria-label": string;
  children?: ReactNode;
  iconSize?: number;
};

export function SaveToggleButton({ appearance = "pill", saved, "aria-label": ariaLabel, children, className, iconSize = 15, ...buttonProps }: SaveToggleButtonProps) {
  const appearanceClassName = appearance === "icon"
    ? "inline-flex items-center justify-center rounded-full bg-white text-primary shadow-sm transition hover:bg-[#f4f6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
    : "inline-flex items-center justify-center gap-2 rounded-full border border-[#d8def2] bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm transition hover:border-primary hover:bg-[#f4f6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2";

  return (
    <button {...buttonProps} type="button" aria-label={ariaLabel} aria-pressed={saved} className={`${appearanceClassName} ${className ?? ""}`}>
      <Bookmark size={iconSize} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
      {children}
    </button>
  );
}

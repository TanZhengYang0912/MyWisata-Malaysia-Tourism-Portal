"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Bookmark } from "lucide-react";

type SaveToggleButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed" | "type"> & {
  saved: boolean;
  "aria-label": string;
  children?: ReactNode;
  iconSize?: number;
};

export function SaveToggleButton({ saved, "aria-label": ariaLabel, children, className, iconSize = 15, ...buttonProps }: SaveToggleButtonProps) {
  return (
    <button {...buttonProps} type="button" aria-label={ariaLabel} aria-pressed={saved} className={className}>
      <Bookmark size={iconSize} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
      {children}
    </button>
  );
}

"use client";
import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  asChild?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "af-btn-primary",
  secondary: "af-btn-secondary",
  ghost: "af-btn-ghost",
  danger: "af-btn-danger",
};

export function Button({
  className,
  variant = "primary",
  disabled,
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? React.Fragment : "button";
  const rest = asChild ? {} : { type: "button", disabled, ...props };
  return (
    <Comp
      className={`af-btn ${variantClasses[variant]} ${className ?? ""}`.trim()}
      {...rest}
    />
  );
}

Button.displayName = "Button";

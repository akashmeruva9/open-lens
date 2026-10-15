import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
export const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink/85",
  accent: "bg-accent text-accent-ink hover:bg-accent/90",
  secondary: "bg-surface text-ink hover:bg-surface-2",
  outline: "border border-ink/80 text-ink hover:bg-ink hover:text-bg",
  ghost: "text-ink-2 hover:bg-surface hover:text-ink",
  danger: "bg-[var(--st-bad)] text-white hover:opacity-90",
};
export const BUTTON_SIZES = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" } as const;
export const buttonClass = (variant: Variant = "secondary", size: keyof typeof BUTTON_SIZES = "md", extra = "") =>
  `inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${extra}`;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof BUTTON_SIZES }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

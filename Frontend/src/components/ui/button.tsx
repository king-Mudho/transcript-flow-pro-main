import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * One button for the graduate site and the admin workspace (B7.1).
 *
 * Variants: gold (the one main action per screen), navy, outline, ghost,
 * danger and whatsapp. Sizes: `lg` is 48px for phones, `default` is 36px for
 * the admin workspace.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        gold: "bg-gold text-ink hover:bg-gold-hover",
        default: "bg-navy text-white hover:bg-navy-2",
        navy: "bg-navy text-white hover:bg-navy-2",
        outline: "border border-line bg-white text-ink hover:bg-ground",
        "outline-light": "border border-white/40 bg-transparent text-white hover:bg-white/10",
        secondary: "bg-ground text-navy hover:bg-line",
        ghost: "text-ink-2 hover:bg-ground hover:text-ink",
        destructive: "bg-danger text-white hover:bg-danger/90",
        danger: "bg-danger text-white hover:bg-danger/90",
        whatsapp: "bg-whatsapp text-white hover:bg-whatsapp/90",
        link: "text-navy underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-[14px]",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-12 px-6 text-[16px]",
        icon: "h-9 w-9",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };

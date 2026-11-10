"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const CONTROL = "input:not([type=hidden]), textarea, select, [role=combobox]";

/**
 * Every input has a visible label that is also its accessible name (B7.2).
 *
 * When `htmlFor` is not given, the label links itself to the first form
 * control in its field group (its parent element), giving the control an id
 * if it has none. Clicking the label then focuses the control, and screen
 * readers announce the label.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, htmlFor, ...props }, ref) => {
  const own = React.useRef<HTMLLabelElement | null>(null);
  const autoId = React.useId();

  React.useEffect(() => {
    const label = own.current;
    if (!label || htmlFor) return;
    const control = label.parentElement?.querySelector<HTMLElement>(CONTROL);
    if (!control) return;
    if (!control.id) control.id = `field-${autoId.replace(/:/g, "")}`;
    label.htmlFor = control.id;
  });

  return (
    <LabelPrimitive.Root
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      htmlFor={htmlFor}
      className={cn(labelVariants(), className)}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };

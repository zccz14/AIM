import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
  <input className={cn("ui-input", className)} data-slot="input" {...props} />
);

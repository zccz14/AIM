import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";

export const Badge = ({ className, ...props }: ComponentProps<"span">) => (
  <span className={cn("ui-badge", className)} data-slot="badge" {...props} />
);

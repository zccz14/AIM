import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";

export const Select = ({ className, ...props }: ComponentProps<"select">) => (
  <select className={cn("ui-input", className)} data-slot="select" {...props} />
);

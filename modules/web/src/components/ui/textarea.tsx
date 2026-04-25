import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";

export const Textarea = ({
  className,
  ...props
}: ComponentProps<"textarea">) => (
  <textarea
    className={cn("ui-input ui-textarea", className)}
    data-slot="textarea"
    {...props}
  />
);

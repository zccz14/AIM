import type { ComponentProps } from "react";
import { createElement } from "react";

import { cn } from "../../lib/utils.js";

export const Label = ({ className, ...props }: ComponentProps<"label">) =>
  createElement("label", {
    className: cn("ui-label", className),
    "data-slot": "label",
    ...props,
  });

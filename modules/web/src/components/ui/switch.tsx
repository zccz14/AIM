import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";

const Switch = ({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    className={cn("ui-switch", className)}
    data-slot="switch"
    {...props}
  >
    <SwitchPrimitive.Thumb
      className="ui-switch__thumb"
      data-slot="switch-thumb"
    />
  </SwitchPrimitive.Root>
);

export { Switch };

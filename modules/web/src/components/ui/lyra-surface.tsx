import type { ComponentProps, ElementType } from "react";

import { cn } from "../../lib/utils.js";

type LyraSurfaceProps = ComponentProps<"section"> &
  ComponentProps<"form"> & {
    as?: ElementType;
  };

export const LyraSurface = ({
  as: Comp = "section",
  className,
  ...props
}: LyraSurfaceProps) => (
  <Comp
    className={cn("aim-surface", className)}
    data-slot="lyra-surface"
    {...props}
  />
);

export const LyraPanel = ({
  className,
  ...props
}: ComponentProps<"section">) => (
  <section
    className={cn("aim-task-panel", className)}
    data-slot="lyra-panel"
    {...props}
  />
);

export const LyraStack = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("aim-stack", className)}
    data-slot="lyra-stack"
    {...props}
  />
);

export const LyraKicker = ({ className, ...props }: ComponentProps<"p">) => (
  <p
    className={cn("aim-kicker", className)}
    data-slot="lyra-kicker"
    {...props}
  />
);

export const LyraMuted = ({ className, ...props }: ComponentProps<"p">) => (
  <p className={cn("aim-muted", className)} data-slot="lyra-muted" {...props} />
);

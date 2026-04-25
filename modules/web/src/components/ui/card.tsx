import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.js";

export const Card = ({ className, ...props }: ComponentProps<"section">) => (
  <section className={cn("ui-card", className)} data-slot="card" {...props} />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("ui-card-header", className)}
    data-slot="card-header"
    {...props}
  />
);

export const CardTitle = ({ className, ...props }: ComponentProps<"h2">) => (
  <h2
    className={cn("section-title", className)}
    data-slot="card-title"
    {...props}
  />
);

export const CardDescription = ({
  className,
  ...props
}: ComponentProps<"p">) => (
  <p
    className={cn("section-copy", className)}
    data-slot="card-description"
    {...props}
  />
);

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn(className)} data-slot="card-content" {...props} />
);

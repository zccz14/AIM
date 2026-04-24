import type { ComponentPropsWithoutRef } from "react";

const buttonVariants = {
  ghost: "ui-button ui-button--ghost",
  graphNode: "graph-node",
  nav: "nav-pill",
  navActive: "nav-pill nav-pill--active",
  primary: "ui-button ui-button--primary",
  taskPrimary: "aim-task-button aim-task-button-primary",
  taskSecondary: "aim-task-button aim-task-button-secondary",
  taskTitle: "task-title-button",
  theme: "theme-toggle",
  unstyled: "",
} as const;

const buttonSizes = {
  default: "",
  compact: "",
  icon: "",
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

const mergeClassNames = (
  ...classNames: Array<string | false | null | undefined>
) => classNames.filter(Boolean).join(" ");

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export const Button = ({
  className,
  size = "default",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) => (
  <button
    className={mergeClassNames(
      buttonVariants[variant],
      buttonSizes[size],
      className,
    )}
    type={type}
    {...props}
  />
);

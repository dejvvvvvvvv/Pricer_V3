import React from 'react';
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import Icon from "../AppIcon";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        gradient:
          "text-primary-foreground bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-hover))] hover:opacity-95 shadow-sm",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground hover:bg-success/90",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90",
        danger: "bg-error text-error-foreground hover:bg-error/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        xs: "h-8 rounded-md px-2 text-xs",
        xl: "h-12 rounded-md px-10 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

// A simple, consistent loading spinner
const LoadingSpinner = ({ size }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="animate-spin"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const Button = React.forwardRef(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      children,
      loading = false,
      iconName,
      iconPosition = "left",
      fullWidth = false,
      ...props
    },
    ref
  ) => {
    const iconSizeMap = {
      xs: 12,
      sm: 14,
      default: 16,
      lg: 18,
      xl: 20,
      icon: 16,
    };
    const iconSize = iconSizeMap[size] || 16;

    // Render loading spinner or icon
    const iconOrSpinner = loading ? (
      <LoadingSpinner size={iconSize} />
    ) : iconName ? (
      <Icon name={iconName} size={iconSize} />
    ) : null;

    const classes = cn(buttonVariants({ variant, size, className }), fullWidth && "w-full");

    // ✅ CRITICAL FIX:
    // When `asChild` is true, Radix Slot requires EXACTLY ONE React element child.
    // Also, we MUST NOT inject extra nodes (icons/spinner spans) around children in asChild mode.
    if (asChild) {
      // Avoid passing `disabled` to non-button elements (e.g., <a>, <Link>)
      // but still allow styling via classes.
      const { disabled, ...rest } = props;

      // Ensure a single element child; if not, wrap as a fallback (prevents white screen).
      let onlyChild;
      try {
        onlyChild = React.Children.only(children);
      } catch (e) {
        onlyChild = <span>{children}</span>;
      }

      return (
        <Slot
          className={classes}
          ref={ref}
          aria-disabled={loading || disabled ? true : undefined}
          {...rest}
        >
          {onlyChild}
        </Slot>
      );
    }

    return (
      <button
        className={classes}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {iconPosition === "left" && iconOrSpinner ? (
          <span className={children ? "mr-2" : ""}>{iconOrSpinner}</span>
        ) : null}
        {children}
        {iconPosition === "right" && iconOrSpinner ? (
          <span className={children ? "ml-2" : ""}>{iconOrSpinner}</span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;

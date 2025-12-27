import { cn } from "@repo/ui/lib/utils";
import { forwardRef } from "react";

interface NavLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  (
    { className, activeClassName, pendingClassName, to, href, ...props },
    ref,
  ) => {
    // In Astro, we use regular anchor tags
    // Active state can be determined client-side if needed
    const isActive =
      typeof window !== "undefined" && window.location.pathname === to;

    return (
      <a
        ref={ref}
        href={to || href}
        className={cn(className, isActive && activeClassName)}
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };

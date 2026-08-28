import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";

const variants = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 shadow-[0_1px_2px_rgba(15,37,84,0.08)] hover:shadow-[0_10px_24px_-6px_rgba(29,84,201,0.45)]",
  secondary:
    "bg-white text-brand-700 border border-ink-200 hover:border-brand-300 hover:bg-brand-50",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
  outlineLight: "bg-transparent text-white border border-white/30 hover:bg-white/10 hover:border-white/50",
};

const sizes = {
  sm: "text-sm px-4 py-2 gap-1.5",
  md: "text-sm px-5 py-3 gap-2",
  lg: "text-base px-7 py-3.5 gap-2.5",
};

const Button = forwardRef(function Button(
  {
    children,
    variant = "primary",
    size = "md",
    icon,
    iconPosition = "right",
    to,
    href,
    className = "",
    type = "button",
    ...props
  },
  ref
) {
  const classes = `focus-ring group inline-flex items-center justify-center rounded-full font-semibold tracking-tight transition-all duration-200 active:scale-[0.98] ${variants[variant]} ${sizes[size]} ${className}`;

  const content = (
    <>
      {icon && iconPosition === "left" && (
        <Icon name={icon} className="h-4 w-4 shrink-0 transition-transform duration-200" />
      )}
      <span>{children}</span>
      {icon && iconPosition === "right" && (
        <Icon
          name={icon}
          className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      )}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a ref={ref} href={href} className={classes} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} {...props}>
      {content}
    </button>
  );
});

export default Button;

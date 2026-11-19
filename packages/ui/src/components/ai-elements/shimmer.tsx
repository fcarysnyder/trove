// AI Elements' Shimmer, with its motion/react animation swapped for a CSS keyframe (index.css: shimmer).
import { cn } from "@/lib/utils";
import { type CSSProperties, type ElementType, memo } from "react";

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => (
  <Component
    className={cn(
      "relative inline-block animate-[shimmer_var(--duration)_linear_infinite] bg-[length:250%_100%,auto] bg-clip-text text-transparent motion-reduce:animate-none",
      "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
      className
    )}
    style={
      {
        "--spread": `${(children?.length ?? 0) * spread}px`,
        "--duration": `${duration}s`,
        backgroundImage:
          "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
      } as CSSProperties
    }
  >
    {children}
  </Component>
);

export const Shimmer = memo(ShimmerComponent);

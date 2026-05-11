import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: "cyan" | "violet" | "none";
  beam?: boolean;
  hover?: boolean;
  padding?: string | number;
}

/**
 * GlassCard — conteneur réutilisable SaaS High-Tech.
 *
 * - backdrop-filter blur(12px) avec fallback opacité haute
 * - gradient border subtil via CSS ::before mask
 * - micro-glow coin supérieur gauche (désactivable via glow="none")
 * - beam : animation lumière tournante sur le border (prop optionnelle)
 * - hover : légère élévation framer-motion + intensité glow (activé par défaut)
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ glow = "cyan", beam = false, hover = true, padding, className = "", style, children, ...props }, ref) => {
    const glowClass = glow === "violet" ? "glow-violet" : glow === "none" ? "glow-none" : "";
    const beamClass = beam ? "border-beam" : "";

    return (
      <motion.div
        ref={ref}
        className={`glass-card ${glowClass} ${beamClass} ${className}`.trim()}
        style={{ padding, ...style }}
        whileHover={hover ? { y: -1, transition: { duration: 0.18, ease: "easeOut" } } : undefined}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = "GlassCard";

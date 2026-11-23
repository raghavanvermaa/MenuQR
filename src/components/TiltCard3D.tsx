import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface TiltCard3DProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  onClick?: () => void;
  id?: string;
}

/**
 * Interactive 3D perspective card with warm specular sheen on pointer move
 * and tactile spring feedback on touch devices. Automatically degrades cleanly
 * when `prefers-reduced-motion` is enabled.
 */
export function TiltCard3D({
  children,
  className = '',
  maxTilt = 7,
  onClick,
  id,
}: TiltCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, glowX: 50, glowY: 30, active: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReduced || e.pointerType === 'touch') return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 2 * maxTilt;
    const rotateX = (0.5 - py) * 2 * maxTilt;

    setTilt({
      rotateX,
      rotateY,
      glowX: Math.round(px * 100),
      glowY: Math.round(py * 100),
      active: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0, glowX: 50, glowY: 30, active: false });
  };

  return (
    <div style={{ perspective: 950 }} className="h-full">
      <motion.div
        ref={cardRef}
        id={id}
        onClick={onClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        animate={
          prefersReduced
            ? undefined
            : {
                rotateX: tilt.rotateX,
                rotateY: tilt.rotateY,
                y: tilt.active ? -3 : 0,
              }
        }
        whileTap={prefersReduced ? undefined : { scale: 0.975 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24, mass: 0.6 }}
        style={{ transformStyle: 'preserve-3d' }}
        className={`relative h-full will-change-transform ${className}`}
      >
        {/* Subtle Warm Specular Glint Layer */}
        {!prefersReduced && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-200 z-10"
            style={{
              opacity: tilt.active ? 1 : 0,
              background: `radial-gradient(280px circle at ${tilt.glowX}% ${tilt.glowY}%, rgba(255, 166, 77, 0.16), transparent 65%)`,
            }}
          />
        )}
        {children}
      </motion.div>
    </div>
  );
}

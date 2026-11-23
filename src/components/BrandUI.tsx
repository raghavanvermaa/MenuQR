import React from 'react';
import { UtensilsCrossed } from 'lucide-react';
import type { FoodType } from '../types/menuqr';

export function MenuQrBrand({
  inverted = false,
  size = 'md',
}: {
  inverted?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const iconBox =
    size === 'sm' ? 'w-7 h-7 rounded-lg' : size === 'lg' ? 'w-9 h-9 rounded-xl' : 'w-8 h-8 rounded-lg';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <span
        className={`${iconBox} inline-flex items-center justify-center bg-[#171923] text-[#FF9F43] shrink-0`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="3" width="7" height="7" rx="1.2" />
          <rect x="14" y="3" width="7" height="7" rx="1.2" />
          <rect x="3" y="14" width="7" height="7" rx="1.2" />
          <path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M18 18h3v3h-3z" strokeLinecap="round" />
        </svg>
      </span>
      <span
        className={`${textSize} font-bold tracking-tight ${
          inverted ? 'text-white' : 'text-[#171923]'
        }`}
      >
        MENU<span className="text-[#FF9F43]">QR</span>
      </span>
    </span>
  );
}

/**
 * Indian FSSAI-inspired Veg / Non-Veg / Egg dietary mark paired with readable text for accessibility.
 */
export function DietaryMark({
  foodType,
  showLabel = false,
}: {
  foodType: FoodType;
  showLabel?: boolean;
}) {
  const config: Record<
    FoodType,
    { border: string; fill: string; label: string; shape: 'dot' | 'triangle' }
  > = {
    veg: {
      border: 'border-[#239B69]',
      fill: 'bg-[#239B69]',
      label: 'Veg',
      shape: 'dot',
    },
    non_veg: {
      border: 'border-[#C93B2B]',
      fill: 'bg-[#C93B2B]',
      label: 'Non-Veg',
      shape: 'triangle',
    },
    egg: {
      border: 'border-[#C97B16]',
      fill: 'bg-[#C97B16]',
      label: 'Egg',
      shape: 'dot',
    },
    other: {
      border: 'border-[#646B7D]',
      fill: 'bg-[#646B7D]',
      label: 'Other',
      shape: 'dot',
    },
  };

  const c = config[foodType] || config.other;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0" title={c.label}>
      <span
        className={`w-4 h-4 rounded-[3px] border-[1.5px] ${c.border} inline-flex items-center justify-center bg-white shrink-0`}
        aria-label={c.label}
      >
        {c.shape === 'triangle' ? (
          <span
            className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-[#C93B2B]"
            aria-hidden="true"
          />
        ) : (
          <span className={`w-2 h-2 rounded-full ${c.fill}`} aria-hidden="true" />
        )}
      </span>
      {showLabel && <span className="text-xs font-medium text-[#525866]">{c.label}</span>}
    </span>
  );
}

export function SmartImage({
  src,
  alt,
  className = '',
  fallbackLabel,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F4EFE6] text-[#8B8376] ${className}`}
        role="img"
        aria-label={alt}
      >
        <UtensilsCrossed className="w-6 h-6 opacity-60" strokeWidth={1.6} />
        {fallbackLabel && (
          <span className="mt-1.5 text-[11px] font-medium px-2 text-center line-clamp-1 opacity-80">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

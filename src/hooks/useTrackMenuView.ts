import { useEffect, useRef, useState } from 'react';
import { recordPublicMenuEvent } from '../lib/menuService';
import type { Restaurant } from '../types/menuqr';

interface UseTrackMenuViewOptions {
  tableNumber?: string;
  src?: string | null;
}

/**
 * Tracks customer menu views by saving a record in the restaurant's `menu_events`
 * collection whenever a customer opens a published public menu page.
 * Deduplicates per restaurant/source within the active page visit so React
 * double-invocations never inflate counts.
 */
export function useTrackMenuView(
  restaurant: Restaurant | null,
  options: UseTrackMenuViewOptions = {}
): { tracked: boolean } {
  const { tableNumber = '', src = null } = options;
  const trackedKeyRef = useRef<string | null>(null);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (!restaurant || restaurant.isDemo || !restaurant.isPublished || restaurant.isSuspended) {
      return;
    }

    const cleanTable = tableNumber.trim();
    const isQrSource = Boolean(cleanTable) || src === 'qr';
    const source = cleanTable ? `table_${cleanTable}` : isQrSource ? 'qr_code' : 'direct';
    const eventType = isQrSource ? 'qr_scan' : 'menu_view';
    const dedupeKey = `${restaurant.id}:${eventType}:${source}`;

    if (trackedKeyRef.current === dedupeKey) {
      return;
    }

    trackedKeyRef.current = dedupeKey;
    let active = true;

    void recordPublicMenuEvent(restaurant, eventType, source).then(() => {
      if (active) {
        setTracked(true);
      }
    });

    return () => {
      active = false;
    };
  }, [restaurant?.id, restaurant?.isDemo, restaurant?.isPublished, restaurant?.isSuspended, tableNumber, src]);

  return { tracked };
}

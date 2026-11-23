import type { PlanId, Restaurant } from '../types/menuqr';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  audience: string;
  monthlyInr: number;
  priceLabel: string;
  dishLimit: number | null; // null = unlimited
  tableQrEnabled: boolean;
  whatsappOrdering: boolean;
  customBranding: boolean;
  printablePoster: boolean;
  analyticsEnabled: boolean;
  promoBannerEnabled: boolean;
  multiBranch: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    audience: 'For cafes and kitchens testing digital menus',
    monthlyInr: 0,
    priceLabel: '₹0',
    dishLimit: 20,
    tableQrEnabled: false,
    whatsappOrdering: false,
    customBranding: false,
    printablePoster: false,
    analyticsEnabled: false,
    promoBannerEnabled: false,
    multiBranch: false,
    features: [
      '1 restaurant & permanent menu URL',
      'Up to 20 dishes across categories',
      'Basic downloadable QR code (PNG)',
      'Real-time price & availability updates',
      'MENUQR footer branding',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    audience: 'For neighborhood restaurants, bakeries & dhabas',
    monthlyInr: 299,
    priceLabel: '₹299',
    dishLimit: null,
    tableQrEnabled: false,
    whatsappOrdering: false,
    customBranding: true,
    printablePoster: true,
    analyticsEnabled: false,
    promoBannerEnabled: false,
    multiBranch: false,
    features: [
      'Unlimited dishes & menu categories',
      'High-resolution food photography',
      'Custom restaurant accent color & logo',
      'Printable A4 & table-tent QR PDF posters',
      'Priority onboarding support',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    audience: 'For busy dine-in restaurants & popular cafes',
    monthlyInr: 499,
    priceLabel: '₹499',
    dishLimit: null,
    tableQrEnabled: true,
    whatsappOrdering: true,
    customBranding: true,
    printablePoster: true,
    analyticsEnabled: true,
    promoBannerEnabled: true,
    multiBranch: false,
    features: [
      'Everything in Starter',
      'WhatsApp quick-order button on menu',
      'Table-specific QR codes (Table 1, 2, 3...)',
      'AI Tracking Analytics & diner conversion funnel',
      'Top promotional announcement banners',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    audience: 'For multi-outlet brands & cloud kitchen chains',
    monthlyInr: 999,
    priceLabel: '₹999',
    dishLimit: null,
    tableQrEnabled: true,
    whatsappOrdering: true,
    customBranding: true,
    printablePoster: true,
    analyticsEnabled: true,
    promoBannerEnabled: true,
    multiBranch: true,
    features: [
      'Everything in Growth',
      'Full AI Menu Engineering & peak-hour forecasting',
      'Multiple restaurant branches under one account',
      'Staff & manager team accounts',
      'Priority Premium Owner ID & audit logs',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'growth', 'pro'];

export function getEffectivePlan(restaurant: Restaurant | null): PlanDefinition {
  if (!restaurant) return PLANS.free;
  if (restaurant.plan !== 'free' && restaurant.subscriptionStatus !== 'active') {
    return PLANS.free;
  }
  return PLANS[restaurant.plan] ?? PLANS.free;
}

export function canAddMoreDishes(restaurant: Restaurant, currentDishCount: number): boolean {
  const plan = getEffectivePlan(restaurant);
  if (plan.dishLimit === null) return true;
  return currentDishCount < plan.dishLimit;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function hasActiveDiscount(item: { price: number; discountPrice?: number }): boolean {
  return (
    typeof item.discountPrice === 'number' &&
    Number.isFinite(item.discountPrice) &&
    item.discountPrice > 0 &&
    item.discountPrice < item.price
  );
}

export function getEffectiveDishPrice(item: { price: number; discountPrice?: number }): number {
  return hasActiveDiscount(item) ? Number(item.discountPrice) : item.price;
}

export function getDiscountPercent(item: { price: number; discountPrice?: number }): number {
  if (!hasActiveDiscount(item) || item.price <= 0) return 0;
  return Math.max(1, Math.round(((item.price - Number(item.discountPrice)) / item.price) * 100));
}

/**
 * Modular Payment Gateway Adapter interface (Razorpay-ready for Phase 2 billing).
 * Initial MVP uses manual admin activation so no fake checkout is ever simulated.
 */
export interface PaymentGatewayAdapter {
  provider: 'manual_admin' | 'razorpay';
  isLiveCheckoutEnabled: boolean;
  requestUpgradeNote: string;
}

export const ACTIVE_PAYMENT_GATEWAY: PaymentGatewayAdapter = {
  provider: 'manual_admin',
  isLiveCheckoutEnabled: false,
  requestUpgradeNote:
    'During our Delhi NCR launch, paid plans are activated directly by a MENUQR administrator after UPI/invoice confirmation. Automated Razorpay billing plugs into this adapter next.',
};

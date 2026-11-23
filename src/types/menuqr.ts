import type { Timestamp } from 'firebase/firestore';

export type RestaurantType =
  | 'cafe'
  | 'restaurant'
  | 'dhaba'
  | 'bakery'
  | 'cloud_kitchen'
  | 'dessert_shop'
  | 'other';

export type FoodType = 'veg' | 'non_veg' | 'egg' | 'other';

export type PlanId = 'free' | 'starter' | 'growth' | 'pro';

export type SubscriptionStatus = 'active' | 'inactive' | 'expired';

export type MemberRole = 'owner' | 'manager' | 'staff';

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt?: Timestamp | string | null;
  updatedAt?: Timestamp | string | null;
}

export interface Restaurant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  restaurantType: RestaurantType;
  description: string;
  logoUrl: string;
  coverUrl: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  openingHours: string;
  whatsappNumber: string;
  promoBanner: string;
  paymentQrUrl?: string;
  upiId?: string;
  googleReviewUrl?: string;
  currency: 'INR';
  theme: string;
  isPublished: boolean;
  isSuspended: boolean;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string;
  premiumPassId?: string;
  dishCount: number;
  categoryCount: number;
  onboardingStep: number;
  createdAt?: Timestamp | string | null;
  updatedAt?: Timestamp | string | null;
  isDemo?: boolean;
}

export interface Category {
  id: string;
  restaurantId: string;
  ownerId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isPublished: boolean;
  createdAt?: Timestamp | string | null;
  updatedAt?: Timestamp | string | null;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  ownerId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  imageUrl: string;
  foodType: FoodType;
  isAvailable: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  sortOrder: number;
  createdAt?: Timestamp | string | null;
  updatedAt?: Timestamp | string | null;
}

export interface QrCodeRecord {
  id: string;
  restaurantId: string;
  ownerId: string;
  label: string;
  tableNumber: string;
  destinationUrl: string;
  createdAt?: Timestamp | string | null;
}

export interface SubscriptionRecord {
  id: string;
  restaurantId: string;
  ownerId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  startedAt?: Timestamp | string | null;
  expiresAt: string;
  notes: string;
}

export type MenuEventType =
  | 'qr_scan'
  | 'menu_view'
  | 'dish_view'
  | 'add_to_cart'
  | 'upi_pay_click'
  | 'review_click';

export interface MenuEvent {
  id: string;
  restaurantId: string;
  ownerId: string;
  eventType: MenuEventType;
  source: string;
  dishId?: string;
  dishName?: string;
  categoryName?: string;
  amountInr?: number;
  upiApp?: string;
  createdAt?: Timestamp | string | null;
}

export interface PremiumPass {
  id: string;
  tier: 'growth' | 'pro';
  assignedEmail: string;
  status: 'active' | 'redeemed' | 'revoked';
  redeemedByUid: string;
  redeemedRestaurantId: string;
  expiresAt: string;
  notes: string;
  createdByUid: string;
  createdAt?: Timestamp | string | null;
  redeemedAt?: Timestamp | string | null;
}

export interface AuditLog {
  id: string;
  restaurantId: string;
  ownerId: string;
  userId: string;
  action: string;
  details: string;
  createdAt?: Timestamp | string | null;
}

export const RESTAURANT_TYPE_LABELS: Record<RestaurantType, string> = {
  cafe: 'Cafe',
  restaurant: 'Restaurant',
  dhaba: 'Dhaba',
  bakery: 'Bakery',
  cloud_kitchen: 'Cloud Kitchen',
  dessert_shop: 'Dessert Shop',
  other: 'Other',
};

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  veg: 'Vegetarian',
  non_veg: 'Non-Vegetarian',
  egg: 'Contains Egg',
  other: 'Beverage / Other',
};

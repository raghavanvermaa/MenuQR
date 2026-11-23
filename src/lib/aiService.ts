import { auth } from './firebase';
import type { Category, FoodType, MenuItem, Restaurant } from '../types/menuqr';

export interface ScannedDish {
  name: string;
  category: string;
  description: string;
  price: number;
  foodType: FoodType;
}

export interface ScanMenuResponse {
  categories: string[];
  dishes: ScannedDish[];
}

export interface DishCopyResponse {
  description: string;
  suggestedPriceInr: number;
  foodType: FoodType;
  pairingTip: string;
}

export interface HindiTranslationResponse {
  restaurantDescription: string;
  promoBanner: string;
  categories: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; description: string }>;
}

export interface MenuAssistantResponse {
  answer: string;
  recommendedDishNames: string[];
}

async function getBearerHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to use owner AI tools.');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function aiScanPaperMenu(file: File): Promise<ScanMenuResponse> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Upload a JPG, PNG, or WebP photo of your printed menu.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Menu photo must be smaller than 5 MB.');
  }

  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read menu image.'));
    reader.readAsDataURL(file);
  });

  const headers = await getBearerHeader();
  const res = await fetch('/api/ai/scan-menu', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mimeType: file.type, dataBase64 }),
  });

  const payload = (await res.json()) as ScanMenuResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Failed to scan menu image.');
  }
  return payload;
}

export async function aiGenerateDishCopy(params: {
  dishName: string;
  categoryName: string;
  foodType: FoodType;
  restaurant: Restaurant;
}): Promise<DishCopyResponse> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/ai/dish-copy', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      dishName: params.dishName,
      categoryName: params.categoryName,
      foodType: params.foodType,
      restaurantName: params.restaurant.name,
      restaurantType: params.restaurant.restaurantType,
      city: params.restaurant.city,
    }),
  });

  const payload = (await res.json()) as DishCopyResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Failed to generate dish description.');
  }
  return payload;
}

export async function aiTranslateMenuToHindi(params: {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
}): Promise<HindiTranslationResponse> {
  const payloadObj = {
    restaurantId: params.restaurant.id,
    restaurantName: params.restaurant.name,
    restaurantDescription: params.restaurant.description || '',
    promoBanner: params.restaurant.promoBanner || '',
    categories: params.categories.map((c) => ({ id: c.id, name: c.name })),
    items: params.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description || '',
    })),
  };

  const cacheKey = `menuqr_hi_${params.restaurant.id}_${payloadObj.categories.length}_${payloadObj.items.length}_${payloadObj.items
    .slice(0, 8)
    .map((i) => i.name)
    .join('|')
    .slice(0, 120)}`;

  try {
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw) as HindiTranslationResponse;
      if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.categories)) {
        return parsed;
      }
    }
  } catch {
    // Ignore sessionStorage restrictions
  }

  const res = await fetch('/api/ai/translate-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadObj),
  });

  const text = await res.text();
  let payload: (HindiTranslationResponse & { error?: string }) | null = null;
  try {
    payload = JSON.parse(text) as HindiTranslationResponse & { error?: string };
  } catch {
    payload = null;
  }

  if (!res.ok || !payload) {
    throw new Error(payload?.error || 'Could not translate menu to Hindi right now. Please retry.');
  }

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }

  return payload;
}

export async function aiAskMenuAssistant(params: {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
  question: string;
  language: 'en' | 'hi';
}): Promise<MenuAssistantResponse> {
  const catMap = new Map(params.categories.map((c) => [c.id, c.name]));
  const res = await fetch('/api/ai/menu-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantName: params.restaurant.name,
      restaurantType: params.restaurant.restaurantType,
      city: params.restaurant.city,
      language: params.language,
      question: params.question,
      menuSummary: params.items.map((item) => ({
        name: item.name,
        category: catMap.get(item.categoryId) || 'Menu',
        price: item.price,
        foodType: item.foodType,
        description: item.description,
        isAvailable: item.isAvailable,
        isFeatured: item.isFeatured,
      })),
    }),
  });

  const payload = (await res.json()) as MenuAssistantResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Menu assistant could not reply right now.');
  }
  return payload;
}

export interface GroundedGooglePlace {
  title: string;
  uri: string;
  reviewSnippet?: string;
}

export interface FindGooglePlaceResponse {
  summary: string;
  places: GroundedGooglePlace[];
}

export async function aiFindGooglePlace(params: {
  restaurantName: string;
  city: string;
  address?: string;
}): Promise<FindGooglePlaceResponse> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/ai/find-google-place', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const payload = (await res.json()) as FindGooglePlaceResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Could not look up Google Maps listing right now.');
  }
  return payload;
}

export interface AiMenuEngineeringItem {
  dishName: string;
  tag: 'Star' | 'Hidden Gem' | 'Price Opportunity' | 'Needs Boost';
  insight: string;
  recommendedAction: string;
}

export interface AiAnalyticsReport {
  executiveSummary: string;
  healthScore: number;
  healthGrade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  healthLabel: string;
  peakTrafficInsight: string;
  menuEngineering: AiMenuEngineeringItem[];
  conversionFunnelAdvice: string[];
  growthForecast: string;
}

export interface AiAnalyticsInputPayload {
  restaurantName: string;
  restaurantType: string;
  city: string;
  plan: string;
  rangeLabel: string;
  metrics: {
    totalEvents: number;
    menuViews: number;
    qrScans: number;
    dishViews: number;
    cartAdds: number;
    upiPayClicks: number;
    reviewClicks: number;
    cartIntentValueInr: number;
    upiIntentValueInr: number;
    hasPaymentQrOrUpi: boolean;
    hasGoogleReviewUrl: boolean;
    isPublished: boolean;
    totalDishes: number;
    availableDishes: number;
    discountedDishes: number;
    avgDishPriceInr: number;
    peakBandLabel: string;
    serviceBands: Array<{ label: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
    topDishes: Array<{ name: string; views: number; cartAdds: number; price: number }>;
    zeroEngagementDishes: Array<{ name: string; price: number; category: string }>;
    upiAppBreakdown: Array<{ app: string; count: number }>;
  };
}

export async function aiGenerateTrackingAnalytics(
  input: AiAnalyticsInputPayload
): Promise<AiAnalyticsReport> {
  const headers = await getBearerHeader();
  const res = await fetch('/api/ai/analytics', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  const payload = (await res.json()) as AiAnalyticsReport & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Could not generate AI tracking analytics right now.');
  }
  return payload;
}

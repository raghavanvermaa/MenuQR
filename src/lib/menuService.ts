import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { canAddMoreDishes, getEffectivePlan } from './plans';
import type {
  AuditLog,
  Category,
  FoodType,
  MenuEvent,
  MenuEventType,
  MenuItem,
  PlanId,
  PremiumPass,
  Profile,
  QrCodeRecord,
  Restaurant,
  RestaurantType,
  SubscriptionRecord,
  SubscriptionStatus,
} from '../types/menuqr';
import { DEMO_CATEGORIES, DEMO_ITEMS, DEMO_RESTAURANT, DEMO_SLUG } from '../data/demoRestaurant';

export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

export function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return cleaned.length >= 2 ? cleaned : `menu-${Math.random().toString(36).slice(2, 6)}`;
}

export function getPublicMenuUrl(slug: string, tableNumber?: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${base}/menu/${slug}`;
  if (tableNumber && tableNumber.trim()) {
    return `${url}?table=${encodeURIComponent(tableNumber.trim())}`;
  }
  return url;
}

export function sanitizeOptionalUrl(url: string): string {
  const trimmed = url.trim().slice(0, 500);
  if (!trimmed) return '';
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    /^\/uploads\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(trimmed) ||
    /^\/src\/assets\/images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

// --- Image Upload via Server ---
export async function uploadImageFile(file: File): Promise<string> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Please upload a JPG, PNG, or WebP image.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image size must be 5 MB or less.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to upload images.');
  }
  const idToken = await user.getIdToken();

  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      dataBase64,
    }),
  });

  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error || 'Image upload failed. Please try again.');
  }
  return payload.url;
}

// --- Profile ---
export async function upsertProfile(data: {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
}): Promise<Profile> {
  const path = `profiles/${data.uid}`;
  const ref = doc(db, 'profiles', data.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as Profile;
      const updated = {
        fullName: (data.fullName || existing.fullName || 'Restaurant Owner').trim().slice(0, 100),
        phone: (data.phone ?? existing.phone ?? '').trim().slice(0, 24),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(ref, updated);
      return { ...existing, fullName: updated.fullName, phone: updated.phone };
    } else {
      const payload = {
        id: data.uid,
        fullName: (data.fullName || 'Restaurant Owner').trim().slice(0, 100),
        email: data.email.trim().slice(0, 150),
        phone: (data.phone || '').trim().slice(0, 24),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload);
      return {
        id: payload.id,
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const path = `profiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'profiles', uid));
    return snap.exists() ? (snap.data() as Profile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// --- Slug Uniqueness ---
export async function isSlugAvailable(rawSlug: string): Promise<boolean> {
  const slug = slugify(rawSlug);
  if (slug === DEMO_SLUG) return false;
  const path = `slugs/${slug}`;
  try {
    const snap = await getDoc(doc(db, 'slugs', slug));
    return !snap.exists();
  } catch (error) {
    // If permission denied on an existing unpublished slug owned by someone else, it is NOT available
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
      return false;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function findUniqueSlug(baseName: string): Promise<string> {
  const base = slugify(baseName);
  if (await isSlugAvailable(base)) return base;
  for (let i = 2; i <= 15; i += 1) {
    const candidate = `${base.slice(0, 56)}-${i}`;
    if (await isSlugAvailable(candidate)) return candidate;
  }
  return `${base.slice(0, 48)}-${Math.random().toString(36).slice(2, 7)}`;
}

// --- Restaurant CRUD ---
export async function listOwnerRestaurants(ownerId: string): Promise<Restaurant[]> {
  const path = 'restaurants';
  try {
    const q = query(collection(db, 'restaurants'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Restaurant);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createRestaurant(input: {
  ownerId: string;
  name: string;
  slug?: string;
  restaurantType: RestaurantType;
  description: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  coverUrl?: string;
  theme?: string;
}): Promise<Restaurant> {
  const restaurantId = makeId('rest');
  const desiredSlug = input.slug ? slugify(input.slug) : await findUniqueSlug(input.name);
  const available = await isSlugAvailable(desiredSlug);
  const slug = available ? desiredSlug : await findUniqueSlug(desiredSlug);
  let currentPath = `restaurants/${restaurantId}`;

  try {
    // Ensure Firestore receives a fresh auth token for the signed-in user
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const tokenRes = await currentUser.getIdTokenResult();
        if (currentUser.emailVerified && !tokenRes.claims.email_verified) {
          await currentUser.getIdToken(true);
        }
      } catch {
        // Continue with current session token
      }
    }

    const now = serverTimestamp();

    const restaurantData = {
      id: restaurantId,
      ownerId: input.ownerId,
      name: input.name.trim().slice(0, 100),
      slug,
      restaurantType: input.restaurantType,
      description: input.description.trim().slice(0, 500),
      logoUrl: sanitizeOptionalUrl(input.logoUrl || ''),
      coverUrl: sanitizeOptionalUrl(input.coverUrl || ''),
      city: input.city.trim().slice(0, 80) || 'New Delhi',
      address: input.address.trim().slice(0, 250),
      phone: input.phone.trim().slice(0, 24),
      email: input.email.trim().slice(0, 150),
      openingHours: 'Daily · 10:00 AM – 10:30 PM',
      whatsappNumber: '',
      promoBanner: '',
      paymentQrUrl: '',
      upiId: '',
      googleReviewUrl: '',
      currency: 'INR' as const,
      theme: /^#[0-9A-Fa-f]{6}$/.test(input.theme || '') ? (input.theme as string) : '#FF9F43',
      isPublished: false,
      isSuspended: false,
      plan: 'free' as PlanId,
      subscriptionStatus: 'active' as SubscriptionStatus,
      subscriptionExpiresAt: '',
      dishCount: 0,
      categoryCount: 0,
      onboardingStep: 2,
      createdAt: now,
      updatedAt: now,
    };

    // Step 1: Create the primary restaurant document first so subcollections and slug
    // can validate ownership cleanly against the committed restaurant document.
    await setDoc(doc(db, 'restaurants', restaurantId), restaurantData);

    // Step 2: Write companion slug, owner member, default QR code, free subscription, and audit log
    const batch = writeBatch(db);
    const companionNow = serverTimestamp();

    const slugData = {
      slug,
      restaurantId,
      ownerId: input.ownerId,
      isPublished: false,
      isSuspended: false,
      createdAt: companionNow,
    };

    const memberId = input.ownerId;
    const memberData = {
      id: memberId,
      restaurantId,
      ownerId: input.ownerId,
      userId: input.ownerId,
      role: 'owner' as const,
      createdAt: companionNow,
    };

    const qrId = makeId('qr');
    const qrData = {
      id: qrId,
      restaurantId,
      ownerId: input.ownerId,
      label: 'Primary Restaurant Menu',
      tableNumber: '',
      destinationUrl: getPublicMenuUrl(slug),
      createdAt: companionNow,
    };

    const subId = makeId('sub');
    const subData = {
      id: subId,
      restaurantId,
      ownerId: input.ownerId,
      plan: 'free' as PlanId,
      status: 'active' as SubscriptionStatus,
      startedAt: companionNow,
      expiresAt: '',
      notes: 'Initial Free tier activated on registration',
    };

    const logId = makeId('log');
    const logData = {
      id: logId,
      restaurantId,
      ownerId: input.ownerId,
      userId: input.ownerId,
      action: 'restaurant.created',
      details: `Created ${restaurantData.name} (/menu/${slug})`,
      createdAt: companionNow,
    };

    currentPath = `slugs/${slug} & restaurants/${restaurantId}/subcollections`;
    batch.set(doc(db, 'slugs', slug), slugData);
    batch.set(doc(db, 'restaurants', restaurantId, 'members', memberId), memberData);
    batch.set(doc(db, 'restaurants', restaurantId, 'qr_codes', qrId), qrData);
    batch.set(doc(db, 'restaurants', restaurantId, 'subscriptions', subId), subData);
    batch.set(doc(db, 'restaurants', restaurantId, 'audit_logs', logId), logData);

    await batch.commit();

    return {
      ...restaurantData,
      createdAt: null,
      updatedAt: null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, currentPath);
  }
}

export async function updateRestaurantProfile(
  restaurant: Restaurant,
  updates: Partial<
    Pick<
      Restaurant,
      | 'name'
      | 'restaurantType'
      | 'description'
      | 'logoUrl'
      | 'coverUrl'
      | 'city'
      | 'address'
      | 'phone'
      | 'email'
      | 'openingHours'
      | 'whatsappNumber'
      | 'promoBanner'
      | 'paymentQrUrl'
      | 'upiId'
      | 'googleReviewUrl'
      | 'theme'
      | 'onboardingStep'
    >
  >
): Promise<void> {
  const path = `restaurants/${restaurant.id}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 100);
    if (updates.restaurantType !== undefined) clean.restaurantType = updates.restaurantType;
    if (updates.description !== undefined) clean.description = updates.description.trim().slice(0, 500);
    if (updates.logoUrl !== undefined) clean.logoUrl = sanitizeOptionalUrl(updates.logoUrl);
    if (updates.coverUrl !== undefined) clean.coverUrl = sanitizeOptionalUrl(updates.coverUrl);
    if (updates.city !== undefined) clean.city = updates.city.trim().slice(0, 80);
    if (updates.address !== undefined) clean.address = updates.address.trim().slice(0, 250);
    if (updates.phone !== undefined) clean.phone = updates.phone.trim().slice(0, 24);
    if (updates.email !== undefined) clean.email = updates.email.trim().slice(0, 150);
    if (updates.openingHours !== undefined) clean.openingHours = updates.openingHours.trim().slice(0, 120);
    if (updates.whatsappNumber !== undefined) clean.whatsappNumber = updates.whatsappNumber.trim().slice(0, 24);
    if (updates.promoBanner !== undefined) clean.promoBanner = updates.promoBanner.trim().slice(0, 160);
    if (updates.paymentQrUrl !== undefined) clean.paymentQrUrl = sanitizeOptionalUrl(updates.paymentQrUrl);
    if (updates.upiId !== undefined) clean.upiId = updates.upiId.trim().slice(0, 100);
    if (updates.googleReviewUrl !== undefined) {
      clean.googleReviewUrl = sanitizeOptionalUrl(updates.googleReviewUrl);
    }
    if (updates.theme !== undefined && /^#[0-9A-Fa-f]{6}$/.test(updates.theme)) {
      clean.theme = updates.theme;
    }
    if (updates.onboardingStep !== undefined) {
      clean.onboardingStep = Math.min(4, Math.max(1, Math.round(updates.onboardingStep)));
    }

    await updateDoc(doc(db, 'restaurants', restaurant.id), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setRestaurantPublished(
  restaurant: Restaurant,
  isPublished: boolean,
  categories: Category[],
  items: MenuItem[]
): Promise<void> {
  const path = `restaurants/${restaurant.id}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.update(doc(db, 'restaurants', restaurant.id), {
      isPublished,
      onboardingStep: isPublished ? 4 : restaurant.onboardingStep,
      updatedAt: now,
    });
    batch.update(doc(db, 'slugs', restaurant.slug), {
      isPublished,
    });

    for (const cat of categories) {
      batch.update(doc(db, 'restaurants', restaurant.id, 'categories', cat.id), {
        isPublished,
        updatedAt: now,
      });
    }

    for (const item of items) {
      batch.update(doc(db, 'restaurants', restaurant.id, 'menu_items', item.id), {
        isPublished,
        updatedAt: now,
      });
    }

    const logId = makeId('log');
    batch.set(doc(db, 'restaurants', restaurant.id, 'audit_logs', logId), {
      id: logId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      userId: auth.currentUser?.uid || restaurant.ownerId,
      action: isPublished ? 'menu.published' : 'menu.unpublished',
      details: isPublished ? 'Published digital menu publicly' : 'Set digital menu to draft',
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Categories CRUD ---
export async function listCategories(restaurantId: string, ownerId: string): Promise<Category[]> {
  const path = `restaurants/${restaurantId}/categories`;
  try {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'categories'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Category)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createCategory(
  restaurant: Restaurant,
  name: string,
  sortOrder: number
): Promise<Category> {
  const categoryId = makeId('cat');
  const path = `restaurants/${restaurant.id}/categories/${categoryId}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    const payload = {
      id: categoryId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      name: name.trim().slice(0, 60),
      sortOrder: Math.max(0, Math.round(sortOrder)),
      isActive: true,
      isPublished: restaurant.isPublished && !restaurant.isSuspended,
      createdAt: now,
      updatedAt: now,
    };

    const safeCurrentCount =
      typeof restaurant.categoryCount === 'number' && Number.isFinite(restaurant.categoryCount)
        ? Math.max(0, Math.floor(restaurant.categoryCount))
        : 0;

    batch.set(doc(db, 'restaurants', restaurant.id, 'categories', categoryId), payload);
    batch.update(doc(db, 'restaurants', restaurant.id), {
      categoryCount: safeCurrentCount + 1,
      updatedAt: now,
    });

    await batch.commit();
    return { ...payload, createdAt: null, updatedAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  updates: Partial<Pick<Category, 'name' | 'sortOrder' | 'isActive'>>
): Promise<void> {
  const path = `restaurants/${restaurantId}/categories/${categoryId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 60);
    if (updates.sortOrder !== undefined) clean.sortOrder = Math.max(0, Math.round(updates.sortOrder));
    if (updates.isActive !== undefined) clean.isActive = updates.isActive;

    await updateDoc(doc(db, 'restaurants', restaurantId, 'categories', categoryId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function reorderCategories(restaurantId: string, orderedIds: string[]): Promise<void> {
  const path = `restaurants/${restaurantId}/categories`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    orderedIds.forEach((id, index) => {
      batch.update(doc(db, 'restaurants', restaurantId, 'categories', id), {
        sortOrder: index,
        updatedAt: now,
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Safe category deletion: either reassigns associated dishes to another category
 * OR explicitly deletes them when confirmed by the restaurant owner.
 */
export async function deleteCategorySafely(
  restaurant: Restaurant,
  categoryId: string,
  associatedItems: MenuItem[],
  reassignToCategoryId: string | null
): Promise<void> {
  const path = `restaurants/${restaurant.id}/categories/${categoryId}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    let deletedDishes = 0;
    for (const item of associatedItems) {
      const itemRef = doc(db, 'restaurants', restaurant.id, 'menu_items', item.id);
      if (reassignToCategoryId) {
        batch.update(itemRef, {
          categoryId: reassignToCategoryId,
          updatedAt: now,
        });
      } else {
        batch.delete(itemRef);
        deletedDishes += 1;
      }
    }

    batch.delete(doc(db, 'restaurants', restaurant.id, 'categories', categoryId));
    batch.update(doc(db, 'restaurants', restaurant.id), {
      categoryCount: Math.max(0, restaurant.categoryCount - 1),
      dishCount: Math.max(0, restaurant.dishCount - deletedDishes),
      updatedAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Menu Items CRUD ---
export async function listMenuItems(restaurantId: string, ownerId: string): Promise<MenuItem[]> {
  const path = `restaurants/${restaurantId}/menu_items`;
  try {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'menu_items'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as MenuItem)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createMenuItem(
  restaurant: Restaurant,
  input: {
    categoryId: string;
    name: string;
    description: string;
    price: number;
    discountPrice?: number;
    imageUrl: string;
    foodType: FoodType;
    isAvailable: boolean;
    isFeatured: boolean;
    sortOrder: number;
  }
): Promise<MenuItem> {
  if (!canAddMoreDishes(restaurant, restaurant.dishCount)) {
    throw new Error(
      'You have reached the 20-dish limit on the Free plan. Upgrade to Starter (₹299/month) for unlimited dishes.'
    );
  }
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > 100000) {
    throw new Error('Price must be between ₹0 and ₹1,00,000.');
  }
  const cleanDiscount =
    typeof input.discountPrice === 'number' &&
    Number.isFinite(input.discountPrice) &&
    input.discountPrice > 0 &&
    input.discountPrice < input.price
      ? Math.min(100000, Number(input.discountPrice))
      : 0;

  const itemId = makeId('dish');
  const path = `restaurants/${restaurant.id}/menu_items/${itemId}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    const payload = {
      id: itemId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      categoryId: input.categoryId,
      name: input.name.trim().slice(0, 100),
      description: input.description.trim().slice(0, 400),
      price: Number(input.price),
      discountPrice: cleanDiscount,
      imageUrl: sanitizeOptionalUrl(input.imageUrl),
      foodType: input.foodType,
      isAvailable: input.isAvailable,
      isFeatured: input.isFeatured,
      isPublished: restaurant.isPublished && !restaurant.isSuspended,
      sortOrder: Math.max(0, Math.round(input.sortOrder)),
      createdAt: now,
      updatedAt: now,
    };

    batch.set(doc(db, 'restaurants', restaurant.id, 'menu_items', itemId), payload);
    batch.update(doc(db, 'restaurants', restaurant.id), {
      dishCount: restaurant.dishCount + 1,
      onboardingStep: Math.max(restaurant.onboardingStep, 3),
      updatedAt: now,
    });

    await batch.commit();
    return { ...payload, createdAt: null, updatedAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMenuItem(
  restaurantId: string,
  itemId: string,
  updates: Partial<
    Pick<
      MenuItem,
      | 'categoryId'
      | 'name'
      | 'description'
      | 'price'
      | 'discountPrice'
      | 'imageUrl'
      | 'foodType'
      | 'isAvailable'
      | 'isFeatured'
      | 'sortOrder'
    >
  >
): Promise<void> {
  const path = `restaurants/${restaurantId}/menu_items/${itemId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.categoryId !== undefined) clean.categoryId = updates.categoryId;
    if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 100);
    if (updates.description !== undefined) clean.description = updates.description.trim().slice(0, 400);
    if (updates.price !== undefined) {
      if (!Number.isFinite(updates.price) || updates.price < 0 || updates.price > 100000) {
        throw new Error('Price must be between ₹0 and ₹1,00,000.');
      }
      clean.price = Number(updates.price);
    }
    if (updates.discountPrice !== undefined) {
      const dp = Number(updates.discountPrice);
      if (!Number.isFinite(dp) || dp < 0 || dp > 100000) {
        throw new Error('Discounted price must be between ₹0 and ₹1,00,000.');
      }
      clean.discountPrice = dp;
    }
    if (updates.imageUrl !== undefined) clean.imageUrl = sanitizeOptionalUrl(updates.imageUrl);
    if (updates.foodType !== undefined) clean.foodType = updates.foodType;
    if (updates.isAvailable !== undefined) clean.isAvailable = updates.isAvailable;
    if (updates.isFeatured !== undefined) clean.isFeatured = updates.isFeatured;
    if (updates.sortOrder !== undefined) clean.sortOrder = Math.max(0, Math.round(updates.sortOrder));

    await updateDoc(doc(db, 'restaurants', restaurantId, 'menu_items', itemId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function reorderMenuItems(restaurantId: string, orderedIds: string[]): Promise<void> {
  const path = `restaurants/${restaurantId}/menu_items`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    orderedIds.forEach((id, index) => {
      batch.update(doc(db, 'restaurants', restaurantId, 'menu_items', id), {
        sortOrder: index,
        updatedAt: now,
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMenuItem(restaurant: Restaurant, itemId: string): Promise<void> {
  const path = `restaurants/${restaurant.id}/menu_items/${itemId}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.delete(doc(db, 'restaurants', restaurant.id, 'menu_items', itemId));
    batch.update(doc(db, 'restaurants', restaurant.id), {
      dishCount: Math.max(0, restaurant.dishCount - 1),
      updatedAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- QR Codes ---
export async function listQrCodes(restaurantId: string, ownerId: string): Promise<QrCodeRecord[]> {
  const path = `restaurants/${restaurantId}/qr_codes`;
  try {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'qr_codes'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as QrCodeRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createTableQrCode(
  restaurant: Restaurant,
  label: string,
  tableNumber: string
): Promise<QrCodeRecord> {
  const plan = getEffectivePlan(restaurant);
  if (tableNumber.trim() && !plan.tableQrEnabled) {
    throw new Error('Table-specific QR codes require the Growth (₹499/mo) or Pro plan.');
  }
  const qrId = makeId('qr');
  const path = `restaurants/${restaurant.id}/qr_codes/${qrId}`;
  try {
    const payload = {
      id: qrId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      label: label.trim().slice(0, 60) || `Table ${tableNumber.trim()}`,
      tableNumber: tableNumber.trim().slice(0, 20),
      destinationUrl: getPublicMenuUrl(restaurant.slug, tableNumber.trim()),
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'restaurants', restaurant.id, 'qr_codes', qrId), payload);
    return { ...payload, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteQrCode(restaurantId: string, qrId: string): Promise<void> {
  const path = `restaurants/${restaurantId}/qr_codes/${qrId}`;
  try {
    await deleteDoc(doc(db, 'restaurants', restaurantId, 'qr_codes', qrId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Real Analytics (menu_events) & Audit Logs ---
export async function listMenuEvents(restaurantId: string, ownerId: string): Promise<MenuEvent[]> {
  const path = `restaurants/${restaurantId}/menu_events`;
  try {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'menu_events'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as MenuEvent);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function recordPublicMenuEvent(
  restaurant: Restaurant,
  eventType: MenuEventType,
  source: string,
  meta?: {
    dishId?: string;
    dishName?: string;
    categoryName?: string;
    amountInr?: number;
    upiApp?: string;
  }
): Promise<void> {
  if (restaurant.isDemo || !restaurant.isPublished || restaurant.isSuspended) return;
  const eventId = makeId('evt');
  try {
    const payload: Record<string, unknown> = {
      id: eventId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      eventType,
      source: source.slice(0, 40),
      createdAt: serverTimestamp(),
    };
    if (meta?.dishId) payload.dishId = meta.dishId.slice(0, 128);
    if (meta?.dishName) payload.dishName = meta.dishName.slice(0, 100);
    if (meta?.categoryName) payload.categoryName = meta.categoryName.slice(0, 60);
    if (typeof meta?.amountInr === 'number' && Number.isFinite(meta.amountInr) && meta.amountInr >= 0) {
      payload.amountInr = Math.min(500000, Math.round(meta.amountInr * 100) / 100);
    }
    if (meta?.upiApp) payload.upiApp = meta.upiApp.slice(0, 30);

    await setDoc(doc(db, 'restaurants', restaurant.id, 'menu_events', eventId), payload);
  } catch {
    // Non-blocking analytics failure should never break customer menu browsing
  }
}

export async function listAuditLogs(restaurantId: string, ownerId: string): Promise<AuditLog[]> {
  const path = `restaurants/${restaurantId}/audit_logs`;
  try {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'audit_logs'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AuditLog);
  } catch {
    // Fallback without orderBy index if composite index isn't built yet
    const q = query(
      collection(db, 'restaurants', restaurantId, 'audit_logs'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AuditLog);
  }
}

export async function listSubscriptions(
  restaurantId: string,
  ownerId: string
): Promise<SubscriptionRecord[]> {
  const path = `restaurants/${restaurantId}/subscriptions`;
  try {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'subscriptions'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SubscriptionRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// --- Public Customer Menu Loader ---
export interface PublicMenuPayload {
  status: 'found' | 'unpublished' | 'not_found';
  restaurant?: Restaurant;
  categories?: Category[];
  items?: MenuItem[];
}

export async function loadPublicMenuBySlug(slug: string): Promise<PublicMenuPayload> {
  const cleanSlug = slug.toLowerCase().trim();

  // Isolated Demo Restaurant — never mixed with customer records
  if (cleanSlug === DEMO_SLUG) {
    return {
      status: 'found',
      restaurant: DEMO_RESTAURANT,
      categories: DEMO_CATEGORIES,
      items: DEMO_ITEMS,
    };
  }

  try {
    const slugSnap = await getDoc(doc(db, 'slugs', cleanSlug));
    if (!slugSnap.exists()) {
      return { status: 'not_found' };
    }
    const slugData = slugSnap.data() as {
      restaurantId: string;
      isPublished: boolean;
      isSuspended: boolean;
      ownerId: string;
    };

    const isOwnerViewing = auth.currentUser?.uid === slugData.ownerId;
    if ((!slugData.isPublished || slugData.isSuspended) && !isOwnerViewing) {
      return { status: 'unpublished' };
    }

    const restSnap = await getDoc(doc(db, 'restaurants', slugData.restaurantId));
    if (!restSnap.exists()) {
      return { status: 'not_found' };
    }
    const restaurant = restSnap.data() as Restaurant;
    if ((!restaurant.isPublished || restaurant.isSuspended) && !isOwnerViewing) {
      return { status: 'unpublished' };
    }

    const catQuery = isOwnerViewing
      ? query(
          collection(db, 'restaurants', restaurant.id, 'categories'),
          where('ownerId', '==', restaurant.ownerId)
        )
      : query(
          collection(db, 'restaurants', restaurant.id, 'categories'),
          where('isPublished', '==', true)
        );

    const itemQuery = isOwnerViewing
      ? query(
          collection(db, 'restaurants', restaurant.id, 'menu_items'),
          where('ownerId', '==', restaurant.ownerId)
        )
      : query(
          collection(db, 'restaurants', restaurant.id, 'menu_items'),
          where('isPublished', '==', true)
        );

    const [catSnap, itemSnap] = await Promise.all([getDocs(catQuery), getDocs(itemQuery)]);

    const categories = catSnap.docs
      .map((d) => d.data() as Category)
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const items = itemSnap.docs
      .map((d) => d.data() as MenuItem)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      status: 'found',
      restaurant,
      categories,
      items,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
      // Unpublished or suspended restaurant rejected securely by Firestore rules
      return { status: 'unpublished' };
    }
    return { status: 'not_found' };
  }
}

// --- Platform Administration (Admin-Only) ---
export async function adminListAllRestaurants(): Promise<Restaurant[]> {
  const path = 'restaurants';
  try {
    const snap = await getDocs(collection(db, 'restaurants'));
    return snap.docs.map((d) => d.data() as Restaurant);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminUpdateRestaurantSubscription(
  restaurant: Restaurant,
  params: {
    plan: PlanId;
    subscriptionStatus: SubscriptionStatus;
    subscriptionExpiresAt: string;
    notes: string;
  }
): Promise<void> {
  const path = `restaurants/${restaurant.id}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.update(doc(db, 'restaurants', restaurant.id), {
      plan: params.plan,
      subscriptionStatus: params.subscriptionStatus,
      subscriptionExpiresAt: params.subscriptionExpiresAt.slice(0, 40),
      updatedAt: now,
    });

    const subId = makeId('sub');
    batch.set(doc(db, 'restaurants', restaurant.id, 'subscriptions', subId), {
      id: subId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      plan: params.plan,
      status: params.subscriptionStatus,
      startedAt: now,
      expiresAt: params.subscriptionExpiresAt.slice(0, 40),
      notes: params.notes.trim().slice(0, 300) || `Updated by administrator`,
    });

    const logId = makeId('log');
    batch.set(doc(db, 'restaurants', restaurant.id, 'audit_logs', logId), {
      id: logId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      userId: auth.currentUser?.uid || 'admin',
      action: 'admin.subscription_updated',
      details: `Set plan=${params.plan}, status=${params.subscriptionStatus}, expires=${params.subscriptionExpiresAt || 'none'}`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminToggleRestaurantSuspension(
  restaurant: Restaurant,
  isSuspended: boolean
): Promise<void> {
  const path = `restaurants/${restaurant.id}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    const nextPublished = isSuspended ? false : restaurant.isPublished;

    batch.update(doc(db, 'restaurants', restaurant.id), {
      isSuspended,
      isPublished: nextPublished,
      updatedAt: now,
    });

    batch.update(doc(db, 'slugs', restaurant.slug), {
      isSuspended,
      isPublished: nextPublished,
    });

    // When suspending, also hide all subcollection documents so public queries cannot read them
    if (isSuspended) {
      const [catSnap, itemSnap] = await Promise.all([
        getDocs(collection(db, 'restaurants', restaurant.id, 'categories')),
        getDocs(collection(db, 'restaurants', restaurant.id, 'menu_items')),
      ]);
      catSnap.docs.forEach((d) => {
        batch.update(d.ref, { isPublished: false, updatedAt: now });
      });
      itemSnap.docs.forEach((d) => {
        batch.update(d.ref, { isPublished: false, updatedAt: now });
      });
    }

    const logId = makeId('log');
    batch.set(doc(db, 'restaurants', restaurant.id, 'audit_logs', logId), {
      id: logId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      userId: auth.currentUser?.uid || 'admin',
      action: isSuspended ? 'admin.restaurant_suspended' : 'admin.restaurant_reinstated',
      details: isSuspended ? 'Account suspended by platform admin' : 'Account reinstated by platform admin',
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Premium User ID Passes (Admin Generation & Owner Redemption) ---
export function getPersonalPremiumUserId(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'OWNER001';
  return `MQR-PRO-${clean}`;
}

export function generatePremiumUserIdCode(tier: 'growth' | 'pro' = 'pro'): string {
  const prefix = tier === 'pro' ? 'MQR-PRO' : 'MQR-GRW';
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
}

export function defaultOneYearExpiryDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function adminListPremiumPasses(): Promise<PremiumPass[]> {
  const path = 'premium_passes';
  try {
    const snap = await getDocs(collection(db, 'premium_passes'));
    return snap.docs.map((d) => d.data() as PremiumPass);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminCreatePremiumPass(params: {
  customId?: string;
  tier: 'growth' | 'pro';
  assignedEmail?: string;
  expiresAt?: string;
  notes?: string;
}): Promise<PremiumPass> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Administrator sign-in required.');

  const passId = (params.customId || generatePremiumUserIdCode(params.tier))
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 64);

  const path = `premium_passes/${passId}`;
  try {
    const payload = {
      id: passId,
      tier: params.tier,
      assignedEmail: (params.assignedEmail || '').trim().toLowerCase().slice(0, 150),
      status: 'active' as const,
      redeemedByUid: '',
      redeemedRestaurantId: '',
      expiresAt: (params.expiresAt || defaultOneYearExpiryDate()).slice(0, 40),
      notes: (params.notes || `Issued ${params.tier.toUpperCase()} Premium User ID`).trim().slice(0, 200),
      createdByUid: uid,
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'premium_passes', passId), payload);
    return { ...payload, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminRevokePremiumPass(passId: string): Promise<void> {
  const path = `premium_passes/${passId}`;
  try {
    await updateDoc(doc(db, 'premium_passes', passId), {
      status: 'revoked',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function redeemPremiumPass(
  restaurant: Restaurant,
  rawPassId: string
): Promise<PremiumPass> {
  const passId = rawPassId.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,64}$/.test(passId)) {
    throw new Error('Enter a valid Premium User ID (e.g., MQR-PRO-XXXX-XXXX).');
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to activate a Premium User ID.');
  }

  const passPath = `premium_passes/${passId}`;
  try {
    const snap = await getDoc(doc(db, 'premium_passes', passId));
    if (!snap.exists()) {
      throw new Error('Premium User ID not found. Check the code or ask your MENUQR administrator.');
    }
    const pass = snap.data() as PremiumPass;
    if (pass.status !== 'active') {
      throw new Error(
        pass.status === 'redeemed'
          ? 'This Premium User ID has already been redeemed.'
          : 'This Premium User ID has been revoked.'
      );
    }
    if (
      pass.assignedEmail &&
      pass.assignedEmail.toLowerCase() !== (currentUser.email || '').toLowerCase()
    ) {
      throw new Error(`This Premium User ID is reserved for ${pass.assignedEmail}.`);
    }

    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.update(doc(db, 'restaurants', restaurant.id), {
      plan: pass.tier,
      subscriptionStatus: 'active',
      subscriptionExpiresAt: pass.expiresAt || defaultOneYearExpiryDate(),
      premiumPassId: pass.id,
      updatedAt: now,
    });

    batch.update(doc(db, 'premium_passes', pass.id), {
      status: 'redeemed',
      redeemedByUid: currentUser.uid,
      redeemedRestaurantId: restaurant.id,
      redeemedAt: now,
    });

    const logId = makeId('log');
    batch.set(doc(db, 'restaurants', restaurant.id, 'audit_logs', logId), {
      id: logId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      userId: currentUser.uid,
      action: 'subscription.premium_id_redeemed',
      details: `Activated ${pass.tier.toUpperCase()} plan with Premium User ID ${pass.id}`,
      createdAt: now,
    });

    await batch.commit();

    const subId = makeId('sub');
    await setDoc(doc(db, 'restaurants', restaurant.id, 'subscriptions', subId), {
      id: subId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      plan: pass.tier,
      status: 'active',
      startedAt: serverTimestamp(),
      expiresAt: pass.expiresAt || defaultOneYearExpiryDate(),
      notes: `Activated via Premium User ID ${pass.id}`,
    });

    return {
      ...pass,
      status: 'redeemed',
      redeemedByUid: currentUser.uid,
      redeemedRestaurantId: restaurant.id,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes('permission') &&
      !error.message.includes('PERMISSION_DENIED')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, passPath);
  }
}

export async function adminActivatePersonalPremiumId(
  restaurant: Restaurant
): Promise<{ passId: string; expiresAt: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in first.');
  }

  const passId = getPersonalPremiumUserId(currentUser.uid);
  const expiresAt = defaultOneYearExpiryDate();
  const path = `premium_passes/${passId}`;

  try {
    const existingSnap = await getDoc(doc(db, 'premium_passes', passId));
    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'premium_passes', passId), {
        id: passId,
        tier: 'pro',
        assignedEmail: (currentUser.email || '').toLowerCase().slice(0, 150),
        status: 'redeemed',
        redeemedByUid: currentUser.uid,
        redeemedRestaurantId: restaurant.id,
        expiresAt,
        notes: 'Founder / Admin Personal Pro Premium User ID',
        createdByUid: currentUser.uid,
        createdAt: serverTimestamp(),
        redeemedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'premium_passes', passId), {
        status: 'redeemed',
        redeemedByUid: currentUser.uid,
        redeemedRestaurantId: restaurant.id,
        expiresAt,
        redeemedAt: serverTimestamp(),
      });
    }

    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.update(doc(db, 'restaurants', restaurant.id), {
      plan: 'pro',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expiresAt,
      premiumPassId: passId,
      updatedAt: now,
    });

    const subId = makeId('sub');
    batch.set(doc(db, 'restaurants', restaurant.id, 'subscriptions', subId), {
      id: subId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      plan: 'pro',
      status: 'active',
      startedAt: now,
      expiresAt,
      notes: `Activated Pro with Personal Premium User ID ${passId}`,
    });

    const logId = makeId('log');
    batch.set(doc(db, 'restaurants', restaurant.id, 'audit_logs', logId), {
      id: logId,
      restaurantId: restaurant.id,
      ownerId: restaurant.ownerId,
      userId: currentUser.uid,
      action: 'admin.personal_premium_id_activated',
      details: `Issued & activated Personal Pro ID ${passId} through ${expiresAt}`,
      createdAt: now,
    });

    await batch.commit();
    return { passId, expiresAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}


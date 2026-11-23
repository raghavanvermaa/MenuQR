import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Heart,
  Home,
  Languages,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { DietaryMark, MenuQrBrand, SmartImage } from '../components/BrandUI';
import { TiltCard3D } from '../components/TiltCard3D';
import { useTrackMenuView } from '../hooks/useTrackMenuView';
import {
  aiAskMenuAssistant,
  aiTranslateMenuToHindi,
  type HindiTranslationResponse,
} from '../lib/aiService';
import { loadPublicMenuBySlug, recordPublicMenuEvent } from '../lib/menuService';
import {
  formatInr,
  getDiscountPercent,
  getEffectiveDishPrice,
  getEffectivePlan,
  hasActiveDiscount,
} from '../lib/plans';
import { generateQrDataUrl } from '../lib/qrExport';
import {
  FOOD_TYPE_LABELS,
  RESTAURANT_TYPE_LABELS,
  type Category,
  type FoodType,
  type MenuItem,
  type Restaurant,
} from '../types/menuqr';

interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  recommendedDishNames?: string[];
}

interface OrderReceipt {
  refCode: string;
  createdAtLabel: string;
  tableNumber: string;
  customerName: string;
  note: string;
  items: { dish: MenuItem; qty: number; unitPrice: number; regularPrice: number }[];
  totalPayable: number;
  totalSavings: number;
  paymentMethod: 'upi_qr' | 'counter';
  upiAppLabel?: string;
}

type UpiAppId = 'paytm' | 'bhim' | 'gpay' | 'phonepe' | 'other';

interface UpiAppOption {
  id: UpiAppId;
  name: string;
  shortTag: string;
  accentBg: string;
  accentText: string;
  buildUri: (queryString: string) => string;
}

const UPI_APP_OPTIONS: UpiAppOption[] = [
  {
    id: 'paytm',
    name: 'Paytm',
    shortTag: 'PTM',
    accentBg: 'bg-[#00BAF2]',
    accentText: 'text-[#071D3B]',
    buildUri: (qs) => `paytmmp://pay?${qs}`,
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    shortTag: 'BHIM',
    accentBg: 'bg-[#00897B]',
    accentText: 'text-white',
    buildUri: (qs) => `bhim://upi/pay?${qs}`,
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    shortTag: 'GPay',
    accentBg: 'bg-[#2563EB]',
    accentText: 'text-white',
    buildUri: (qs) => `tez://upi/pay?${qs}`,
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    shortTag: 'Pe',
    accentBg: 'bg-[#5F259F]',
    accentText: 'text-white',
    buildUri: (qs) => `phonepe://pay?${qs}`,
  },
];

const REVIEW_HIGHLIGHTS = ['Great Taste', 'Fast Service', 'Cozy Vibe', 'Great Value'] as const;

type SpicePref = 'Regular' | 'Mild' | 'Medium' | 'Spicy';

export function PublicMenuPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const initialTable = searchParams.get('table')?.trim() || '';
  const sourceParam = searchParams.get('src');
  const langParam = searchParams.get('lang');

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'found' | 'unpublished' | 'not_found'>('found');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  const [search, setSearch] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dietFilter, setDietFilter] = useState<'all' | FoodType>('all');
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const [offersOnly, setOffersOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Featured 3D Spotlight Carousel index
  const [heroSlideIdx, setHeroSlideIdx] = useState(0);

  // Separate Favorites (Heart) & Cart (+ / Stepper)
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'pay' | 'receipt'>('cart');
  const [orderTable, setOrderTable] = useState(initialTable);
  const [customerName, setCustomerName] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [generatedUpiQrUrl, setGeneratedUpiQrUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [selectedUpiApp, setSelectedUpiApp] = useState<UpiAppId>('paytm');
  const [upiLaunchNotice, setUpiLaunchNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);

  // Post-Payment Google Review interaction state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewHover, setReviewHover] = useState<number>(0);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [copiedReviewDraft, setCopiedReviewDraft] = useState(false);

  // Immersive Dish Detail Sheet state
  const [selectedDish, setSelectedDish] = useState<MenuItem | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [detailSpice, setDetailSpice] = useState<SpicePref>('Regular');
  const [detailNoOnion, setDetailNoOnion] = useState(false);
  const [detailExtraSauce, setDetailExtraSauce] = useState(false);

  // Language & Auto Hindi Translation state
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [hindiData, setHindiData] = useState<HindiTranslationResponse | null>(null);
  const autoTranslatedRef = useRef<string | null>(null);

  // AI Menu Assistant Drawer state (closed on arrival)
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantTurns, setAssistantTurns] = useState<AssistantTurn[]>([]);
  const assistantEndRef = useRef<HTMLDivElement>(null);

  // Track real public menu views & QR scans in Firestore `menu_events`
  useTrackMenuView(status === 'found' ? restaurant : null, {
    tableNumber: initialTable,
    src: sourceParam,
  });

  const translateToHindi = useCallback(
    async (rest: Restaurant, cats: Category[], menuItems: MenuItem[]) => {
      setTranslateError(null);
      setTranslating(true);
      try {
        const translated = await aiTranslateMenuToHindi({
          restaurant: rest,
          categories: cats,
          items: menuItems,
        });
        setHindiData(translated);
        setLang('hi');
      } catch (err) {
        setTranslateError(
          err instanceof Error
            ? err.message
            : 'Hindi translation is temporarily unavailable. Tap हिंदी to retry.'
        );
      } finally {
        setTranslating(false);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLang('en');
    setHindiData(null);
    setTranslateError(null);
    setAssistantTurns([]);
    setAssistantOpen(false);
    setCart({});
    setFavorites({});
    setOffersOnly(false);
    setFavoritesOnly(false);
    setCartOpen(false);
    setCheckoutStep('cart');
    setReceipt(null);
    setSelectedDish(null);
    setHeroSlideIdx(0);
    setOrderTable(initialTable);

    void loadPublicMenuBySlug(slug).then((result) => {
      if (!active) return;
      setStatus(result.status);
      setRestaurant(result.restaurant || null);
      setCategories(result.categories || []);
      setItems(result.items || []);
      setLoading(false);

      if (result.status === 'found' && result.restaurant) {
        const rest = result.restaurant;
        document.title = `${rest.name} — Digital Menu | MENUQR`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          metaDesc.setAttribute(
            'content',
            rest.description || `Explore ${rest.name}'s digital menu in ${rest.city}.`
          );
        }

        // Auto-translate to Hindi when `?lang=hi` is requested or browser locale is Hindi
        const wantsAutoHindi =
          langParam === 'hi' ||
          (langParam !== 'en' &&
            typeof navigator !== 'undefined' &&
            navigator.language?.toLowerCase().startsWith('hi'));

        if (wantsAutoHindi && autoTranslatedRef.current !== rest.id) {
          autoTranslatedRef.current = rest.id;
          void translateToHindi(rest, result.categories || [], result.items || []);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [slug, initialTable, langParam, translateToHindi]);

  useEffect(() => {
    if (assistantOpen) {
      assistantEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [assistantTurns, assistantOpen, assistantLoading]);

  const effectivePlan = useMemo(() => getEffectivePlan(restaurant), [restaurant]);

  const hindiCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    hindiData?.categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [hindiData]);

  const hindiItemMap = useMemo(() => {
    const map = new Map<string, { name: string; description: string }>();
    hindiData?.items.forEach((i) => map.set(i.id, { name: i.name, description: i.description }));
    return map;
  }, [hindiData]);

  const getCategoryName = (cat: Category) =>
    lang === 'hi' ? hindiCategoryMap.get(cat.id) || cat.name : cat.name;

  const getItemName = (item: MenuItem) =>
    lang === 'hi' ? hindiItemMap.get(item.id)?.name || item.name : item.name;

  const getItemDescription = (item: MenuItem) =>
    lang === 'hi' ? hindiItemMap.get(item.id)?.description || item.description : item.description;

  const categoryThumbMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.imageUrl && !map.has(item.categoryId)) {
        map.set(item.categoryId, item.imageUrl);
      }
    }
    return map;
  }, [items]);

  const telemetrySource = initialTable ? `table:${initialTable}` : sourceParam || 'direct';

  // Open dish detail sheet with fresh customization state
  const openDishDetail = (item: MenuItem) => {
    setSelectedDish(item);
    setDetailQty(Math.max(1, cart[item.id] || 1));
    setDetailSpice('Regular');
    setDetailNoOnion(false);
    setDetailExtraSauce(false);
    if (restaurant) {
      const categoryName = categories.find((c) => c.id === item.categoryId)?.name || 'Menu';
      void recordPublicMenuEvent(restaurant, 'dish_view', telemetrySource, {
        dishId: item.id,
        dishName: item.name,
        categoryName,
        amountInr: getEffectiveDishPrice(item),
      });
    }
  };

  // Favorites helpers
  const toggleFavorite = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = true;
      return next;
    });
  };

  const favoriteCount = useMemo(() => Object.keys(favorites).length, [favorites]);

  // Cart helpers
  const adjustCartQty = (item: MenuItem, delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!item.isAvailable && delta > 0) return;
    if (delta > 0 && restaurant) {
      const categoryName = categories.find((c) => c.id === item.categoryId)?.name || 'Menu';
      void recordPublicMenuEvent(restaurant, 'add_to_cart', telemetrySource, {
        dishId: item.id,
        dishName: item.name,
        categoryName,
        amountInr: getEffectiveDishPrice(item) * delta,
      });
    }
    setCart((prev) => {
      const current = prev[item.id] || 0;
      const updated = current + delta;
      const next = { ...prev };
      if (updated <= 0) {
        delete next[item.id];
      } else {
        next[item.id] = Math.min(25, updated);
      }
      return next;
    });
  };

  const addDishFromDetail = () => {
    if (!selectedDish || !selectedDish.isAvailable) return;
    if (restaurant) {
      const categoryName = categories.find((c) => c.id === selectedDish.categoryId)?.name || 'Menu';
      void recordPublicMenuEvent(restaurant, 'add_to_cart', telemetrySource, {
        dishId: selectedDish.id,
        dishName: selectedDish.name,
        categoryName,
        amountInr: getEffectiveDishPrice(selectedDish) * Math.min(25, detailQty),
      });
    }
    setCart((prev) => ({
      ...prev,
      [selectedDish.id]: Math.min(25, detailQty),
    }));
    const prefs: string[] = [];
    if (detailSpice !== 'Regular') prefs.push(`${detailSpice} spice`);
    if (detailNoOnion) prefs.push('No onion/garlic');
    if (detailExtraSauce) prefs.push('Extra dip/chutney');
    if (prefs.length > 0) {
      const tag = `${selectedDish.name}: ${prefs.join(', ')}`;
      setOrderNote((prev) => (prev.includes(tag) ? prev : prev ? `${prev}; ${tag}` : tag));
    }
    setSelectedDish(null);
  };

  const cartEntries = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const dish = items.find((i) => i.id === id);
        if (!dish) return null;
        const unitPrice = getEffectiveDishPrice(dish);
        return {
          dish,
          qty,
          unitPrice,
          regularPrice: dish.price,
          lineTotal: unitPrice * qty,
          lineSavings: Math.max(0, dish.price - unitPrice) * qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [cart, items]);

  const cartTotalQty = useMemo(
    () => cartEntries.reduce((sum, entry) => sum + entry.qty, 0),
    [cartEntries]
  );

  const cartRegularSubtotal = useMemo(
    () => cartEntries.reduce((sum, entry) => sum + entry.regularPrice * entry.qty, 0),
    [cartEntries]
  );

  const cartPayableTotal = useMemo(
    () => cartEntries.reduce((sum, entry) => sum + entry.lineTotal, 0),
    [cartEntries]
  );

  const cartTotalSavings = useMemo(
    () => cartEntries.reduce((sum, entry) => sum + entry.lineSavings, 0),
    [cartEntries]
  );

  // Shopkeeper UPI QR / deep-link calculation
  const cleanUpiId = (restaurant?.upiId || '').trim();
  const uploadedPaymentQrUrl = (restaurant?.paymentQrUrl || '').trim();
  const hasDirectQrPayment = Boolean(uploadedPaymentQrUrl || cleanUpiId);

  const upiQueryString = useMemo(() => {
    if (!cleanUpiId || !restaurant) return '';
    const amount = cartPayableTotal > 0 ? cartPayableTotal.toFixed(2) : '';
    const params = new URLSearchParams({
      pa: cleanUpiId,
      pn: restaurant.name,
      cu: 'INR',
      tn: orderTable ? `${restaurant.name} Table ${orderTable}` : `${restaurant.name} Order`,
    });
    if (amount) params.set('am', amount);
    return params.toString();
  }, [cleanUpiId, restaurant, cartPayableTotal, orderTable]);

  const upiPayUri = useMemo(
    () => (upiQueryString ? `upi://pay?${upiQueryString}` : ''),
    [upiQueryString]
  );

  const googleReviewHref = useMemo(() => {
    if (!restaurant) return '';
    const custom = (restaurant.googleReviewUrl || '').trim();
    if (custom && (custom.startsWith('https://') || custom.startsWith('http://'))) {
      return custom;
    }
    const q = [restaurant.name, restaurant.address, restaurant.city].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [restaurant]);

  useEffect(() => {
    let active = true;
    if (!upiPayUri || uploadedPaymentQrUrl) {
      setGeneratedUpiQrUrl('');
      return;
    }
    void generateQrDataUrl(upiPayUri, '#171923')
      .then((dataUrl) => {
        if (active) setGeneratedUpiQrUrl(dataUrl);
      })
      .catch(() => {
        if (active) setGeneratedUpiQrUrl('');
      });
    return () => {
      active = false;
    };
  }, [upiPayUri, uploadedPaymentQrUrl]);

  // Spotlight carousel dishes (discounted + featured first)
  const spotlightDishes = useMemo(() => {
    const avail = items.filter((i) => i.isAvailable);
    const prioritized = [
      ...avail.filter((i) => i.isFeatured && hasActiveDiscount(i)),
      ...avail.filter((i) => i.isFeatured && !hasActiveDiscount(i)),
      ...avail.filter((i) => !i.isFeatured && hasActiveDiscount(i)),
    ];
    const unique = Array.from(new Map(prioritized.map((d) => [d.id, d])).values());
    return (unique.length > 0 ? unique : avail).slice(0, 4);
  }, [items]);

  const activeSpotlight = spotlightDishes[heroSlideIdx % Math.max(1, spotlightDishes.length)] || null;

  const discountedCount = useMemo(
    () => items.filter((i) => i.isAvailable && hasActiveDiscount(i)).length,
    [items]
  );

  const handleSelectLanguage = async (nextLang: 'en' | 'hi') => {
    setTranslateError(null);
    if (nextLang === 'en') {
      setLang('en');
      return;
    }
    if (hindiData) {
      setLang('hi');
      return;
    }
    if (!restaurant) return;
    await translateToHindi(restaurant, categories, items);
  };

  const handleShareMenu = async () => {
    const url = window.location.href;
    if (navigator.share && restaurant) {
      try {
        await navigator.share({
          title: `${restaurant.name} — Digital Menu`,
          text: `Explore ${restaurant.name}'s menu on MENUQR`,
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCopyUpi = async () => {
    if (!cleanUpiId) return;
    try {
      await navigator.clipboard.writeText(cleanUpiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleDownloadPaymentQr = () => {
    const qrSrc = uploadedPaymentQrUrl || generatedUpiQrUrl;
    if (!qrSrc || !restaurant) return;
    const link = document.createElement('a');
    link.href = qrSrc;
    link.download = `${restaurant.slug}-payment-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmOrder = (paymentMethod: 'upi_qr' | 'counter') => {
    if (cartEntries.length === 0) return;
    const refCode = `MQR-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowLabel = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const chosenApp = UPI_APP_OPTIONS.find((a) => a.id === selectedUpiApp);
    setReceipt({
      refCode,
      createdAtLabel: nowLabel,
      tableNumber: orderTable.trim(),
      customerName: customerName.trim(),
      note: orderNote.trim(),
      items: cartEntries.map(({ dish, qty, unitPrice, regularPrice }) => ({
        dish,
        qty,
        unitPrice,
        regularPrice,
      })),
      totalPayable: cartPayableTotal,
      totalSavings: cartTotalSavings,
      paymentMethod,
      upiAppLabel:
        paymentMethod === 'upi_qr'
          ? cleanUpiId && chosenApp
            ? chosenApp.name
            : 'Shop UPI QR'
          : undefined,
    });
    setReviewRating(5);
    setReviewHover(0);
    setReviewTags([]);
    setReviewNote('');
    setCopiedReviewDraft(false);
    setCheckoutStep('receipt');
  };

  const toggleReviewTag = (tag: string) => {
    setReviewTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleCopyReviewDraft = async () => {
    if (!restaurant) return;
    const parts: string[] = [];
    if (reviewTags.length > 0) parts.push(reviewTags.join(', '));
    if (reviewNote.trim()) parts.push(reviewNote.trim());
    const draft =
      parts.length > 0
        ? `${reviewRating}/5 stars at ${restaurant.name}! ${parts.join(' — ')}.`
        : `${reviewRating}/5 stars — Loved dining at ${restaurant.name}!`;
    try {
      await navigator.clipboard.writeText(draft);
      setCopiedReviewDraft(true);
      setTimeout(() => setCopiedReviewDraft(false), 2200);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleAskAssistant = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || !restaurant || assistantLoading) return;

    setAssistantError(null);
    setAssistantInput('');
    const userTurn: AssistantTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: clean,
    };
    setAssistantTurns((prev) => [...prev, userTurn]);
    setAssistantLoading(true);

    try {
      const response = await aiAskMenuAssistant({
        restaurant,
        categories,
        items,
        question: clean,
        language: lang,
      });
      setAssistantTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: response.answer,
          recommendedDishNames: response.recommendedDishNames,
        },
      ]);
    } catch (err) {
      setAssistantError(
        err instanceof Error ? err.message : 'Menu assistant could not reply right now.'
      );
    } finally {
      setAssistantLoading(false);
    }
  };

  const findRecommendedItems = (names?: string[]): MenuItem[] => {
    if (!names || names.length === 0) return [];
    const normalized = names.map((n) => n.trim().toLowerCase());
    return items.filter(
      (item) =>
        item.isAvailable &&
        normalized.some(
          (n) =>
            item.name.toLowerCase() === n ||
            item.name.toLowerCase().includes(n) ||
            n.includes(item.name.toLowerCase())
        )
    );
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (favoritesOnly && !favorites[item.id]) return false;
      if (offersOnly && !hasActiveDiscount(item)) return false;
      if (dietFilter !== 'all' && item.foodType !== dietFilter) return false;
      if (activeCategoryId !== 'all' && item.categoryId !== activeCategoryId) return false;
      if (q) {
        const hi = hindiItemMap.get(item.id);
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          Boolean(hi && (hi.name.toLowerCase().includes(q) || hi.description.toLowerCase().includes(q)))
        );
      }
      return true;
    });
  }, [items, search, dietFilter, activeCategoryId, favoritesOnly, offersOnly, favorites, hindiItemMap]);

  const popularItems = useMemo(() => {
    const matching = items.filter(
      (item) => item.isAvailable && (dietFilter === 'all' || item.foodType === dietFilter)
    );
    const featured = matching.filter((item) => item.isFeatured || hasActiveDiscount(item));
    return (featured.length > 0 ? featured : matching).slice(0, 6);
  }, [items, dietFilter]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    filteredItems.forEach((item) => {
      const existing = map.get(item.categoryId) || [];
      existing.push(item);
      map.set(item.categoryId, existing);
    });
    return categories
      .filter((c) => (map.get(c.id)?.length || 0) > 0)
      .map((category) => ({
        category,
        items: map.get(category.id) || [],
      }));
  }, [categories, filteredItems]);

  const quickPrompts = useMemo(
    () =>
      lang === 'hi'
        ? [
            '₹400 के अंदर सबसे अच्छा शाकाहारी कॉम्बो बताएं',
            'सबसे अच्छे डिस्काउंट वाले व्यंजन कौन से हैं?',
            'बिना अंडे के विकल्प दिखाएं',
            'कॉफी के साथ क्या सबसे अच्छा रहेगा?',
          ]
        : [
            'Best veg combo under ₹400',
            'Which dishes have the best discounts?',
            'Show eggless options',
            'What pairs best with coffee?',
          ],
    [lang]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0C0A] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div className="h-12 w-56 bg-white/8 rounded-2xl animate-pulse" />
          <div className="h-52 bg-white/6 rounded-3xl animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-60 bg-white/6 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unpublished') {
    return (
      <div className="min-h-screen bg-[#0E0C0A] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#191512] rounded-3xl border border-white/10 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#FF8A1F]/15 text-[#FF9B3D] flex items-center justify-center mx-auto mb-4">
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold mb-2">Menu not published yet</h1>
          <p className="text-sm text-[#B8AFA6] leading-relaxed mb-6">
            This restaurant is still preparing its digital menu. Please check back shortly or ask
            your server for assistance.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#FF8A1F] text-[#171923] text-sm font-bold"
          >
            Visit MENUQR
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'not_found' || !restaurant) {
    return (
      <div className="min-h-screen bg-[#0E0C0A] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#191512] rounded-3xl border border-white/10 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#FF8A1F]/15 text-[#FF9B3D] flex items-center justify-center mx-auto mb-4">
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold mb-2">Restaurant menu not found</h1>
          <p className="text-sm text-[#B8AFA6] leading-relaxed mb-6">
            We could not find a menu at <span className="font-mono text-white">/menu/{slug}</span>.
            Double check the QR code or explore our live demo menu.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/menu/cafe-mocha"
              className="px-4 py-2.5 rounded-xl bg-[#FF8A1F] text-[#171923] text-sm font-bold"
            >
              View Cafe Mocha Demo
            </Link>
            <Link
              to="/"
              className="px-4 py-2.5 rounded-xl border border-white/15 text-white text-sm font-semibold"
            >
              MENUQR Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayDescription =
    lang === 'hi' && hindiData?.restaurantDescription
      ? hindiData.restaurantDescription
      : restaurant.description;
  const displayPromo =
    lang === 'hi' && hindiData?.promoBanner ? hindiData.promoBanner : restaurant.promoBanner;
  const cleanWhatsapp = restaurant.whatsappNumber.replace(/[^\d]/g, '');
  const showWhatsapp = Boolean(cleanWhatsapp && effectivePlan.whatsappOrdering);

  const buildWhatsappOrderUrl = (sourceReceipt?: OrderReceipt | null) => {
    const list = sourceReceipt
      ? sourceReceipt.items.map(
          (e) => `• ${e.qty}x ${e.dish.name} (${formatInr(e.unitPrice * e.qty)})`
        )
      : cartEntries.map((e) => `• ${e.qty}x ${e.dish.name} (${formatInr(e.lineTotal)})`);
    const total = sourceReceipt ? sourceReceipt.totalPayable : cartPayableTotal;
    const tbl = sourceReceipt ? sourceReceipt.tableNumber : orderTable.trim();
    const name = sourceReceipt ? sourceReceipt.customerName : customerName.trim();
    const note = sourceReceipt ? sourceReceipt.note : orderNote.trim();
    const refPart = sourceReceipt ? ` [Ref: ${sourceReceipt.refCode}]` : '';
    const paidPart =
      sourceReceipt?.paymentMethod === 'upi_qr' ? '\nPayment: Paid via UPI QR' : '';
    const header = `Hello ${restaurant.name}${tbl ? ` (Table ${tbl})` : ''}${refPart}${
      name ? ` — from ${name}` : ''
    }`;
    const body =
      list.length > 0
        ? `${header}\n${list.join('\n')}\nTotal: ${formatInr(total)}${paidPart}${
            note ? `\nNote: ${note}` : ''
          }`
        : `${header}, I would like to place an order from your digital menu.`;
    return `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(body)}`;
  };

  const renderDishCard3D = (item: MenuItem, keyPrefix: string) => {
    const qty = cart[item.id] || 0;
    const isFav = Boolean(favorites[item.id]);
    const discounted = hasActiveDiscount(item);
    const effectivePrice = getEffectiveDishPrice(item);
    const discountPct = getDiscountPercent(item);
    const itemName = getItemName(item);
    const itemDesc = getItemDescription(item);

    return (
      <TiltCard3D
        key={`${keyPrefix}-${item.id}`}
        id={keyPrefix === 'cat' ? `dish-${item.id}` : undefined}
        onClick={() => openDishDetail(item)}
        className={`group rounded-2xl bg-gradient-to-b from-[#211C18] to-[#161311] border border-white/10 hover:border-[#FF8A1F]/45 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)] overflow-hidden cursor-pointer flex flex-col ${
          item.isAvailable ? '' : 'opacity-55'
        }`}
      >
        {/* Elevated 3D Photo Stage */}
        <div className="relative p-2.5 pb-0">
          <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[#120F0D]">
            <SmartImage
              src={item.imageUrl}
              alt={itemName}
              fallbackLabel={itemName}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#161311]/70 via-transparent to-transparent" />

            {/* Top-right Favorite Heart */}
            <button
              type="button"
              onClick={(e) => toggleFavorite(item.id, e)}
              aria-label={isFav ? `Remove ${itemName} from favorites` : `Save ${itemName} to favorites`}
              className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${
                isFav
                  ? 'bg-[#E11D48] text-white shadow-[0_0_12px_rgba(225,29,72,0.55)]'
                  : 'bg-black/45 border border-white/15 text-white/85 hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-white' : ''}`} />
            </button>

            {discounted && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-gradient-to-r from-[#FF7A00] to-[#E05200] text-white text-[10px] font-bold tracking-wide tabular-nums shadow-md">
                {discountPct}% OFF
              </span>
            )}
          </div>
        </div>

        {/* Dark Glass Card Details */}
        <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-start gap-1.5">
              <span className="mt-1 shrink-0">
                <DietaryMark foodType={item.foodType} />
              </span>
              <h3 className="text-sm sm:text-[15px] font-bold text-white leading-snug line-clamp-1 tracking-[0.01em]">
                {itemName}
              </h3>
            </div>
            {itemDesc && (
              <p className="mt-1 text-xs text-[#A69E96] leading-relaxed line-clamp-2">
                {itemDesc}
              </p>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-mono text-sm sm:text-base font-bold text-[#FFA142] tabular-nums">
                  {formatInr(effectivePrice)}
                </span>
                {discounted && (
                  <span className="font-mono text-[11px] text-[#7D756D] line-through tabular-nums">
                    {formatInr(item.price)}
                  </span>
                )}
              </div>
            </div>

            {!item.isAvailable ? (
              <span className="text-[11px] font-semibold text-[#8A8178] whitespace-nowrap">
                {lang === 'hi' ? 'उपलब्ध नहीं' : 'Sold out'}
              </span>
            ) : qty === 0 ? (
              <button
                type="button"
                onClick={(e) => adjustCartQty(item, 1, e)}
                aria-label={`Add ${itemName} to cart`}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF9933] to-[#E66400] hover:brightness-110 text-white flex items-center justify-center shadow-[0_6px_16px_-4px_rgba(255,138,31,0.75)] transition-transform active:scale-90 shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[2.75]" />
              </button>
            ) : (
              <div
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-[#FF8A1F] to-[#E56400] text-white p-0.5 shadow-[0_6px_16px_-4px_rgba(255,138,31,0.65)] shrink-0"
              >
                <button
                  type="button"
                  onClick={(e) => adjustCartQty(item, -1, e)}
                  aria-label={`Decrease ${itemName} quantity`}
                  className="w-7 h-7 rounded-full hover:bg-black/20 flex items-center justify-center"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs font-bold min-w-[18px] text-center tabular-nums">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={(e) => adjustCartQty(item, 1, e)}
                  aria-label={`Increase ${itemName} quantity`}
                  className="w-7 h-7 rounded-full hover:bg-black/20 flex items-center justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </TiltCard3D>
    );
  };

  return (
    <div className="min-h-screen bg-[#0D0B0A] text-[#F8F4EF] pb-28 relative overflow-x-clip">
      {/* Atmospheric Warm Amber Top Spotlight Glow (mirrors uploaded dark food app screenshots) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] z-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 60% at 50% -10%, rgba(255, 138, 31, 0.28), rgba(168, 72, 12, 0.12) 45%, transparent 78%)',
        }}
      />

      {/* Slim Demo / Draft Ribbon */}
      {restaurant.isDemo && (
        <div className="relative z-20 bg-[#1B1612]/90 border-b border-white/10 text-white/90 text-xs py-2 px-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <span className="truncate">Interactive Demo Menu · Cafe Mocha</span>
            <Link
              to="/register"
              className="font-semibold text-[#FF9B3D] hover:underline whitespace-nowrap shrink-0"
            >
              Create yours free
            </Link>
          </div>
        </div>
      )}

      {!restaurant.isDemo && !restaurant.isPublished && (
        <div className="relative z-20 bg-[#C8640B] text-white text-xs py-2 px-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <span className="truncate">Owner Preview · Currently in Draft</span>
            <Link to="/dashboard" className="font-semibold underline whitespace-nowrap shrink-0">
              Back to dashboard
            </Link>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* Compact Single-Row Top Header */}
        <header className="pt-4 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {restaurant.logoUrl ? (
              <SmartImage
                src={restaurant.logoUrl}
                alt={`${restaurant.name} logo`}
                className="w-10 h-10 rounded-2xl object-cover border border-[#FF9B3D]/50 bg-[#1B1613] shrink-0 shadow-[0_0_16px_rgba(255,138,31,0.28)]"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-[#1F1A16] border border-[#FF9B3D]/45 flex items-center justify-center text-[#FF9B3D] shrink-0 shadow-[0_0_16px_rgba(255,138,31,0.25)]">
                <ChefHat className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate leading-tight">
                {restaurant.name}
              </p>
              <p className="text-[11px] text-[#A89F96] truncate">
                {RESTAURANT_TYPE_LABELS[restaurant.restaurantType]} · {restaurant.city}
                {orderTable ? ` · Table ${orderTable}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleShareMenu()}
              aria-label="Share menu link"
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white/90 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedShare ? (
                <Check className="w-4 h-4 text-[#34D399]" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {copiedShare ? 'Copied' : lang === 'hi' ? 'शेयर' : 'Share'}
              </span>
            </button>

            {/* EN | हिंदी Segmented Language Switcher */}
            <div className="flex items-center bg-white/[0.06] border border-white/12 rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => void handleSelectLanguage('en')}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'en'
                    ? 'bg-white text-[#171923]'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                disabled={translating}
                onClick={() => void handleSelectLanguage('hi')}
                className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'hi'
                    ? 'bg-gradient-to-r from-[#FF942E] to-[#E56500] text-white'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                {translating && <Loader2 className="w-3 h-3 animate-spin" />}
                हिंदी
              </button>
            </div>
          </div>
        </header>

        {/* Live Hindi Translation Status / Error Notice */}
        {translating && (
          <div className="mb-3 rounded-xl bg-[#FF8A1F]/15 border border-[#FF8A1F]/35 px-3.5 py-2 text-xs text-[#FFC078] flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>Translating {restaurant.name}&apos;s menu into Hindi...</span>
          </div>
        )}

        {translateError && (
          <div className="mb-3 rounded-xl bg-[#3A1616] border border-[#7F2A2A] px-3.5 py-2.5 text-xs text-[#FCA5A5] flex items-center justify-between gap-2">
            <span>{translateError}</span>
            <button
              type="button"
              onClick={() => void handleSelectLanguage('hi')}
              className="px-2.5 py-1 rounded-lg bg-[#FF8A1F] text-[#171923] font-bold whitespace-nowrap shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Starting Greeting & Headline (Exact user request + uploaded design) */}
        <section className="pt-2 pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-sm sm:text-base font-medium text-[#D6CEC5]">
                {lang === 'hi' ? 'नमस्ते ग्राहक 👋' : 'Hello Customer 👋'}
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.08] text-white"
                style={{ textWrap: 'balance' }}
              >
                {lang === 'hi' ? (
                  <>
                    स्वादिष्ट भोजन।{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFAE4A] to-[#FF6E00]">
                      बेहतरीन पल!
                    </span>
                  </>
                ) : (
                  <>
                    Good Food.{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFAE4A] to-[#FF6E00]">
                      Great Moments!
                    </span>
                  </>
                )}
              </h1>
              {displayDescription && (
                <p className="text-xs sm:text-sm text-[#A89F96] max-w-xl leading-relaxed pt-0.5">
                  {displayDescription}
                </p>
              )}
            </div>

            {/* Quiet Restaurant Utility Metadata */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9E958C]">
              {restaurant.openingHours && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#FF942E]" />
                  {restaurant.openingHours}
                </span>
              )}
              {restaurant.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#FF942E]" />
                  {restaurant.address}
                </span>
              )}
              {restaurant.phone && (
                <a
                  href={`tel:${restaurant.phone}`}
                  className="inline-flex items-center gap-1 text-white/85 hover:text-[#FF942E]"
                >
                  <Phone className="w-3.5 h-3.5 text-[#FF942E]" />
                  {restaurant.phone}
                </a>
              )}
              {lang === 'hi' && (
                <span className="inline-flex items-center gap-1 text-[#FFAE4A] font-semibold">
                  <Languages className="w-3.5 h-3.5" />
                  हिंदी में
                </span>
              )}
            </div>
          </div>

          {/* Glassmorphic Search Pill Bar + Dietary Filter Trigger */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-[#9A9086] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    lang === 'hi'
                      ? 'अपना पसंदीदा भोजन खोजें...'
                      : 'Search your favorite food...'
                  }
                  aria-label="Search menu"
                  className="w-full min-h-[48px] pl-11 pr-10 py-3 rounded-2xl bg-white/[0.06] border border-white/12 text-sm text-white placeholder:text-[#8E847B] backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[#FF8A1F] focus:border-transparent"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#9A9086] hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setFilterDrawerOpen((prev) => !prev)}
                aria-label="Toggle dietary filters"
                aria-expanded={filterDrawerOpen}
                className={`min-w-[48px] min-h-[48px] rounded-2xl border flex items-center justify-center transition-colors shrink-0 ${
                  filterDrawerOpen || dietFilter !== 'all'
                    ? 'bg-[#FF8A1F] border-[#FF9B3D] text-white shadow-[0_0_20px_rgba(255,138,31,0.45)]'
                    : 'bg-white/[0.06] border-white/12 text-white/85 hover:bg-white/[0.12]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Expandable Dietary Filter Segmented Bar */}
            <AnimatePresence>
              {(filterDrawerOpen || dietFilter !== 'all') && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
                >
                  {(
                    [
                      { id: 'all', label: lang === 'hi' ? 'सभी व्यंजन' : 'All Dishes' },
                      { id: 'veg', label: lang === 'hi' ? 'शाकाहारी (Veg)' : 'Pure Veg' },
                      { id: 'non_veg', label: lang === 'hi' ? 'नॉन-वेज' : 'Non-Veg' },
                      { id: 'egg', label: lang === 'hi' ? 'अंडा (Egg)' : 'Egg' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDietFilter(opt.id)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
                        dietFilter === opt.id
                          ? 'bg-[#FF8A1F] border-[#FF9B3D] text-white'
                          : 'bg-white/[0.05] border-white/10 text-[#C5BCB3] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Illuminated 3D Dark Glass Category Tiles Strip */}
        {categories.length > 0 && (
          <section aria-label="Menu categories" className="pb-5">
            <div className="flex items-stretch gap-2.5 sm:gap-3.5 overflow-x-auto no-scrollbar py-1">
              {/* All Category Tile */}
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryId('all');
                  setOffersOnly(false);
                  setFavoritesOnly(false);
                }}
                className={`min-w-[74px] sm:min-w-[84px] p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all duration-200 shrink-0 ${
                  activeCategoryId === 'all' && !offersOnly && !favoritesOnly
                    ? 'bg-gradient-to-b from-[#FF942E] to-[#C85300] border-[#FFB366] text-white shadow-[0_10px_24px_-6px_rgba(255,138,31,0.75)] -translate-y-0.5'
                    : 'bg-white/[0.05] border-white/10 text-[#C9C0B7] hover:bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    activeCategoryId === 'all' && !offersOnly && !favoritesOnly
                      ? 'bg-white/20 text-white'
                      : 'bg-white/[0.06] text-[#FF9B3D]'
                  }`}
                >
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold whitespace-nowrap">
                  {lang === 'hi' ? 'सभी' : 'All'}
                </span>
              </button>

              {categories.map((cat) => {
                const thumb = categoryThumbMap.get(cat.id);
                const isActive = activeCategoryId === cat.id && !offersOnly && !favoritesOnly;
                const catLabel = getCategoryName(cat);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategoryId(cat.id);
                      setOffersOnly(false);
                      setFavoritesOnly(false);
                    }}
                    className={`min-w-[78px] sm:min-w-[90px] p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all duration-200 shrink-0 ${
                      isActive
                        ? 'bg-gradient-to-b from-[#FF942E] to-[#C85300] border-[#FFB366] text-white shadow-[0_10px_24px_-6px_rgba(255,138,31,0.75)] -translate-y-0.5'
                        : 'bg-white/[0.05] border-white/10 text-[#C9C0B7] hover:bg-white/[0.1]'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#181411] border border-white/15 flex items-center justify-center shrink-0">
                      {thumb ? (
                        <SmartImage
                          src={thumb}
                          alt={catLabel}
                          fallbackLabel={catLabel}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-bold text-[#FF9B3D]">
                          {catLabel.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold max-w-[74px] truncate">{catLabel}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 3D Interactive Chef's Special / Limited Time Offer Spotlight Card */}
        {!search && activeCategoryId === 'all' && !favoritesOnly && !offersOnly && activeSpotlight && (
          <section className="pb-7">
            <TiltCard3D
              maxTilt={5}
              onClick={() => openDishDetail(activeSpotlight)}
              className="rounded-[26px] bg-gradient-to-br from-[#2B1F16] via-[#1C1612] to-[#13100E] border border-[#FF9B3D]/30 shadow-[0_20px_45px_-16px_rgba(0,0,0,0.85),0_0_32px_-12px_rgba(255,138,31,0.35)] overflow-hidden cursor-pointer"
            >
              <div className="p-5 sm:p-7 grid sm:grid-cols-12 gap-5 items-center">
                <div className="sm:col-span-7 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#FFAE4A]">
                      <Flame className="w-3.5 h-3.5 text-[#FF8A1F] fill-[#FF8A1F]" />
                      {hasActiveDiscount(activeSpotlight)
                        ? lang === 'hi'
                          ? 'सीमित समय का ऑफ़र'
                          : 'Limited Time Offer'
                        : lang === 'hi'
                          ? 'शेफ की खास पसंद'
                          : "Chef's Special"}
                    </span>
                    {displayPromo && effectivePlan.promoBannerEnabled && (
                      <>
                        <span aria-hidden="true" className="text-white/30">
                          ·
                        </span>
                        <span className="text-[#D4C7BA] truncate max-w-[260px]">
                          {displayPromo}
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                    {getItemName(activeSpotlight)}
                  </h2>

                  {getItemDescription(activeSpotlight) && (
                    <p className="text-xs sm:text-sm text-[#B8AFA6] leading-relaxed line-clamp-2 max-w-md">
                      {getItemDescription(activeSpotlight)}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-extrabold text-[#FFA142] tabular-nums">
                        {formatInr(getEffectiveDishPrice(activeSpotlight))}
                      </span>
                      {hasActiveDiscount(activeSpotlight) && (
                        <span className="font-mono text-sm text-[#857C73] line-through tabular-nums">
                          {formatInr(activeSpotlight.price)}
                        </span>
                      )}
                    </div>

                    {hasActiveDiscount(activeSpotlight) && (
                      <span className="px-2.5 py-1 rounded-full bg-white/10 border border-[#FF9B3D]/40 text-[11px] font-extrabold text-[#FFB86C] tabular-nums">
                        {getDiscountPercent(activeSpotlight)}% OFF
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        adjustCartQty(activeSpotlight, 1);
                      }}
                      className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#FF942E] to-[#E56200] hover:brightness-110 text-white text-xs sm:text-sm font-extrabold shadow-[0_10px_24px_-6px_rgba(255,138,31,0.7)] transition-transform active:scale-95 whitespace-nowrap"
                    >
                      {lang === 'hi' ? 'अभी ऑर्डर करें' : 'Order Now'}
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    {hasDirectQrPayment && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[#C5BAB0]">
                        <QrCode className="w-3.5 h-3.5 text-[#FF9B3D]" />
                        {lang === 'hi' ? 'सीधा UPI QR' : 'Direct Shop UPI QR'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Dramatic Floating 3D Food Showcase Visual */}
                <div className="sm:col-span-5 relative">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-4 rounded-full blur-2xl opacity-45"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(255, 138, 31, 0.55), transparent 70%)',
                    }}
                  />
                  <div className="relative aspect-[16/10] sm:aspect-[4/3] rounded-2xl overflow-hidden border border-white/15 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.85)] bg-[#14110F]">
                    <SmartImage
                      src={activeSpotlight.imageUrl}
                      alt={getItemName(activeSpotlight)}
                      fallbackLabel={getItemName(activeSpotlight)}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => adjustCartQty(activeSpotlight, 1, e)}
                      aria-label={`Quick add ${getItemName(activeSpotlight)}`}
                      className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-gradient-to-br from-[#FF9933] to-[#E05E00] text-white flex items-center justify-center shadow-[0_8px_20px_rgba(255,138,31,0.75)] hover:scale-105 active:scale-95 transition-transform"
                    >
                      <Plus className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>
            </TiltCard3D>

            {/* Spotlight Pagination Dots */}
            {spotlightDishes.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3.5">
                {spotlightDishes.map((dish, idx) => {
                  const active = idx === heroSlideIdx % spotlightDishes.length;
                  return (
                    <button
                      key={`dot-${dish.id}`}
                      type="button"
                      onClick={() => setHeroSlideIdx(idx)}
                      aria-label={`Show special ${idx + 1}: ${dish.name}`}
                      className={`h-2 rounded-full transition-all duration-200 ${
                        active ? 'w-7 bg-[#FF8A1F]' : 'w-2 bg-white/25 hover:bg-white/45'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Active Offer/Saved Filter Banner */}
        {(offersOnly || favoritesOnly) && (
          <div className="mb-5 rounded-2xl bg-[#1C1612] border border-[#FF8A1F]/35 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-bold text-[#FFAE4A] flex items-center gap-2">
              {offersOnly ? <Tag className="w-4 h-4" /> : <Heart className="w-4 h-4 fill-[#E11D48] text-[#E11D48]" />}
              {offersOnly
                ? lang === 'hi'
                  ? 'डिस्काउंट वाले व्यंजन'
                  : 'Showing Discounted Offers'
                : lang === 'hi'
                  ? 'आपके पसंदीदा व्यंजन'
                  : 'Showing Saved Favorites'}
            </p>
            <button
              type="button"
              onClick={() => {
                setOffersOnly(false);
                setFavoritesOnly(false);
              }}
              className="text-xs font-bold text-white/80 hover:text-white underline"
            >
              {lang === 'hi' ? 'सभी दिखाएं' : 'Show all'}
            </button>
          </div>
        )}

        {/* Popular Today Section */}
        {!search && activeCategoryId === 'all' && !favoritesOnly && !offersOnly && popularItems.length > 0 && (
          <section className="pb-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#FF8A1F] fill-[#FF8A1F]" />
                {lang === 'hi' ? 'आज के लोकप्रिय व्यंजन' : 'Popular Today'}
              </h2>
              <a
                href="#menu-catalog"
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#FF9B3D] hover:text-[#FFB86C] whitespace-nowrap"
              >
                {lang === 'hi' ? 'सभी देखें' : 'View All'}
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-5">
              {popularItems.map((item) => renderDishCard3D(item, 'pop'))}
            </div>
          </section>
        )}

        {/* Full Categorized Menu Grid */}
        <main id="menu-catalog" className="space-y-9 scroll-mt-16">
          {groupedByCategory.length === 0 ? (
            <div className="rounded-3xl bg-[#181411] border border-white/10 p-10 text-center">
              <p className="text-base font-bold text-white mb-1">
                {lang === 'hi' ? 'कोई व्यंजन नहीं मिला' : 'No matching dishes'}
              </p>
              <p className="text-sm text-[#A69E96] mb-4">
                {items.length === 0
                  ? 'This restaurant has not added dishes yet.'
                  : lang === 'hi'
                    ? 'अपनी खोज या फ़िल्टर बदलकर देखें।'
                    : 'Try clearing your search or switching filters.'}
              </p>
              {(search || dietFilter !== 'all' || activeCategoryId !== 'all' || offersOnly || favoritesOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDietFilter('all');
                    setActiveCategoryId('all');
                    setOffersOnly(false);
                    setFavoritesOnly(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#FF8A1F] text-white text-xs font-bold"
                >
                  {lang === 'hi' ? 'फ़िल्टर रीसेट करें' : 'Reset filters'}
                </button>
              )}
            </div>
          ) : (
            groupedByCategory.map(({ category, items: catItems }) => (
              <section key={category.id} aria-labelledby={`cat-${category.id}`} className="space-y-4">
                <div className="flex items-baseline justify-between border-b border-white/10 pb-2.5">
                  <h2
                    id={`cat-${category.id}`}
                    className="text-lg sm:text-xl font-extrabold text-white tracking-tight"
                  >
                    {getCategoryName(category)}
                  </h2>
                  <span className="text-xs font-medium text-[#9B9188] tabular-nums">
                    {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-5">
                  {catItems.map((item) => renderDishCard3D(item, 'cat'))}
                </div>
              </section>
            ))
          )}
        </main>

        {/* Subtle Dark Footer */}
        <footer className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8D847B]">
          <p className="text-center sm:text-left">
            {restaurant.name}
            {restaurant.city ? ` · ${restaurant.city}` : ''}
            {lang === 'hi' ? ' · सभी मूल्य INR में' : ' · Prices in INR'}
          </p>
          {!effectivePlan.customBranding && (
            <Link to="/" className="inline-flex items-center gap-2 hover:text-white">
              <span>Digital menu by</span>
              <MenuQrBrand size="sm" inverted />
            </Link>
          )}
        </footer>
      </div>

      {/* Sleek Floating Bottom Thumb-Zone Navigation Dock (Compact <= 60px, mirrors reference screenshot) */}
      <nav
        aria-label="Menu quick navigation"
        className="fixed bottom-3 left-3 right-3 z-40 max-w-md mx-auto"
      >
        <div className="h-[60px] rounded-full bg-[#191613]/92 backdrop-blur-xl border border-white/14 shadow-[0_18px_40px_-8px_rgba(0,0,0,0.85)] px-2 grid grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => {
              setOffersOnly(false);
              setFavoritesOnly(false);
              setActiveCategoryId('all');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors ${
              !offersOnly && !favoritesOnly && !cartOpen && !assistantOpen
                ? 'text-[#FF942E]'
                : 'text-[#9B9188] hover:text-white'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="text-[10px] font-bold">{lang === 'hi' ? 'होम' : 'Home'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOffersOnly((prev) => !prev);
              setFavoritesOnly(false);
              setActiveCategoryId('all');
            }}
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors ${
              offersOnly ? 'text-[#FF942E]' : 'text-[#9B9188] hover:text-white'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span className="text-[10px] font-bold">{lang === 'hi' ? 'ऑफ़र' : 'Offers'}</span>
            {discountedCount > 0 && (
              <span className="absolute top-1.5 right-3.5 w-1.5 h-1.5 rounded-full bg-[#FF8A1F]" />
            )}
          </button>

          {/* Center Highlighted Cart & Direct QR Pay Trigger */}
          <button
            type="button"
            onClick={() => {
              setCheckoutStep('cart');
              setCartOpen(true);
            }}
            aria-label="Open order cart and pay"
            className="relative -mt-4 mx-auto w-13 h-13 rounded-full bg-gradient-to-br from-[#FF9933] to-[#E05E00] text-white flex flex-col items-center justify-center shadow-[0_10px_24px_-4px_rgba(255,138,31,0.85)] border-2 border-[#0D0B0A] active:scale-95 transition-transform"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartTotalQty > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-[#171923] font-mono text-[10px] font-extrabold flex items-center justify-center tabular-nums shadow">
                {cartTotalQty}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setFavoritesOnly((prev) => !prev);
              setOffersOnly(false);
            }}
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors ${
              favoritesOnly ? 'text-[#FF942E]' : 'text-[#9B9188] hover:text-white'
            }`}
          >
            <Heart className={`w-4 h-4 ${favoritesOnly ? 'fill-[#FF942E]' : ''}`} />
            <span className="text-[10px] font-bold">
              {favoriteCount > 0 ? `${lang === 'hi' ? 'पसंद' : 'Saved'} (${favoriteCount})` : lang === 'hi' ? 'पसंद' : 'Saved'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-full transition-colors ${
              assistantOpen ? 'text-[#FF942E]' : 'text-[#9B9188] hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-bold">{lang === 'hi' ? 'सहायक' : 'Ask AI'}</span>
          </button>
        </div>
      </nav>

      {/* Immersive Dark Frosted Glass Dish Detail Sheet (Mirrors right phone screen in both references) */}
      <AnimatePresence>
        {selectedDish && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setSelectedDish(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.85 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md max-h-[92vh] rounded-t-[30px] sm:rounded-[30px] bg-[#14110F] border border-white/12 overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Full-Bleed Dramatic Food Photo Stage */}
              <div className="relative aspect-[16/11] w-full bg-[#0D0B0A] shrink-0">
                <SmartImage
                  src={selectedDish.imageUrl}
                  alt={getItemName(selectedDish)}
                  fallbackLabel={getItemName(selectedDish)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14110F] via-transparent to-black/40" />

                <button
                  type="button"
                  onClick={() => setSelectedDish(null)}
                  aria-label="Close dish details"
                  className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/70"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(selectedDish.id)}
                  aria-label="Toggle favorite"
                  className={`absolute top-4 right-4 w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${
                    favorites[selectedDish.id]
                      ? 'bg-[#E11D48] border-[#FB7185] text-white'
                      : 'bg-black/50 border-white/15 text-white hover:bg-black/70'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${favorites[selectedDish.id] ? 'fill-white' : ''}`}
                  />
                </button>
              </div>

              {/* Overlapping Frosted Details Body */}
              <div className="-mt-6 relative z-10 rounded-t-[28px] bg-[#161311] border-t border-white/10 p-5 sm:p-6 space-y-5 overflow-y-auto">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
                      {getItemName(selectedDish)}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-[#B8AFA6]">
                      <DietaryMark foodType={selectedDish.foodType} />
                      <span>{FOOD_TYPE_LABELS[selectedDish.foodType]}</span>
                      {selectedDish.isFeatured && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#FFAE4A] font-semibold">Bestseller</span>
                        </>
                      )}
                      {hasActiveDiscount(selectedDish) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#34D399] font-bold">
                            {getDiscountPercent(selectedDish)}% OFF
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-mono text-2xl font-extrabold text-[#FFA142] tabular-nums">
                      {formatInr(getEffectiveDishPrice(selectedDish))}
                    </p>
                    {hasActiveDiscount(selectedDish) && (
                      <p className="font-mono text-xs text-[#8A8178] line-through tabular-nums">
                        {formatInr(selectedDish.price)}
                      </p>
                    )}
                  </div>
                </div>

                {getItemDescription(selectedDish) && (
                  <p className="text-xs sm:text-sm text-[#B8AFA6] leading-relaxed">
                    {getItemDescription(selectedDish)}
                  </p>
                )}

                {selectedDish.isAvailable && (
                  <>
                    {/* Choose Quantity Bar */}
                    <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {lang === 'hi' ? 'मात्रा चुनें' : 'Choose Quantity'}
                      </span>
                      <div className="inline-flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-mono text-sm font-bold text-white min-w-[20px] text-center tabular-nums">
                          {detailQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailQty((q) => Math.min(25, q + 1))}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Kitchen Preferences (Free Customization Notes) */}
                    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          {lang === 'hi' ? 'स्वाद पसंद' : 'Spice & Prep'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {(['Regular', 'Mild', 'Medium', 'Spicy'] as SpicePref[]).map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => setDetailSpice(lvl)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                detailSpice === lvl
                                  ? 'bg-[#FF8A1F] border-[#FFB366] text-white'
                                  : 'bg-white/[0.04] border-white/10 text-[#B8AFA6]'
                              }`}
                            >
                              {lvl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/8">
                        <span className="text-xs text-[#D4C9BF]">No Onion / No Garlic</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={detailNoOnion}
                          onClick={() => setDetailNoOnion((v) => !v)}
                          className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                            detailNoOnion ? 'bg-[#FF8A1F]' : 'bg-white/15'
                          }`}
                        >
                          <span
                            className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                              detailNoOnion ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-[#D4C9BF]">Extra Dip / Chutney on side</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={detailExtraSauce}
                          onClick={() => setDetailExtraSauce((v) => !v)}
                          className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                            detailExtraSauce ? 'bg-[#FF8A1F]' : 'bg-white/15'
                          }`}
                        >
                          <span
                            className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                              detailExtraSauce ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Full-Width Glowing Add to Order CTA */}
                    <button
                      type="button"
                      onClick={addDishFromDetail}
                      className="w-full min-h-[50px] rounded-2xl bg-gradient-to-r from-[#FF942E] to-[#E25A00] hover:brightness-110 text-white text-sm font-extrabold flex items-center justify-center gap-3 shadow-[0_12px_28px_-6px_rgba(255,138,31,0.75)] active:scale-[0.98] transition-transform"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>{lang === 'hi' ? 'ऑर्डर में जोड़ें' : 'Add to Order'}</span>
                      <span className="opacity-45">|</span>
                      <span className="font-mono tabular-nums">
                        {formatInr(getEffectiveDishPrice(selectedDish) * detailQty)}
                      </span>
                    </button>
                  </>
                )}

                {!selectedDish.isAvailable && (
                  <p className="text-center text-xs font-semibold text-[#9E958C] py-2">
                    {lang === 'hi' ? 'यह व्यंजन अभी उपलब्ध नहीं है' : 'Currently sold out'}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart & Pay Directly on Shopkeeper's Uploaded QR Drawer */}
      <AnimatePresence>
        {cartOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-end sm:p-4"
            onClick={() => setCartOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md max-h-[92vh] rounded-t-[30px] sm:rounded-[30px] bg-[#161311] border border-white/12 flex flex-col overflow-hidden shadow-2xl text-white"
            >
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {checkoutStep === 'pay' && (
                    <button
                      type="button"
                      onClick={() => setCheckoutStep('cart')}
                      aria-label="Back to cart"
                      className="p-1.5 -ml-1.5 rounded-lg text-[#B8AFA6] hover:text-white hover:bg-white/10"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base font-extrabold text-white truncate">
                      {checkoutStep === 'cart'
                        ? lang === 'hi'
                          ? 'आपका ऑर्डर कार्ट'
                          : 'Your Order Cart'
                        : checkoutStep === 'pay'
                          ? lang === 'hi'
                            ? 'दुकानदार के QR पर भुगतान करें'
                            : 'Pay Directly on Shop QR'
                          : lang === 'hi'
                            ? 'ऑर्डर रसीद तैयार है'
                            : 'Order Summary Ready'}
                    </h2>
                    <p className="text-[11px] text-[#9E958C] truncate">
                      {restaurant.name}
                      {orderTable ? ` · Table ${orderTable}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  aria-label="Close cart"
                  className="p-1.5 text-[#9E958C] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* STEP 1: CART ITEMS */}
              {checkoutStep === 'cart' && (
                <>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {cartEntries.length === 0 ? (
                      <div className="py-12 text-center space-y-3">
                        <div className="w-14 h-14 rounded-2xl bg-[#FF8A1F]/15 text-[#FF9B3D] flex items-center justify-center mx-auto">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-bold text-white">
                          {lang === 'hi' ? 'आपका कार्ट खाली है' : 'Your cart is empty'}
                        </p>
                        <p className="text-xs text-[#A69E96]">
                          {lang === 'hi'
                            ? 'ऑर्डर जोड़ने के लिए किसी भी व्यंजन के + बटन पर टैप करें।'
                            : 'Tap the glowing orange + button on any dish to add it.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {cartEntries.map(({ dish, qty, unitPrice, regularPrice, lineTotal }) => {
                            const discounted = regularPrice > unitPrice;
                            return (
                              <div
                                key={dish.id}
                                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <SmartImage
                                    src={dish.imageUrl}
                                    alt={getItemName(dish)}
                                    className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <DietaryMark foodType={dish.foodType} />
                                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                                        {getItemName(dish)}
                                      </p>
                                    </div>
                                    <div className="flex items-baseline gap-1.5 mt-0.5">
                                      <span className="font-mono text-xs font-bold text-[#FFA142] tabular-nums">
                                        {formatInr(lineTotal)}
                                      </span>
                                      {discounted && (
                                        <span className="font-mono text-[11px] text-[#857C73] line-through tabular-nums">
                                          {formatInr(regularPrice * qty)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => adjustCartQty(dish, -1)}
                                    aria-label="Decrease quantity"
                                    className="w-8 h-8 rounded-lg border border-white/15 bg-white/[0.05] flex items-center justify-center text-white hover:border-[#FF8A1F]"
                                  >
                                    {qty === 1 ? (
                                      <Trash2 className="w-3.5 h-3.5 text-[#F87171]" />
                                    ) : (
                                      <Minus className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <span className="font-mono text-xs font-bold w-5 text-center tabular-nums">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => adjustCartQty(dish, 1)}
                                    aria-label="Increase quantity"
                                    className="w-8 h-8 rounded-lg bg-[#FF8A1F] text-white flex items-center justify-center hover:bg-[#E5720C]"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Diner Details */}
                        <div className="pt-2 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-semibold text-[#B8AFA6] mb-1">
                                Table # (optional)
                              </label>
                              <input
                                type="text"
                                maxLength={20}
                                value={orderTable}
                                onChange={(e) => setOrderTable(e.target.value)}
                                placeholder="e.g., 4"
                                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-xs text-white placeholder:text-[#7D756D] focus:outline-none focus:ring-2 focus:ring-[#FF8A1F]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#B8AFA6] mb-1">
                                Your name (optional)
                              </label>
                              <input
                                type="text"
                                maxLength={60}
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="e.g., Aarav"
                                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-xs text-white placeholder:text-[#7D756D] focus:outline-none focus:ring-2 focus:ring-[#FF8A1F]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#B8AFA6] mb-1">
                              Kitchen note (optional)
                            </label>
                            <input
                              type="text"
                              maxLength={140}
                              value={orderNote}
                              onChange={(e) => setOrderNote(e.target.value)}
                              placeholder="Less spicy, no onions, extra ice..."
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-xs text-white placeholder:text-[#7D756D] focus:outline-none focus:ring-2 focus:ring-[#FF8A1F]"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {cartEntries.length > 0 && (
                    <div className="p-5 border-t border-white/10 bg-[#1B1714] space-y-3 shrink-0">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-[#B8AFA6]">
                          <span>Item subtotal ({cartTotalQty})</span>
                          <span className="font-mono tabular-nums">
                            {formatInr(cartRegularSubtotal)}
                          </span>
                        </div>
                        {cartTotalSavings > 0 && (
                          <div className="flex items-center justify-between font-semibold text-[#34D399]">
                            <span>Discount savings</span>
                            <span className="font-mono tabular-nums">
                              -{formatInr(cartTotalSavings)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-base font-extrabold text-white pt-1.5 border-t border-white/10">
                          <span>Total to Pay</span>
                          <span className="font-mono tabular-nums text-[#FFA142]">
                            {formatInr(cartPayableTotal)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCheckoutStep('pay')}
                        className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#FF942E] to-[#E25A00] hover:brightness-110 text-white text-sm font-extrabold shadow-[0_10px_24px_-6px_rgba(255,138,31,0.7)] transition-transform active:scale-[0.98]"
                      >
                        <QrCode className="w-4 h-4" />
                        {hasDirectQrPayment
                          ? `Proceed to Pay ${formatInr(cartPayableTotal)}`
                          : `Continue to Summary (${formatInr(cartPayableTotal)})`}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* STEP 2: PAY DIRECTLY ON SHOPKEEPER'S UPLOADED QR */}
              {checkoutStep === 'pay' && (
                <>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="rounded-2xl bg-[#FF8A1F]/15 border border-[#FF8A1F]/35 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[#FFC078]">
                          Pay directly to {restaurant.name}
                        </p>
                        <p className="font-mono text-2xl font-extrabold text-white tabular-nums">
                          {formatInr(cartPayableTotal)}
                        </p>
                      </div>
                      {cartTotalSavings > 0 && (
                        <span className="text-xs font-bold text-[#34D399] tabular-nums">
                          Saved {formatInr(cartTotalSavings)}
                        </span>
                      )}
                    </div>

                    {hasDirectQrPayment ? (
                      <div className="space-y-4">
                        {/* Multiple Direct UPI App Options (Paytm, BHIM UPI, Google Pay, PhonePe, Any UPI) */}
                        <div className="rounded-2xl bg-white/[0.04] border border-white/12 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-extrabold text-white">
                              {lang === 'hi'
                                ? 'सीधे UPI ऐप से भुगतान करें'
                                : 'Pay Directly via UPI App'}
                            </p>
                            <span className="text-[10px] font-bold text-[#34D399] uppercase tracking-wider">
                              0% Fee
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {UPI_APP_OPTIONS.map((app) => {
                              const isSelected = selectedUpiApp === app.id;
                              const deepLink = upiQueryString ? app.buildUri(upiQueryString) : '';

                              if (deepLink) {
                                return (
                                  <a
                                    key={app.id}
                                    href={deepLink}
                                      onClick={() => {
                                        setSelectedUpiApp(app.id);
                                        setUpiLaunchNotice(
                                          `Opening ${app.name} with ${formatInr(cartPayableTotal)} pre-filled. On desktop? Scan the QR below.`
                                        );
                                        if (restaurant) {
                                          void recordPublicMenuEvent(restaurant, 'upi_pay_click', telemetrySource, {
                                            amountInr: cartPayableTotal,
                                            upiApp: app.name,
                                          });
                                        }
                                      }}
                                      className={`min-h-[48px] px-3 py-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                                        isSelected
                                          ? 'bg-white/[0.11] border-[#FF942E] shadow-[0_0_16px_rgba(255,138,31,0.28)]'
                                          : 'bg-white/[0.04] border-white/12 hover:bg-white/[0.08]'
                                      }`}
                                    >
                                      <span
                                        className={`w-9 h-7 rounded-lg ${app.accentBg} ${app.accentText} text-[10px] font-black flex items-center justify-center shrink-0 tracking-tight`}
                                      >
                                        {app.shortTag}
                                      </span>
                                      <div className="min-w-0 text-left">
                                        <p className="text-xs font-bold text-white truncate">
                                          {app.name}
                                        </p>
                                        <p className="text-[10px] text-[#A69E96] truncate">
                                          Tap to pay
                                        </p>
                                      </div>
                                    </a>
                                  );
                                }

                                return (
                                  <button
                                    key={app.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedUpiApp(app.id);
                                      setUpiLaunchNotice(
                                        `Open ${app.name} and scan the shopkeeper's QR code below to pay ${formatInr(cartPayableTotal)}.`
                                      );
                                      if (restaurant) {
                                        void recordPublicMenuEvent(restaurant, 'upi_pay_click', telemetrySource, {
                                          amountInr: cartPayableTotal,
                                          upiApp: app.name,
                                        });
                                      }
                                    }}
                                    className={`min-h-[48px] px-3 py-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                                      isSelected
                                        ? 'bg-white/[0.11] border-[#FF942E]'
                                        : 'bg-white/[0.04] border-white/12 hover:bg-white/[0.08]'
                                    }`}
                                  >
                                    <span
                                      className={`w-9 h-7 rounded-lg ${app.accentBg} ${app.accentText} text-[10px] font-black flex items-center justify-center shrink-0 tracking-tight`}
                                    >
                                      {app.shortTag}
                                    </span>
                                    <div className="min-w-0 text-left">
                                      <p className="text-xs font-bold text-white truncate">
                                        {app.name}
                                      </p>
                                      <p className="text-[10px] text-[#A69E96] truncate">
                                        Scan QR below
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {upiPayUri && (
                              <a
                                href={upiPayUri}
                                onClick={() => {
                                  setSelectedUpiApp('other');
                                  setUpiLaunchNotice(
                                    `Launching your default UPI app for ${formatInr(cartPayableTotal)}.`
                                  );
                                  if (restaurant) {
                                    void recordPublicMenuEvent(restaurant, 'upi_pay_click', telemetrySource, {
                                      amountInr: cartPayableTotal,
                                      upiApp: 'Any UPI App',
                                    });
                                  }
                                }}
                              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/12 text-xs font-bold text-white transition-colors"
                            >
                              <Smartphone className="w-3.5 h-3.5 text-[#FF9B3D]" />
                              {lang === 'hi'
                                ? 'किसी अन्य UPI ऐप से भुगतान करें'
                                : 'Pay with Any Other UPI App (CRED, Amazon Pay, WhatsApp)'}
                            </a>
                          )}

                          {upiLaunchNotice && (
                            <p className="text-[11px] text-[#FFC078] bg-[#FF8A1F]/12 border border-[#FF8A1F]/25 rounded-xl px-3 py-2 leading-relaxed">
                              {upiLaunchNotice}
                            </p>
                          )}
                        </div>

                        {/* Shopkeeper Uploaded QR / Dynamic Scannable UPI QR */}
                        <div className="rounded-2xl bg-white/[0.04] border border-white/12 p-5 text-center space-y-3.5">
                          <p className="text-xs font-semibold text-[#E6DDD4]">
                            {uploadedPaymentQrUrl
                              ? "Or scan shopkeeper's Payment QR with Paytm, BHIM, GPay, or PhonePe"
                              : `Or scan UPI QR — ${formatInr(cartPayableTotal)} pre-filled`}
                          </p>

                          <div className="inline-flex p-3 rounded-2xl bg-white shadow-xl">
                            {uploadedPaymentQrUrl ? (
                              <SmartImage
                                src={uploadedPaymentQrUrl}
                                alt={`${restaurant.name} UPI Payment QR`}
                                className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg"
                              />
                            ) : generatedUpiQrUrl ? (
                              <img
                                src={generatedUpiQrUrl}
                                alt={`${restaurant.name} UPI Payment QR`}
                                className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                              />
                            ) : (
                              <div className="w-48 h-48 flex items-center justify-center text-[#8B8376]">
                                <Loader2 className="w-6 h-6 animate-spin" />
                              </div>
                            )}
                          </div>

                          {cleanUpiId && (
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <span className="font-mono text-xs font-semibold text-white bg-white/[0.08] border border-white/12 px-3 py-1.5 rounded-lg truncate max-w-[200px]">
                                {cleanUpiId}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleCopyUpi()}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 text-xs font-semibold text-[#E6DDD4] hover:text-white shrink-0"
                              >
                                {copiedUpi ? (
                                  <Check className="w-3.5 h-3.5 text-[#34D399]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                {copiedUpi ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleDownloadPaymentQr}
                            className="w-full min-h-[42px] inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-white/15 bg-white/[0.06] text-white text-xs font-semibold hover:bg-white/[0.12]"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Save QR to Scan from Gallery
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 text-center space-y-2">
                        <QrCode className="w-8 h-8 text-[#FF9B3D] mx-auto" />
                        <p className="text-sm font-bold text-white">Pay at Counter</p>
                        <p className="text-xs text-[#B8AFA6] leading-relaxed">
                          {restaurant.name} has not uploaded a digital payment QR yet. Show your
                          itemized order summary at the counter to pay by cash or counter UPI.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-5 border-t border-white/10 bg-[#1B1714] space-y-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleConfirmOrder(hasDirectQrPayment ? 'upi_qr' : 'counter')}
                      className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#239B69] hover:bg-[#1D8257] text-white text-sm font-bold transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {hasDirectQrPayment
                        ? "I've Paid — Show Order Receipt"
                        : 'Show Order Summary for Counter'}
                    </button>
                    {showWhatsapp && (
                      <a
                        href={buildWhatsappOrderUrl(null)}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#239B69]/45 bg-[#239B69]/10 text-[#6EE7B7] text-xs font-bold hover:bg-[#239B69]/20 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Send Order Directly on WhatsApp
                      </a>
                    )}
                  </div>
                </>
              )}

              {/* STEP 3: ORDER RECEIPT */}
              {checkoutStep === 'receipt' && receipt && (
                <>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="rounded-2xl bg-[#102A1E] border border-[#239B69]/40 p-4 text-center space-y-1.5">
                      <CheckCircle2 className="w-8 h-8 text-[#34D399] mx-auto" />
                      <p className="text-sm font-extrabold text-white">
                        Show this summary to your server
                      </p>
                      <p className="text-xs text-[#6EE7B7] font-mono font-bold">
                        Ref #{receipt.refCode} · {receipt.createdAtLabel}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#A69E96] pb-2 border-b border-white/10">
                        <span>{restaurant.name}</span>
                        <span>
                          {receipt.tableNumber ? `Table ${receipt.tableNumber}` : 'Dine-in / Pickup'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {receipt.items.map((entry) => (
                          <div
                            key={entry.dish.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-white font-medium">
                              {entry.qty} × {getItemName(entry.dish)}
                            </span>
                            <span className="font-mono font-bold text-white tabular-nums">
                              {formatInr(entry.unitPrice * entry.qty)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2.5 border-t border-white/10 space-y-1">
                        {receipt.totalSavings > 0 && (
                          <div className="flex items-center justify-between text-xs font-semibold text-[#34D399]">
                            <span>Discount savings</span>
                            <span className="font-mono tabular-nums">
                              -{formatInr(receipt.totalSavings)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm font-extrabold text-white">
                          <span>
                            {receipt.paymentMethod === 'upi_qr'
                              ? `Paid via ${receipt.upiAppLabel || 'Shop UPI QR'}`
                              : 'Pay at Counter'}
                          </span>
                          <span className="font-mono text-[#FFA142] tabular-nums">
                            {formatInr(receipt.totalPayable)}
                          </span>
                        </div>
                      </div>

                      {(receipt.customerName || receipt.note) && (
                        <div className="pt-2 border-t border-white/10 text-[11px] text-[#A69E96] space-y-0.5">
                          {receipt.customerName && <p>Guest: {receipt.customerName}</p>}
                          {receipt.note && <p>Note: {receipt.note}</p>}
                        </div>
                      )}
                    </div>

                    {/* Post-Payment Google Reviews Card */}
                    <div className="rounded-2xl bg-gradient-to-br from-[#231B13] via-[#1B1612] to-[#151210] border border-[#FF9F43]/35 p-4 space-y-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-extrabold text-white flex items-center gap-1.5">
                            <Star className="w-4 h-4 text-[#FFAE4A] fill-[#FFAE4A]" />
                            {lang === 'hi'
                              ? `${restaurant.name} को Google पर रेट करें`
                              : `Loved ${restaurant.name}? Leave a Google Review`}
                          </p>
                          <p className="text-[11px] text-[#B8AFA6] mt-0.5">
                            {lang === 'hi'
                              ? 'आपकी समीक्षा इस रेस्तरां को आगे बढ़ने में मदद करती है।'
                              : 'Your 10-second review helps this local restaurant grow on Google.'}
                          </p>
                        </div>
                      </div>

                      {/* Interactive 1-5 Star Selector */}
                      <div className="flex items-center justify-center gap-1.5 py-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = star <= (reviewHover || reviewRating);
                          return (
                            <button
                              key={star}
                              type="button"
                              aria-label={`Rate ${star} out of 5 stars`}
                              onMouseEnter={() => setReviewHover(star)}
                              onMouseLeave={() => setReviewHover(0)}
                              onClick={() => setReviewRating(star)}
                              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] flex items-center justify-center transition-transform active:scale-90"
                            >
                              <Star
                                className={`w-6 h-6 transition-colors ${
                                  active
                                    ? 'text-[#FFAE4A] fill-[#FFAE4A]'
                                    : 'text-white/25'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>

                      {/* Quick Highlight Chips */}
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {REVIEW_HIGHLIGHTS.map((tag) => {
                          const selected = reviewTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleReviewTag(tag)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                                selected
                                  ? 'bg-[#FF8A1F] border-[#FFB366] text-white'
                                  : 'bg-white/[0.04] border-white/12 text-[#CFC5BB] hover:text-white'
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>

                      <input
                        type="text"
                        maxLength={180}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder={
                          lang === 'hi'
                            ? 'अपना अनुभव लिखें (वैकल्पिक)...'
                            : 'Optional note to copy into your Google review...'
                        }
                        className="w-full min-h-[38px] px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-xs text-white placeholder:text-[#7D756D] focus:outline-none focus:ring-2 focus:ring-[#FF8A1F]"
                      />

                      <div className="flex items-center gap-2">
                        <a
                          href={googleReviewHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            if (restaurant) {
                              void recordPublicMenuEvent(restaurant, 'review_click', telemetrySource);
                            }
                          }}
                          className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF942E] to-[#E25A00] hover:brightness-110 text-white text-xs font-extrabold shadow-[0_8px_20px_-6px_rgba(255,138,31,0.65)] transition-transform active:scale-[0.98]"
                        >
                          <Star className="w-3.5 h-3.5 fill-white" />
                          <span>
                            {lang === 'hi'
                              ? 'Google पर समीक्षा लिखें'
                              : `Post ${reviewRating}★ Review on Google`}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        {(reviewTags.length > 0 || reviewNote.trim()) && (
                          <button
                            type="button"
                            onClick={() => void handleCopyReviewDraft()}
                            className="min-h-[44px] px-3 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white inline-flex items-center gap-1 shrink-0"
                          >
                            {copiedReviewDraft ? (
                              <Check className="w-3.5 h-3.5 text-[#34D399]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copiedReviewDraft ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 border-t border-white/10 bg-[#1B1714] space-y-2.5 shrink-0">
                    {showWhatsapp && (
                      <a
                        href={buildWhatsappOrderUrl(receipt)}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#239B69] hover:bg-[#1D8257] text-white text-sm font-bold transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Send Confirmation on WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCart({});
                        setOrderNote('');
                        setReceipt(null);
                        setCheckoutStep('cart');
                        setCartOpen(false);
                      }}
                      className="w-full min-h-[42px] py-2.5 px-4 rounded-xl border border-white/15 bg-white/[0.05] text-white text-xs font-bold hover:bg-white/[0.1]"
                    >
                      Done &amp; Clear Cart
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Menu Assistant Drawer (Dark Glass, Closed on Arrival) */}
      <AnimatePresence>
        {assistantOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-end sm:p-4"
            onClick={() => setAssistantOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md h-[82vh] sm:h-[620px] rounded-t-[30px] sm:rounded-[30px] bg-[#161311] border border-white/12 flex flex-col overflow-hidden shadow-2xl text-white"
            >
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#FF9B3D]" />
                    {lang === 'hi' ? 'मेनू सहायक' : 'Menu Assistant'}
                  </h2>
                  <p className="text-[11px] text-[#9E958C] truncate">
                    {lang === 'hi'
                      ? `${restaurant.name} के लाइव मेनू के आधार पर सुझाव`
                      : `Grounded in ${restaurant.name}'s live menu`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssistantOpen(false)}
                  aria-label="Close Menu Assistant"
                  className="p-1.5 text-[#9E958C] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#110E0C]">
                {assistantTurns.length === 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-4 text-xs text-[#D4C9BF] leading-relaxed">
                      {lang === 'hi'
                        ? `नमस्ते! मुझसे ${restaurant.name} के मेनू के बारे में कुछ भी पूछें — बजट कॉम्बो, डिस्काउंट, शाकाहारी विकल्प या पेयरिंग।`
                        : `Ask anything about ${restaurant.name}'s menu — budget combos, active discounts, dietary picks, or drink pairings.`}
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-[#9E958C]">
                        {lang === 'hi' ? 'तुरंत पूछें' : 'Quick questions'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {quickPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void handleAskAssistant(prompt)}
                            className="text-left px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-xs font-medium text-white hover:border-[#FF8A1F] transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  assistantTurns.map((turn) => {
                    const matched =
                      turn.role === 'assistant'
                        ? findRecommendedItems(turn.recommendedDishNames)
                        : [];
                    return (
                      <div
                        key={turn.id}
                        className={`flex flex-col ${
                          turn.role === 'user' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            turn.role === 'user'
                              ? 'bg-[#FF8A1F] text-white font-medium'
                              : 'bg-white/[0.06] border border-white/10 text-[#F2EAE2]'
                          }`}
                        >
                          {turn.text}
                        </div>

                        {matched.length > 0 && (
                          <div className="mt-2 w-full max-w-[92%] space-y-1.5">
                            {matched.map((dish) => (
                              <div
                                key={`${turn.id}-${dish.id}`}
                                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssistantOpen(false);
                                    openDishDetail(dish);
                                  }}
                                  className="flex items-center gap-2 min-w-0 text-left"
                                >
                                  <DietaryMark foodType={dish.foodType} />
                                  <span className="text-xs font-bold text-white truncate">
                                    {getItemName(dish)}
                                  </span>
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-xs font-bold text-[#FFA142] tabular-nums">
                                    {formatInr(getEffectiveDishPrice(dish))}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => adjustCartQty(dish, 1)}
                                    className="px-2.5 py-1 rounded-lg bg-[#FF8A1F] text-white text-[11px] font-bold"
                                  >
                                    + Add
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {assistantLoading && (
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.06] border border-white/10 px-3.5 py-2.5 text-xs text-[#C5BAB0]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF9B3D]" />
                    {lang === 'hi' ? 'मेनू देख रहे हैं...' : 'Checking the menu...'}
                  </div>
                )}

                {assistantError && (
                  <div className="rounded-xl bg-[#3A1616] border border-[#7F2A2A] p-3 text-xs text-[#FCA5A5]">
                    {assistantError}
                  </div>
                )}
                <div ref={assistantEndRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAskAssistant(assistantInput);
                }}
                className="p-3 border-t border-white/10 bg-[#161311] flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  maxLength={280}
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  placeholder={
                    lang === 'hi'
                      ? 'कोई सवाल पूछें (जैसे: वेज स्नैक्स)...'
                      : 'Ask about dishes, spice, budget...'
                  }
                  className="flex-1 min-h-[42px] px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/12 text-xs text-white placeholder:text-[#8A8178] focus:outline-none focus:ring-2 focus:ring-[#FF8A1F]"
                />
                <button
                  type="submit"
                  disabled={assistantLoading || !assistantInput.trim()}
                  aria-label="Send question"
                  className="w-11 h-11 rounded-xl bg-[#FF8A1F] text-white flex items-center justify-center hover:bg-[#E5720C] disabled:opacity-45 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

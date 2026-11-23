import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
} from 'lucide-react';
import { MenuQrBrand, SmartImage } from '../components/BrandUI';
import { ImageUploadField } from '../components/ImageUploadField';
import { useAuth } from '../contexts/AuthContext';
import {
  createCategory,
  createMenuItem,
  createRestaurant,
  getPublicMenuUrl,
  isSlugAvailable,
  listCategories,
  listMenuItems,
  setRestaurantPublished,
  slugify,
  updateRestaurantProfile,
} from '../lib/menuService';
import { downloadPrintableQrPosterPdf, downloadQrPng, generateQrDataUrl } from '../lib/qrExport';
import {
  FOOD_TYPE_LABELS,
  RESTAURANT_TYPE_LABELS,
  type FoodType,
  type Restaurant,
  type RestaurantType,
} from '../types/menuqr';

const ACCENT_PRESETS = [
  { label: 'Marigold Orange', hex: '#FF9F43' },
  { label: 'Emerald Leaf', hex: '#239B69' },
  { label: 'Saffron Spice', hex: '#D97706' },
  { label: 'Terracotta Clay', hex: '#C2410C' },
  { label: 'Espresso Charcoal', hex: '#171923' },
  { label: 'Royal Indigo', hex: '#3730A3' },
];

export function OnboardingPage() {
  const { user, resendVerificationEmail, refreshUser, signOut } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);

  // Step 1 fields
  const [name, setName] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [restaurantType, setRestaurantType] = useState<RestaurantType>('cafe');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [city, setCity] = useState('New Delhi');
  const [address, setAddress] = useState('');

  // Step 2 fields
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [theme, setTheme] = useState('#FF9F43');

  // Step 3 fields
  const [categoryName, setCategoryName] = useState('Signature Dishes');
  const [dishName, setDishName] = useState('');
  const [dishDescription, setDishDescription] = useState('');
  const [dishPrice, setDishPrice] = useState('');
  const [dishFoodType, setDishFoodType] = useState<FoodType>('veg');
  const [dishImageUrl, setDishImageUrl] = useState('');

  // Step 4 state
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user?.email, email]);

  const effectiveSlug = slugify(customSlug || name || 'my-restaurant');

  useEffect(() => {
    if (!name.trim() && !customSlug.trim()) {
      setSlugStatus('idle');
      return;
    }
    const timer = window.setTimeout(async () => {
      setSlugStatus('checking');
      try {
        const ok = await isSlugAvailable(effectiveSlug);
        setSlugStatus(ok ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [effectiveSlug, name, customSlug]);

  useEffect(() => {
    if (step === 4 && restaurant) {
      const url = getPublicMenuUrl(restaurant.slug);
      void generateQrDataUrl(url, '#171923').then(setQrDataUrl);
    }
  }, [step, restaurant]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (name.trim().length < 2) {
      setError('Please enter your restaurant name (at least 2 characters).');
      return;
    }
    if (!city.trim()) {
      setError('Please enter your city.');
      return;
    }
    setSaving(true);
    try {
      const created = await createRestaurant({
        ownerId: user.uid,
        name: name.trim(),
        slug: customSlug.trim() || undefined,
        restaurantType,
        description,
        city,
        address,
        phone,
        email,
      });
      setRestaurant(created);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create restaurant.');
    } finally {
      setSaving(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;
    setError(null);
    setSaving(true);
    try {
      await updateRestaurantProfile(restaurant, {
        logoUrl,
        coverUrl,
        theme,
        onboardingStep: 3,
      });
      setRestaurant({ ...restaurant, logoUrl, coverUrl, theme, onboardingStep: 3 });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save branding.');
    } finally {
      setSaving(false);
    }
  };

  const handleStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant) return;
    setError(null);
    if (!categoryName.trim()) {
      setError('Please enter a category name (e.g., Coffee or Starters).');
      return;
    }
    if (!dishName.trim()) {
      setError('Please enter your first dish name.');
      return;
    }
    const parsedPrice = Number(dishPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Enter a valid price in INR (₹).');
      return;
    }
    setSaving(true);
    try {
      const cat = await createCategory(restaurant, categoryName, 0);
      const updatedAfterCat = { ...restaurant, categoryCount: restaurant.categoryCount + 1 };
      await createMenuItem(updatedAfterCat, {
        categoryId: cat.id,
        name: dishName,
        description: dishDescription,
        price: parsedPrice,
        imageUrl: dishImageUrl,
        foodType: dishFoodType,
        isAvailable: true,
        isFeatured: true,
        sortOrder: 0,
      });
      setRestaurant({
        ...updatedAfterCat,
        dishCount: updatedAfterCat.dishCount + 1,
        onboardingStep: 4,
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save first menu item.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNow = async () => {
    if (!restaurant) return;
    setPublishing(true);
    setError(null);
    try {
      const [cats, items] = await Promise.all([
        listCategories(restaurant.id, restaurant.ownerId),
        listMenuItems(restaurant.id, restaurant.ownerId),
      ]);
      await setRestaurantPublished(restaurant, true, cats, items);
      setRestaurant({ ...restaurant, isPublished: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish menu.');
    } finally {
      setPublishing(false);
    }
  };

  const publicUrl = restaurant ? getPublicMenuUrl(restaurant.slug) : '';

  return (
    <div className="min-h-screen bg-[#FFF9F1] text-[#171923]">
      <header className="bg-white border-b border-[#E9E1D4]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/">
            <MenuQrBrand size="sm" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4 text-xs font-medium text-[#525866]">
            <span className="hidden sm:inline">Step {step} of 4</span>
            <Link to="/dashboard" className="text-[#171923] hover:underline whitespace-nowrap">
              Skip to dashboard
            </Link>
            <button
              type="button"
              disabled={signingOut}
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E6DFD3] bg-white text-[#171923] font-semibold hover:bg-[#FAF6EE] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {user && !user.emailVerified && (
          <div className="mb-6 rounded-xl bg-[#FFF3E3] border border-[#F3D7B3] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#7A440C]">
            <div className="flex items-start gap-2.5">
              <MailCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#C86D14]" />
              <div>
                <p className="font-semibold text-[#171923]">Verify your email ({user.email})</p>
                <p className="mt-0.5 text-[#525866]">
                  You can finish creating your restaurant now — remember to confirm your email for account recovery.
                </p>
                {verificationMsg && (
                  <p className="mt-1 font-medium text-[#239B69]">{verificationMsg}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await resendVerificationEmail();
                  setVerificationMsg('Verification email resent.');
                }}
                className="px-3 py-1.5 rounded-lg border border-[#E6C79C] bg-white text-[#171923] font-semibold hover:bg-[#FAF6EE] whitespace-nowrap"
              >
                Resend link
              </button>
              <button
                type="button"
                onClick={async () => {
                  await refreshUser();
                  setVerificationMsg('Checked verification status.');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#171923] text-white font-semibold hover:bg-[#2A2E3F] whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>
          </div>
        )}
        {/* Progress bar */}
        <div className="grid grid-cols-4 gap-2 mb-8">
          {[
            { num: 1, label: 'Restaurant' },
            { num: 2, label: 'Branding' },
            { num: 3, label: 'First Dish' },
            { num: 4, label: 'QR & Launch' },
          ].map((s) => (
            <div key={s.num} className="space-y-1.5">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  step >= s.num ? 'bg-[#FF9F43]' : 'bg-[#E6DFD3]'
                }`}
              />
              <p
                className={`text-xs font-medium ${
                  step === s.num ? 'text-[#171923]' : 'text-[#8B8376]'
                }`}
              >
                0{s.num}. {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-6 sm:p-9">
          {error && (
            <div className="mb-6 rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]" role="alert">
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Tell us about your restaurant</h1>
                <p className="text-sm text-[#525866] mt-1">
                  This creates your permanent public digital menu link and workspace.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-name">
                    Restaurant name *
                  </label>
                  <input
                    id="ob-name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Spice Courtyard Cafe"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-type">
                    Restaurant type *
                  </label>
                  <select
                    id="ob-type"
                    value={restaurantType}
                    onChange={(e) => setRestaurantType(e.target.value as RestaurantType)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  >
                    {(Object.keys(RESTAURANT_TYPE_LABELS) as RestaurantType[]).map((key) => (
                      <option key={key} value={key}>
                        {RESTAURANT_TYPE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-slug">
                  Permanent menu URL
                </label>
                <div className="flex items-center rounded-xl border border-[#DDD5C7] overflow-hidden focus-within:ring-2 focus-within:ring-[#FF9F43]">
                  <span className="px-3.5 py-2.5 bg-[#FAF6EE] text-xs font-mono text-[#6B7280] border-r border-[#DDD5C7] whitespace-nowrap">
                    /menu/
                  </span>
                  <input
                    id="ob-slug"
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder={effectiveSlug}
                    className="flex-1 px-3 py-2.5 text-sm font-mono focus:outline-none"
                  />
                </div>
                <p className="mt-1.5 text-xs">
                  {slugStatus === 'checking' && <span className="text-[#6B7280]">Checking availability...</span>}
                  {slugStatus === 'available' && (
                    <span className="text-[#239B69] font-medium">
                      /menu/{effectiveSlug} is available
                    </span>
                  )}
                  {slugStatus === 'taken' && (
                    <span className="text-[#C86D14]">
                      /menu/{effectiveSlug} is already taken — we will append a unique number automatically or choose another.
                    </span>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-desc">
                  Short description
                </label>
                <textarea
                  id="ob-desc"
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Specialty North Indian kitchen and freshly brewed filter coffee."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-phone">
                    Contact phone
                  </label>
                  <input
                    id="ob-phone"
                    type="tel"
                    maxLength={24}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98110 12345"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-email">
                    Restaurant email
                  </label>
                  <input
                    id="ob-email"
                    type="email"
                    maxLength={150}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hello@yourrestaurant.in"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-city">
                    City *
                  </label>
                  <input
                    id="ob-city"
                    type="text"
                    required
                    maxLength={80}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="New Delhi"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-address">
                    Street address
                  </label>
                  <input
                    id="ob-address"
                    type="text"
                    maxLength={250}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Block M, Greater Kailash 1, New Delhi"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Continue to branding
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2 */}
          {step === 2 && restaurant && (
            <form onSubmit={handleStep2} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Make your menu look like yours</h1>
                <p className="text-sm text-[#525866] mt-1">
                  Upload a logo, cover photo, and accent color. You can change these anytime.
                </p>
              </div>

              <ImageUploadField
                label="Restaurant logo (optional)"
                value={logoUrl}
                onChange={setLogoUrl}
                aspect="square"
                hint="Square PNG or JPG works best (e.g., 400×400)"
              />

              <ImageUploadField
                label="Cover photograph"
                value={coverUrl}
                onChange={setCoverUrl}
                aspect="wide"
                hint="Wide interior or signature food shot (16:9 recommended)"
                showPresets
              />

              <div className="space-y-2.5">
                <label className="block text-sm font-medium text-[#171923]">Brand accent color</label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {ACCENT_PRESETS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setTheme(c.hex)}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        theme.toLowerCase() === c.hex.toLowerCase()
                          ? 'border-[#171923] bg-[#FAF6EE] text-[#171923]'
                          : 'border-[#E6DFD3] bg-white text-[#525866] hover:border-[#171923]'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                    </button>
                  ))}
                  <input
                    type="color"
                    aria-label="Custom accent color"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-9 h-9 rounded-lg border border-[#DDD5C7] cursor-pointer p-0.5 bg-white"
                  />
                </div>
              </div>

              {/* Mini Live Header Preview */}
              <div className="rounded-xl overflow-hidden border border-[#E6DFD3]">
                <div className="relative h-28 bg-[#171923]">
                  {coverUrl && (
                    <SmartImage src={coverUrl} alt="Cover preview" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-3">
                    {logoUrl && (
                      <SmartImage
                        src={logoUrl}
                        alt="Logo preview"
                        className="w-11 h-11 rounded-lg object-cover border-2 border-white bg-white"
                      />
                    )}
                    <div className="text-white">
                      <p className="font-editorial text-lg font-semibold leading-tight">{restaurant.name}</p>
                      <p className="text-xs text-white/80">{restaurant.city}</p>
                    </div>
                  </div>
                </div>
                <div className="h-1.5" style={{ backgroundColor: theme }} />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-xs font-medium text-[#525866] hover:text-[#171923]"
                >
                  Skip for now
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save & add first dish
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3 */}
          {step === 3 && restaurant && (
            <form onSubmit={handleStep3} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Add your first category & dish</h1>
                <p className="text-sm text-[#525866] mt-1">
                  Start with one bestselling item — you can add the rest inside your dashboard.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-cat">
                  First category name *
                </label>
                <input
                  id="ob-cat"
                  type="text"
                  required
                  maxLength={60}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g., Coffee, Starters, Main Course"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-dish">
                    Dish name *
                  </label>
                  <input
                    id="ob-dish"
                    type="text"
                    required
                    maxLength={100}
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    placeholder="e.g., Tandoori Paneer Tikka"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-price">
                    Price (INR ₹) *
                  </label>
                  <input
                    id="ob-price"
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    required
                    value={dishPrice}
                    onChange={(e) => setDishPrice(e.target.value)}
                    placeholder="249"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Food type</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(FOOD_TYPE_LABELS) as FoodType[]).map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setDishFoodType(ft)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        dishFoodType === ft
                          ? 'bg-[#171923] text-white border-[#171923]'
                          : 'bg-white text-[#4A505E] border-[#DDD5C7] hover:border-[#171923]'
                      }`}
                    >
                      {FOOD_TYPE_LABELS[ft]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="ob-dish-desc">
                  Dish description
                </label>
                <textarea
                  id="ob-dish-desc"
                  rows={2}
                  maxLength={400}
                  value={dishDescription}
                  onChange={(e) => setDishDescription(e.target.value)}
                  placeholder="Served hot with fresh mint chutney and pickled onions."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>

              <ImageUploadField
                label="Food photograph (optional)"
                value={dishImageUrl}
                onChange={setDishImageUrl}
                aspect="landscape"
                showPresets
              />

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="text-xs font-medium text-[#525866] hover:text-[#171923]"
                >
                  Skip for now
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save & generate QR
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 4 */}
          {step === 4 && restaurant && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-[#239B69] mb-1">Workspace ready</p>
                <h1 className="text-2xl font-bold tracking-tight">
                  Your permanent QR code is ready for {restaurant.name}
                </h1>
                <p className="text-sm text-[#525866] mt-1">
                  Publish your menu whenever you are ready so customers scanning your QR code can
                  browse immediately.
                </p>
              </div>

              <div className="grid sm:grid-cols-12 gap-6 items-center bg-[#FAF6EE] rounded-2xl p-6 border border-[#EAE3D7]">
                <div className="sm:col-span-5 flex flex-col items-center">
                  <div className="bg-white p-4 rounded-2xl border border-[#E6DFD3] w-48 h-48 flex items-center justify-center">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Permanent restaurant QR code" className="w-full h-full" />
                    ) : (
                      <Loader2 className="w-6 h-6 animate-spin text-[#8B8376]" />
                    )}
                  </div>
                </div>

                <div className="sm:col-span-7 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-[#525866] mb-1">Permanent Menu URL</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border border-[#DDD5C7] rounded-lg px-3 py-2 text-xs font-mono truncate">
                        {publicUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(publicUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="px-3 py-2 rounded-lg border border-[#DDD5C7] bg-white hover:bg-[#FAF6EE] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-[#239B69]" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {!restaurant.isPublished ? (
                      <button
                        type="button"
                        disabled={publishing}
                        onClick={handlePublishNow}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#239B69] text-white text-xs font-bold hover:bg-[#1D8257] transition-colors"
                      >
                        {publishing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Publish menu live
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#239B69] py-2">
                        <Check className="w-4 h-4" />
                        Live & publicly accessible
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => void downloadQrPng(publicUrl, `${restaurant.slug}-qr`)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold hover:border-[#171923]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PNG
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void downloadPrintableQrPosterPdf({
                          restaurant,
                          destinationUrl: publicUrl,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold hover:border-[#171923]"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Printable PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Link
                  to={`/menu/${restaurant.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#171923] hover:underline"
                >
                  Preview customer menu
                  <ExternalLink className="w-4 h-4" />
                </Link>

                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FF9F43] text-[#171923] text-sm font-bold hover:bg-[#F09134]"
                >
                  Open Owner Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

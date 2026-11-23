import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  MapPin,
  Phone,
  QrCode,
  Save,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import { SmartImage } from '../../components/BrandUI';
import { ImageUploadField } from '../../components/ImageUploadField';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../DashboardLayout';
import { aiFindGooglePlace, type GroundedGooglePlace } from '../../lib/aiService';
import {
  adminActivatePersonalPremiumId,
  getPersonalPremiumUserId,
  redeemPremiumPass,
  updateRestaurantProfile,
  upsertProfile,
} from '../../lib/menuService';
import { ACTIVE_PAYMENT_GATEWAY, getEffectivePlan, PLAN_ORDER, PLANS } from '../../lib/plans';
import { RESTAURANT_TYPE_LABELS, type RestaurantType } from '../../types/menuqr';

const ACCENTS = ['#FF9F43', '#239B69', '#D97706', '#C2410C', '#171923', '#3730A3', '#9F1239'];

export function ProfileTab() {
  const { restaurant, reloadAll } = useDashboard();
  const plan = getEffectivePlan(restaurant);

  const [name, setName] = useState(restaurant.name);
  const [restaurantType, setRestaurantType] = useState<RestaurantType>(restaurant.restaurantType);
  const [description, setDescription] = useState(restaurant.description);
  const [logoUrl, setLogoUrl] = useState(restaurant.logoUrl);
  const [coverUrl, setCoverUrl] = useState(restaurant.coverUrl);
  const [city, setCity] = useState(restaurant.city);
  const [address, setAddress] = useState(restaurant.address);
  const [phone, setPhone] = useState(restaurant.phone);
  const [email, setEmail] = useState(restaurant.email);
  const [openingHours, setOpeningHours] = useState(restaurant.openingHours);
  const [whatsappNumber, setWhatsappNumber] = useState(restaurant.whatsappNumber);
  const [promoBanner, setPromoBanner] = useState(restaurant.promoBanner);
  const [paymentQrUrl, setPaymentQrUrl] = useState(restaurant.paymentQrUrl || '');
  const [upiId, setUpiId] = useState(restaurant.upiId || '');
  const [googleReviewUrl, setGoogleReviewUrl] = useState(restaurant.googleReviewUrl || '');
  const [mapsSearching, setMapsSearching] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsResults, setMapsResults] = useState<GroundedGooglePlace[]>([]);
  const [theme, setTheme] = useState(restaurant.theme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(restaurant.name);
    setRestaurantType(restaurant.restaurantType);
    setDescription(restaurant.description);
    setLogoUrl(restaurant.logoUrl);
    setCoverUrl(restaurant.coverUrl);
    setCity(restaurant.city);
    setAddress(restaurant.address);
    setPhone(restaurant.phone);
    setEmail(restaurant.email);
    setOpeningHours(restaurant.openingHours);
    setWhatsappNumber(restaurant.whatsappNumber);
    setPromoBanner(restaurant.promoBanner);
    setPaymentQrUrl(restaurant.paymentQrUrl || '');
    setUpiId(restaurant.upiId || '');
    setGoogleReviewUrl(restaurant.googleReviewUrl || '');
    setTheme(restaurant.theme);
  }, [restaurant]);

  const handleFindOnGoogleMaps = async () => {
    if (!name.trim()) {
      setMapsError('Enter your restaurant name above first.');
      return;
    }
    setMapsSearching(true);
    setMapsError(null);
    setMapsResults([]);
    try {
      const res = await aiFindGooglePlace({
        restaurantName: name.trim(),
        city: city.trim() || 'New Delhi',
        address: address.trim(),
      });
      if (res.places.length === 0) {
        setMapsError(
          'No exact Google Maps listing returned automatically. You can paste your Google Business review link directly below.'
        );
      } else {
        setMapsResults(res.places);
      }
    } catch (err) {
      setMapsError(err instanceof Error ? err.message : 'Google Maps lookup failed.');
    } finally {
      setMapsSearching(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateRestaurantProfile(restaurant, {
        name,
        restaurantType,
        description,
        logoUrl,
        coverUrl,
        city,
        address,
        phone,
        email,
        openingHours,
        whatsappNumber,
        promoBanner,
        paymentQrUrl,
        upiId,
        googleReviewUrl,
        theme,
      });
      await reloadAll();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#171923]">
          Restaurant Profile & Branding
        </h1>
        <p className="text-sm text-[#525866] mt-1">
          Update how your restaurant looks to diners scanning your QR menu.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-5"
        >
          {error && (
            <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3 text-xs text-[#B42318]">
              {error}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-name">
                Restaurant name *
              </label>
              <input
                id="prof-name"
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-type">
                Restaurant type
              </label>
              <select
                id="prof-type"
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
            <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-desc">
              Description
            </label>
            <textarea
              id="prof-desc"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>

          <ImageUploadField label="Logo" value={logoUrl} onChange={setLogoUrl} aspect="square" />
          <ImageUploadField
            label="Cover photograph"
            value={coverUrl}
            onChange={setCoverUrl}
            aspect="wide"
            showPresets
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-city">
                City *
              </label>
              <input
                id="prof-city"
                type="text"
                required
                maxLength={80}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-hours">
                Opening hours
              </label>
              <input
                id="prof-hours"
                type="text"
                maxLength={120}
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="Daily · 9:00 AM – 11:00 PM"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-addr">
              Full address
            </label>
            <input
              id="prof-addr"
              type="text"
              maxLength={250}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-phone">
                Phone number
              </label>
              <input
                id="prof-phone"
                type="tel"
                maxLength={24}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-email">
                Contact email
              </label>
              <input
                id="prof-email"
                type="email"
                maxLength={150}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
          </div>

          {/* Direct Shopkeeper Payment QR (Available on all plans) */}
          <div className="pt-4 border-t border-[#EFE8DC] space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#171923] flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#FF9F43]" />
                  Direct UPI Payment QR (Customer Cart Checkout)
                </p>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Upload your shop&apos;s Google Pay, PhonePe, Paytm, or BharatPe QR code so customers can
                  pay you directly from their cart with zero commission.
                </p>
              </div>
            </div>

            <ImageUploadField
              label="Shopkeeper Payment QR image"
              value={paymentQrUrl}
              onChange={setPaymentQrUrl}
              aspect="square"
              hint="JPG, PNG, or WebP of your UPI standee or merchant QR code."
            />

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-upi">
                Merchant UPI ID (enables 1-tap Paytm, BHIM UPI, GPay, PhonePe &amp; auto-QR)
              </label>
              <input
                id="prof-upi"
                type="text"
                maxLength={100}
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g., yourcafe@okicici or 9811000000@paytm"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
          </div>

          {/* Post-Payment Google Reviews Link */}
          <div className="pt-4 border-t border-[#EFE8DC] space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#171923] flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#FF9F43] fill-[#FF9F43]" />
                  Google Reviews Link (Shown After Payment)
                </p>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Customers are invited to rate their meal and post a Google Review right on their
                  post-payment receipt screen.
                </p>
              </div>
              <button
                type="button"
                disabled={mapsSearching}
                onClick={() => void handleFindOnGoogleMaps()}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DDD5C7] bg-[#FAF6EE] hover:border-[#171923] text-xs font-semibold text-[#171923] whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {mapsSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                Find on Google Maps
              </button>
            </div>

            {mapsError && (
              <p className="text-xs text-[#B42318] bg-[#FFF1EE] border border-[#F5C9C2] rounded-xl px-3 py-2">
                {mapsError}
              </p>
            )}

            {mapsResults.length > 0 && (
              <div className="rounded-xl bg-[#FAF6EE] border border-[#EAE3D7] p-3 space-y-2">
                <p className="text-[11px] font-semibold text-[#525866]">
                  Google Maps matches — pick your restaurant:
                </p>
                {mapsResults.map((place) => (
                  <div
                    key={place.uri}
                    className="flex items-center justify-between gap-3 bg-white rounded-lg border border-[#EAE3D7] p-2.5"
                  >
                    <div className="min-w-0">
                      <a
                        href={place.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-[#171923] hover:text-[#C86D14] inline-flex items-center gap-1 truncate max-w-full"
                      >
                        <span className="truncate">{place.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {place.reviewSnippet && (
                        <p className="text-[11px] text-[#6B7280] line-clamp-1 mt-0.5">
                          {place.reviewSnippet}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleReviewUrl(place.uri);
                        setMapsResults([]);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#171923] text-white text-[11px] font-semibold hover:bg-[#2A2E3F] whitespace-nowrap shrink-0"
                    >
                      Use link
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-google-review">
                Google Review / Google Maps URL (optional)
              </label>
              <input
                id="prof-google-review"
                type="url"
                maxLength={500}
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://g.page/r/your-restaurant/review or Google Maps link"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
          </div>

          {/* Growth/Pro Features */}
          <div className="pt-4 border-t border-[#EFE8DC] space-y-4">
            <p className="text-xs font-semibold text-[#525866]">
              Growth & Pro features {plan.whatsappOrdering ? '· Active on your plan' : '· Unlocks on Growth (₹499/mo)'}
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-wa">
                  WhatsApp ordering number
                </label>
                <input
                  id="prof-wa"
                  type="tel"
                  maxLength={24}
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="919811000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="prof-promo">
                  Promotional banner text
                </label>
                <input
                  id="prof-promo"
                  type="text"
                  maxLength={160}
                  value={promoBanner}
                  onChange={(e) => setPromoBanner(e.target.value)}
                  placeholder="Happy Hours 4 PM – 7 PM · 1+1 on Cold Coffee"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold">Accent color</label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setTheme(hex)}
                  aria-label={`Select accent color ${hex}`}
                  className={`w-8 h-8 rounded-lg border-2 transition-transform ${
                    theme.toLowerCase() === hex.toLowerCase()
                      ? 'border-[#171923] scale-105'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom color picker"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-8 h-8 rounded-lg border border-[#DDD5C7] cursor-pointer p-0.5"
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-between gap-3">
            {saved ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#239B69]">
                <CheckCircle2 className="w-4 h-4" />
                Changes saved live
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={saving || restaurant.isSuspended}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save profile
            </button>
          </div>
        </form>

        {/* Live Mobile Customer Preview */}
        <aside className="lg:col-span-5 sticky top-24">
          <p className="text-xs font-semibold text-[#6B7280] mb-2.5">Live Customer Menu Preview</p>
          <div className="bg-white rounded-2xl border border-[#E6DFD3] overflow-hidden">
            <div className="relative h-44 bg-[#171923]">
              <SmartImage
                src={coverUrl}
                alt={name}
                fallbackLabel={name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#171923]/90 via-[#171923]/30 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3">
                {logoUrl && (
                  <SmartImage
                    src={logoUrl}
                    alt="Logo"
                    className="w-12 h-12 rounded-xl object-cover border-2 border-white bg-white shrink-0"
                  />
                )}
                <div className="text-white min-w-0">
                  <p className="text-[11px] text-white/80">
                    {RESTAURANT_TYPE_LABELS[restaurantType]} · {city || 'City'}
                  </p>
                  <p className="font-editorial text-xl font-semibold truncate">{name || 'Your Restaurant'}</p>
                </div>
              </div>
            </div>
            <div className="h-1.5" style={{ backgroundColor: theme }} />
            <div className="p-4 space-y-2.5 text-xs text-[#525866]">
              {description && <p className="leading-relaxed text-[#373D4A]">{description}</p>}
              {openingHours && (
                <p className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#8B8376]" />
                  {openingHours}
                </p>
              )}
              {address && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#8B8376]" />
                  {address}
                </p>
              )}
              {phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#8B8376]" />
                  {phone}
                </p>
              )}
              {promoBanner && (
                <p className="pt-2 border-t border-[#EFE8DC] font-medium text-[#9A5B13]">
                  {promoBanner}
                </p>
              )}
              {(paymentQrUrl || upiId.trim()) && (
                <div className="pt-2.5 border-t border-[#EFE8DC] flex items-center gap-3">
                  {paymentQrUrl ? (
                    <SmartImage
                      src={paymentQrUrl}
                      alt="Payment QR preview"
                      className="w-12 h-12 rounded-lg object-contain border border-[#E6DFD3] bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#FFF3E3] text-[#C86D14] flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[#239B69]">Direct Multi-UPI Pay Ready</p>
                    <p className="text-[11px] text-[#6B7280] truncate">
                      {upiId.trim()
                        ? `${upiId.trim()} · Paytm, BHIM, GPay, PhonePe`
                        : 'Uploaded payment QR active in customer cart'}
                    </p>
                  </div>
                </div>
              )}
              {googleReviewUrl.trim() && (
                <div className="pt-2.5 border-t border-[#EFE8DC] flex items-center gap-2 text-[#9A5B13] font-semibold">
                  <Star className="w-3.5 h-3.5 text-[#FF9F43] fill-[#FF9F43] shrink-0" />
                  <span className="truncate">Post-Payment Google Review Prompt Active</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function SettingsTab() {
  const { user, profile } = useAuth();
  const { restaurant, auditLogs, togglePublished, togglingPublish } = useDashboard();
  const [fullName, setFullName] = useState(profile?.fullName || user?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      await upsertProfile({
        uid: user.uid,
        fullName,
        email: user.email || '',
        phone,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#171923]">Settings</h1>
        <p className="text-sm text-[#525866] mt-1">
          Manage your menu publication state, owner contact details, and workspace security logs.
        </p>
      </div>

      {/* Menu Publication */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#171923]">Public menu visibility</h2>
          <p className="text-xs text-[#525866] mt-1">
            {restaurant.isPublished
              ? `Your menu is currently live at /menu/${restaurant.slug} for anyone scanning your QR code.`
              : 'Your menu is currently hidden in Draft Mode. Public visitors cannot view unpublished menus.'}
          </p>
        </div>
        <button
          type="button"
          disabled={togglingPublish || restaurant.isSuspended}
          onClick={() => void togglePublished()}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 ${
            restaurant.isPublished
              ? 'border border-[#DDD5C7] bg-white text-[#171923] hover:border-[#B42318] hover:text-[#B42318]'
              : 'bg-[#239B69] text-white hover:bg-[#1D8257]'
          }`}
        >
          {togglingPublish ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {restaurant.isPublished ? 'Unpublish to Draft' : 'Publish Menu Live'}
        </button>
      </section>

      {/* Owner Account */}
      <form
        onSubmit={handleSaveAccount}
        className="bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-4"
      >
        <h2 className="text-base font-bold text-[#171923]">Owner account details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" htmlFor="set-name">
              Full name
            </label>
            <input
              id="set-name"
              type="text"
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" htmlFor="set-phone">
              Phone number
            </label>
            <input
              id="set-phone"
              type="tel"
              maxLength={24}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98110 00000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
        </div>
        <div className="text-xs text-[#6B7280]">
          Signed in email: <span className="font-mono text-[#171923]">{user?.email}</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          {saved ? (
            <span className="text-xs font-semibold text-[#239B69]">Account details updated</span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save account'}
          </button>
        </div>
      </form>

      {/* Audit Log */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-3">
        <h2 className="text-base font-bold text-[#171923]">Audit log</h2>
        <p className="text-xs text-[#6B7280]">Immutable record of workspace and admin updates.</p>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-[#8B8376] py-4">No audit entries yet.</p>
        ) : (
          <div className="divide-y divide-[#EFE8DC] pt-2">
            {auditLogs.slice(0, 12).map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <span className="text-[#171923] font-medium">{log.details}</span>
                <span className="font-mono text-[#8B8376] shrink-0">{log.action}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function SubscriptionTab() {
  const { user, isAdmin } = useAuth();
  const { restaurant, items, subscriptions, reloadAll } = useDashboard();
  const effectivePlan = getEffectivePlan(restaurant);

  const personalPremiumId = user ? getPersonalPremiumUserId(user.uid) : '';
  const [passInput, setPassInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [activatingPersonal, setActivatingPersonal] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(value);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  const handleRedeemPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passInput.trim()) return;
    setRedeeming(true);
    setPassError(null);
    setPassSuccess(null);
    try {
      const redeemed = await redeemPremiumPass(restaurant, passInput);
      await reloadAll();
      setPassInput('');
      setPassSuccess(
        `Premium User ID ${redeemed.id} activated! Your workspace is now on MENUQR ${redeemed.tier.toUpperCase()} with AI Tracking Analytics unlocked.`
      );
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Unable to redeem Premium User ID.');
    } finally {
      setRedeeming(false);
    }
  };

  const handleActivatePersonalPro = async () => {
    setActivatingPersonal(true);
    setPassError(null);
    setPassSuccess(null);
    try {
      const res = await adminActivatePersonalPremiumId(restaurant);
      await reloadAll();
      setPassSuccess(
        `Personal Pro User ID ${res.passId} is active on ${restaurant.name} through ${res.expiresAt}.`
      );
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Unable to activate personal Pro ID.');
    } finally {
      setActivatingPersonal(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#171923]">Subscription & Billing</h1>
        <p className="text-sm text-[#525866] mt-1">
          Transparent monthly plans in INR. Activate instantly with a Premium User ID or request manual billing.
        </p>
      </div>

      {/* Current Plan Summary */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#6B7280]">Current active plan</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-bold text-[#171923]">{effectivePlan.name}</h2>
            <span className="font-mono text-sm font-semibold text-[#C86D14] tabular-nums">
              {effectivePlan.priceLabel}
              {effectivePlan.monthlyInr > 0 ? '/month' : ' · Free tier'}
            </span>
          </div>
          <p className="text-xs text-[#525866]">
            Status: <strong className="capitalize">{restaurant.subscriptionStatus}</strong>
            {restaurant.subscriptionExpiresAt ? ` · Valid through ${restaurant.subscriptionExpiresAt}` : ''}
            {' · '}
            Dishes used:{' '}
            <span className="font-mono tabular-nums font-semibold">
              {items.length}
              {effectivePlan.dishLimit !== null ? ` / ${effectivePlan.dishLimit}` : ' (Unlimited)'}
            </span>
          </p>
          {restaurant.premiumPassId && (
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFF3E3] border border-[#F5D6AD] text-[11px] font-semibold text-[#9A5B13]">
                <Crown className="w-3.5 h-3.5 text-[#C86D14]" />
                Active Premium User ID:
                <span className="font-mono text-[#171923]">{restaurant.premiumPassId}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleCopy(restaurant.premiumPassId || '')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E6DFD3] text-[11px] font-semibold text-[#525866] hover:text-[#171923]"
              >
                {copiedId === restaurant.premiumPassId ? (
                  <Check className="w-3 h-3 text-[#239B69]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copiedId === restaurant.premiumPassId ? 'Copied' : 'Copy ID'}
              </button>
              <Link
                to="/dashboard/analytics"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#239B69] hover:underline"
              >
                <Sparkles className="w-3 h-3" />
                Open AI Tracking Analytics
              </Link>
            </div>
          )}
        </div>

        <div className="max-w-sm rounded-xl bg-[#FAF6EE] border border-[#EAE3D7] p-4 text-xs text-[#4A505E] leading-relaxed">
          <p className="font-semibold text-[#171923] mb-1">Manual Activation (Launch MVP)</p>
          <p>{ACTIVE_PAYMENT_GATEWAY.requestUpgradeNote}</p>
        </div>
      </section>

      {/* Premium User ID Activation & Admin Personal ID */}
      <section className="grid lg:grid-cols-12 gap-5">
        {isAdmin && personalPremiumId && (
          <div className="lg:col-span-6 bg-[#171923] text-white rounded-2xl p-6 flex flex-col justify-between gap-4 border border-white/10">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#FF9F43]">
                <Crown className="w-3.5 h-3.5" />
                Your Personal Premium User ID
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <code className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 font-mono text-base sm:text-lg font-bold tracking-wider text-[#FF9F43]">
                  {personalPremiumId}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(personalPremiumId)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
                >
                  {copiedId === personalPremiumId ? (
                    <Check className="w-3.5 h-3.5 text-[#239B69]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedId === personalPremiumId ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Tied to your verified owner account ({user?.email}). Activate it in one click to
                unlock MENUQR Pro + AI Tracking Analytics on <strong className="text-white">{restaurant.name}</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {restaurant.plan === 'pro' &&
              restaurant.subscriptionStatus === 'active' &&
              restaurant.premiumPassId === personalPremiumId ? (
                <Link
                  to="/dashboard/analytics"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#239B69] text-white text-xs font-bold hover:bg-[#1D8257]"
                >
                  <Sparkles className="w-4 h-4" />
                  Pro Active · Open AI Analytics
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={activatingPersonal || restaurant.isSuspended}
                  onClick={() => void handleActivatePersonalPro()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-50"
                >
                  {activatingPersonal ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Crown className="w-4 h-4" />
                  )}
                  Activate Pro with My ID
                </button>
              )}
              <Link
                to="/admin"
                className="text-xs font-semibold text-white/80 hover:text-white underline"
              >
                Mint client IDs in Admin →
              </Link>
            </div>
          </div>
        )}

        <form
          onSubmit={handleRedeemPass}
          className={`${
            isAdmin && personalPremiumId ? 'lg:col-span-6' : 'lg:col-span-12'
          } bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-4`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFF3E3] text-[#C86D14] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171923]">Redeem Premium User ID</h2>
              <p className="text-xs text-[#525866] mt-0.5">
                Have a MENUQR Growth or Pro User ID (e.g. <span className="font-mono">MQR-PRO-XXXX-XXXX</span>)?
                Enter it below to unlock AI Tracking Analytics and unlimited menus immediately.
              </p>
            </div>
          </div>

          {passError && (
            <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] px-3.5 py-2.5 text-xs text-[#B42318]">
              {passError}
            </div>
          )}
          {passSuccess && (
            <div className="rounded-xl bg-[#EAF7F1] border border-[#B9E6D2] px-3.5 py-2.5 text-xs text-[#19744E] font-medium">
              {passSuccess}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value.toUpperCase())}
              placeholder="MQR-PRO-XXXX-XXXX"
              maxLength={32}
              aria-label="Premium User ID"
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] font-mono text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
            <button
              type="submit"
              disabled={redeeming || !passInput.trim() || restaurant.isSuspended}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-bold hover:bg-[#2A2E3F] disabled:opacity-50 whitespace-nowrap"
            >
              {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Activate Premium ID
            </button>
          </div>
        </form>
      </section>

      {/* Plan Comparison */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {PLAN_ORDER.map((planId) => {
          const p = PLANS[planId];
          const isCurrent = restaurant.plan === planId && restaurant.subscriptionStatus === 'active';
          return (
            <div
              key={p.id}
              className={`rounded-2xl p-6 border flex flex-col justify-between ${
                isCurrent
                  ? 'bg-[#171923] text-white border-[#171923]'
                  : 'bg-white text-[#171923] border-[#E6DFD3]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-base font-bold">{p.name}</h3>
                  {isCurrent && (
                    <span className="text-xs font-semibold text-[#FF9F43]">Current</span>
                  )}
                </div>
                <p className={`text-xs mb-4 ${isCurrent ? 'text-white/70' : 'text-[#6B7280]'}`}>
                  {p.audience}
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums mb-5">
                  {p.priceLabel}
                  <span className={`text-xs font-normal ${isCurrent ? 'text-white/65' : 'text-[#6B7280]'}`}>
                    {p.monthlyInr === 0 ? ' forever' : '/mo'}
                  </span>
                </p>

                <ul className="space-y-2.5 text-xs mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                          isCurrent ? 'text-[#FF9F43]' : 'text-[#239B69]'
                        }`}
                      />
                      <span className={isCurrent ? 'text-white/90' : 'text-[#373D4A]'}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {isCurrent ? (
                <div className="text-center py-2 rounded-xl bg-white/10 text-xs font-semibold text-white">
                  Active Plan
                </div>
              ) : (
                <a
                  href={`mailto:billing@menuqr.in?subject=${encodeURIComponent(
                    `Upgrade ${restaurant.name} (${restaurant.slug}) to MENUQR ${p.name}`
                  )}&body=${encodeURIComponent(
                    `Restaurant: ${restaurant.name}\nSlug: /menu/${restaurant.slug}\nRequested Plan: ${p.name} (${p.priceLabel}/month)\n`
                  )}`}
                  className="w-full inline-flex items-center justify-center py-2.5 px-3 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] transition-colors"
                >
                  Request {p.name} Activation
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Subscription History */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] p-6">
        <h2 className="text-base font-bold text-[#171923] mb-4">Subscription history</h2>
        {subscriptions.length === 0 ? (
          <p className="text-xs text-[#6B7280]">No billing records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EFE8DC] text-[#6B7280]">
                  <th className="pb-2.5 font-semibold">Plan</th>
                  <th className="pb-2.5 font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Expires</th>
                  <th className="pb-2.5 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EFE8]">
                {subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="py-3 font-semibold capitalize text-[#171923]">{sub.plan}</td>
                    <td className="py-3 capitalize text-[#525866]">{sub.status}</td>
                    <td className="py-3 font-mono text-[#525866]">{sub.expiresAt || '—'}</td>
                    <td className="py-3 text-[#525866]">{sub.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

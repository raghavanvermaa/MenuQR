import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  KeyRound,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../DashboardLayout';
import {
  aiGenerateTrackingAnalytics,
  type AiAnalyticsReport,
  type AiMenuEngineeringItem,
} from '../../lib/aiService';
import {
  adminActivatePersonalPremiumId,
  getPersonalPremiumUserId,
  listMenuEvents,
  redeemPremiumPass,
} from '../../lib/menuService';
import { formatInr, getEffectiveDishPrice, getEffectivePlan, hasActiveDiscount } from '../../lib/plans';
import type { MenuEvent } from '../../types/menuqr';

type RangePreset = 'today' | '7d' | '30d' | 'all';

function getEventDate(ev: MenuEvent): Date | null {
  const raw = ev.createdAt;
  if (!raw) return null;
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

const TAG_STYLES: Record<AiMenuEngineeringItem['tag'], string> = {
  Star: 'bg-[#EAF7F1] text-[#1B6E4B] border-[#BFE6D4]',
  'Hidden Gem': 'bg-[#FFF3E3] text-[#9A5B13] border-[#F3D7B3]',
  'Price Opportunity': 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]',
  'Needs Boost': 'bg-[#FFF1EE] text-[#B42318] border-[#F5C9C2]',
};

export function AiAnalyticsTab() {
  const { user, isAdmin } = useAuth();
  const { restaurant, categories, items, events: contextEvents, reloadAll } = useDashboard();

  const effectivePlan = getEffectivePlan(restaurant);
  const isPremiumUnlocked = effectivePlan.analyticsEnabled;

  const [menuEvents, setMenuEvents] = useState<MenuEvent[]>(contextEvents);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [range, setRange] = useState<RangePreset>('7d');

  // AI Report state
  const [report, setReport] = useState<AiAnalyticsReport | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Premium Pass activation state
  const [passInput, setPassInput] = useState('');
  const [activatingPass, setActivatingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const personalAdminPassId = user ? getPersonalPremiumUserId(user.uid) : '';

  useEffect(() => {
    setMenuEvents(contextEvents);
  }, [contextEvents]);

  const refreshEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const fresh = await listMenuEvents(restaurant.id, restaurant.ownerId);
      setMenuEvents(fresh);
    } catch {
      // Keep context events on transient read error
    } finally {
      setLoadingEvents(false);
    }
  }, [restaurant.id, restaurant.ownerId]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  // Reset AI report when switching restaurant
  useEffect(() => {
    setReport(null);
    setGeneratedAt(null);
    setAiError(null);
  }, [restaurant.id]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const telemetry = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let rangeStart: Date | null = null;
    let rangeLabel = 'Last 7 days';

    if (range === 'today') {
      rangeStart = startOfToday;
      rangeLabel = 'Today';
    } else if (range === '7d') {
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(startOfToday.getDate() - 6);
      rangeLabel = 'Last 7 days';
    } else if (range === '30d') {
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(startOfToday.getDate() - 29);
      rangeLabel = 'Last 30 days';
    } else {
      rangeLabel = 'All time';
    }

    const filtered = menuEvents.filter((ev) => {
      if (!rangeStart) return true;
      const d = getEventDate(ev);
      return d ? d >= rangeStart : false;
    });

    let menuViews = 0;
    let qrScans = 0;
    let dishViews = 0;
    let cartAdds = 0;
    let upiPayClicks = 0;
    let reviewClicks = 0;
    let cartIntentValueInr = 0;
    let upiIntentValueInr = 0;

    const serviceBands = [
      { id: 'morning', label: 'Morning (6a–11a)', count: 0 },
      { id: 'lunch', label: 'Lunch (11a–3p)', count: 0 },
      { id: 'hightea', label: 'High Tea (3p–6p)', count: 0 },
      { id: 'dinner', label: 'Dinner (6p–10p)', count: 0 },
      { id: 'late', label: 'Late Night (10p–6a)', count: 0 },
    ];

    const sourceMap = new Map<string, number>();
    const dishStatsMap = new Map<string, { name: string; views: number; cartAdds: number; price: number }>();
    const upiAppMap = new Map<string, number>();

    const itemPriceLookup = new Map(items.map((i) => [i.id, getEffectiveDishPrice(i)]));

    for (const ev of filtered) {
      if (ev.eventType === 'menu_view') menuViews += 1;
      else if (ev.eventType === 'qr_scan') qrScans += 1;
      else if (ev.eventType === 'dish_view') dishViews += 1;
      else if (ev.eventType === 'add_to_cart') {
        cartAdds += 1;
        cartIntentValueInr += Number(ev.amountInr || 0);
      } else if (ev.eventType === 'upi_pay_click') {
        upiPayClicks += 1;
        upiIntentValueInr += Number(ev.amountInr || 0);
        const app = (ev.upiApp || 'UPI QR').trim();
        upiAppMap.set(app, (upiAppMap.get(app) || 0) + 1);
      } else if (ev.eventType === 'review_click') {
        reviewClicks += 1;
      }

      // Track entry sources for menu opens
      if (ev.eventType === 'menu_view' || ev.eventType === 'qr_scan') {
        const cleanSrc = ev.source?.startsWith('table:')
          ? `Table ${ev.source.slice(6)}`
          : ev.eventType === 'qr_scan'
            ? 'QR Poster'
            : 'Direct Link';
        sourceMap.set(cleanSrc, (sourceMap.get(cleanSrc) || 0) + 1);
      }

      // Service band bucket
      const dt = getEventDate(ev);
      if (dt) {
        const h = dt.getHours();
        if (h >= 6 && h < 11) serviceBands[0].count += 1;
        else if (h >= 11 && h < 15) serviceBands[1].count += 1;
        else if (h >= 15 && h < 18) serviceBands[2].count += 1;
        else if (h >= 18 && h < 22) serviceBands[3].count += 1;
        else serviceBands[4].count += 1;
      }

      // Dish engagement tracking
      if (ev.dishName && (ev.eventType === 'dish_view' || ev.eventType === 'add_to_cart')) {
        const key = ev.dishId || ev.dishName;
        const current = dishStatsMap.get(key) || {
          name: ev.dishName,
          views: 0,
          cartAdds: 0,
          price: (ev.dishId ? itemPriceLookup.get(ev.dishId) : undefined) ?? Number(ev.amountInr || 0),
        };
        if (ev.eventType === 'dish_view') current.views += 1;
        if (ev.eventType === 'add_to_cart') current.cartAdds += 1;
        dishStatsMap.set(key, current);
      }
    }

    const totalOpens = menuViews + qrScans;
    const topSources = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const topDishes = Array.from(dishStatsMap.values())
      .sort((a, b) => b.cartAdds * 2 + b.views - (a.cartAdds * 2 + a.views))
      .slice(0, 6);

    const engagedNames = new Set(Array.from(dishStatsMap.values()).map((d) => d.name.toLowerCase()));
    const zeroEngagementDishes = items
      .filter((i) => i.isAvailable && !engagedNames.has(i.name.toLowerCase()))
      .slice(0, 6)
      .map((i) => ({
        name: i.name,
        price: getEffectiveDishPrice(i),
        category: catMap.get(i.categoryId) || 'Menu',
      }));

    const upiAppBreakdown = Array.from(upiAppMap.entries())
      .map(([app, count]) => ({ app, count }))
      .sort((a, b) => b.count - a.count);

    const peakBand = [...serviceBands].sort((a, b) => b.count - a.count)[0];
    const peakBandLabel = peakBand && peakBand.count > 0 ? peakBand.label : 'No peak data yet';
    const maxBandCount = Math.max(1, ...serviceBands.map((b) => b.count));

    const availableDishes = items.filter((i) => i.isAvailable).length;
    const discountedDishes = items.filter((i) => hasActiveDiscount(i)).length;
    const avgDishPriceInr =
      items.length > 0
        ? Math.round(items.reduce((sum, i) => sum + getEffectiveDishPrice(i), 0) / items.length)
        : 0;

    return {
      rangeLabel,
      totalEvents: filtered.length,
      totalOpens,
      menuViews,
      qrScans,
      dishViews,
      cartAdds,
      upiPayClicks,
      reviewClicks,
      cartIntentValueInr: Math.round(cartIntentValueInr),
      upiIntentValueInr: Math.round(upiIntentValueInr),
      serviceBands,
      maxBandCount,
      peakBandLabel,
      topSources,
      topDishes,
      zeroEngagementDishes,
      upiAppBreakdown,
      availableDishes,
      discountedDishes,
      avgDishPriceInr,
    };
  }, [menuEvents, range, items, catMap]);

  const handleRunAiAnalysis = async () => {
    setGeneratingAi(true);
    setAiError(null);
    try {
      const result = await aiGenerateTrackingAnalytics({
        restaurantName: restaurant.name,
        restaurantType: restaurant.restaurantType,
        city: restaurant.city,
        plan: restaurant.plan,
        rangeLabel: telemetry.rangeLabel,
        metrics: {
          totalEvents: telemetry.totalEvents,
          menuViews: telemetry.menuViews,
          qrScans: telemetry.qrScans,
          dishViews: telemetry.dishViews,
          cartAdds: telemetry.cartAdds,
          upiPayClicks: telemetry.upiPayClicks,
          reviewClicks: telemetry.reviewClicks,
          cartIntentValueInr: telemetry.cartIntentValueInr,
          upiIntentValueInr: telemetry.upiIntentValueInr,
          hasPaymentQrOrUpi: Boolean(restaurant.paymentQrUrl || restaurant.upiId),
          hasGoogleReviewUrl: Boolean(restaurant.googleReviewUrl),
          isPublished: restaurant.isPublished,
          totalDishes: items.length,
          availableDishes: telemetry.availableDishes,
          discountedDishes: telemetry.discountedDishes,
          avgDishPriceInr: telemetry.avgDishPriceInr,
          peakBandLabel: telemetry.peakBandLabel,
          serviceBands: telemetry.serviceBands.map((b) => ({ label: b.label, count: b.count })),
          topSources: telemetry.topSources,
          topDishes: telemetry.topDishes,
          zeroEngagementDishes: telemetry.zeroEngagementDishes,
          upiAppBreakdown: telemetry.upiAppBreakdown,
        },
      });
      setReport(result);
      setGeneratedAt(
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate AI analytics report.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleRedeemPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passInput.trim()) return;
    setActivatingPass(true);
    setPassError(null);
    setPassSuccess(null);
    try {
      const redeemed = await redeemPremiumPass(restaurant, passInput);
      setPassSuccess(
        `Activated ${redeemed.tier.toUpperCase()} plan with Premium User ID ${redeemed.id}!`
      );
      setPassInput('');
      await reloadAll();
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Could not redeem Premium User ID.');
    } finally {
      setActivatingPass(false);
    }
  };

  const handleActivatePersonalAdminPro = async () => {
    setActivatingPass(true);
    setPassError(null);
    setPassSuccess(null);
    try {
      const res = await adminActivatePersonalPremiumId(restaurant);
      setPassSuccess(
        `Personal Premium User ID ${res.passId} activated! Pro plan is live through ${res.expiresAt}.`
      );
      await reloadAll();
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Could not activate Pro plan.');
    } finally {
      setActivatingPass(false);
    }
  };

  const handleCopyId = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const funnelSteps = [
    {
      label: 'Menu Opens & Scans',
      count: telemetry.totalOpens,
      sub: `${telemetry.qrScans} QR · ${telemetry.menuViews} direct`,
      color: 'bg-[#171923]',
    },
    {
      label: 'Dish Detail Opens',
      count: telemetry.dishViews,
      sub:
        telemetry.totalOpens > 0
          ? `${Math.round((telemetry.dishViews / telemetry.totalOpens) * 100)}% engagement`
          : 'Tap rate on dishes',
      color: 'bg-[#FF9F43]',
    },
    {
      label: 'Added to Cart',
      count: telemetry.cartAdds,
      sub:
        telemetry.cartIntentValueInr > 0
          ? `${formatInr(telemetry.cartIntentValueInr)} cart intent`
          : 'Cart additions',
      color: 'bg-[#E67E22]',
    },
    {
      label: 'UPI Pay Launches',
      count: telemetry.upiPayClicks,
      sub:
        telemetry.upiIntentValueInr > 0
          ? `${formatInr(telemetry.upiIntentValueInr)} UPI intent`
          : 'Paytm / BHIM / GPay',
      color: 'bg-[#239B69]',
    },
    {
      label: 'Google Review Clicks',
      count: telemetry.reviewClicks,
      sub: 'Post-payment ratings',
      color: 'bg-[#3730A3]',
    },
  ];
  const maxFunnel = Math.max(1, ...funnelSteps.map((s) => s.count));

  // Locked Premium Gate for Free & Starter plans
  if (!isPremiumUnlocked) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#C86D14] mb-1">
              <Crown className="w-4 h-4" />
              PREMIUM GROWTH &amp; PRO FEATURE
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171923]">
              AI Tracking Analytics
            </h1>
            <p className="text-sm text-[#525866] mt-1">
              Real-time diner funnel tracking, peak-hour heatmaps, UPI payment attribution, and
              AI menu engineering for {restaurant.name}.
            </p>
          </div>
        </div>

        {/* Admin Instant Personal Pro ID Banner */}
        {isAdmin && personalAdminPassId && (
          <section className="rounded-2xl bg-[#171923] text-white p-6 border border-[#2D3142] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FF9F43]">
                <KeyRound className="w-4 h-4" />
                YOUR PERSONAL PREMIUM USER ID IS READY
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <code className="px-3 py-1.5 rounded-lg bg-white/10 font-mono text-sm font-bold tracking-wider text-white">
                  {personalAdminPassId}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyId(personalAdminPassId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-[#34D399]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId ? 'Copied' : 'Copy ID'}
                </button>
              </div>
              <p className="text-xs text-white/70 max-w-xl">
                Signed in as verified administrator ({user?.email}). Activate Pro instantly on{' '}
                <strong>{restaurant.name}</strong> to unlock full AI Tracking Analytics, unlimited
                dishes, and table QR attribution.
              </p>
            </div>
            <button
              type="button"
              disabled={activatingPass}
              onClick={() => void handleActivatePersonalAdminPro()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-extrabold hover:bg-[#F09134] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {activatingPass ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crown className="w-4 h-4" />
              )}
              Activate Pro with My ID
            </button>
          </section>
        )}

        {/* Redeem Any Issued Premium User ID */}
        <section className="bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFF3E3] text-[#C86D14] flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171923]">
                Unlock AI Tracking Analytics with a Premium User ID
              </h2>
              <p className="text-xs text-[#525866] mt-1 leading-relaxed">
                Currently on <strong>{effectivePlan.name}</strong>. Enter a MENUQR Growth or Pro
                Premium User ID below to activate AI Tracking Analytics immediately, or compare
                plans in Subscription.
              </p>
            </div>
          </div>

          {passError && (
            <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3 text-xs text-[#B42318]">
              {passError}
            </div>
          )}
          {passSuccess && (
            <div className="rounded-xl bg-[#EAF7F1] border border-[#BFE6D4] p-3 text-xs text-[#1B6E4B] font-semibold">
              {passSuccess}
            </div>
          )}

          <form onSubmit={handleRedeemPass} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value.toUpperCase())}
              placeholder="Enter Premium User ID (e.g., MQR-PRO-XXXX-XXXX)"
              maxLength={64}
              className="flex-1 px-4 py-3 rounded-xl border border-[#DDD5C7] font-mono text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
            <button
              type="submit"
              disabled={activatingPass || !passInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#171923] text-white text-xs font-bold hover:bg-[#2A2E3F] disabled:opacity-50 whitespace-nowrap"
            >
              {activatingPass ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              Redeem Premium ID
            </button>
          </form>

          <div className="grid sm:grid-cols-3 gap-4 pt-4 border-t border-[#EFE8DC]">
            {[
              {
                icon: TrendingUp,
                title: 'Full Diner Conversion Funnel',
                desc: 'Track QR scan → Dish View → Add to Cart → Paytm/BHIM UPI Pay → Google Review.',
              },
              {
                icon: Sparkles,
                title: 'AI Menu Engineering',
                desc: 'Automatically tags Stars, Hidden Gems, Price Opportunities, and dishes needing boosts.',
              },
              {
                icon: Clock,
                title: 'Peak Service Heatmaps',
                desc: 'Pinpoint Morning Coffee, Lunch, High Tea, and Dinner spikes to time happy hours.',
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="rounded-xl bg-[#FAF7F2] border border-[#EFE8DC] p-4 space-y-2"
                >
                  <Icon className="w-4 h-4 text-[#C86D14]" />
                  <p className="text-xs font-bold text-[#171923]">{feat.title}</p>
                  <p className="text-[11px] text-[#525866] leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 text-xs">
            <Link
              to="/dashboard/subscription"
              className="inline-flex items-center gap-1.5 font-semibold text-[#C86D14] hover:underline"
            >
              View Growth (₹499/mo) &amp; Pro (₹999/mo) plans
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="font-semibold text-[#171923] hover:underline"
              >
                Generate IDs in Admin Console →
              </Link>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#C86D14]">
              <Crown className="w-3.5 h-3.5" />
              {effectivePlan.name} Intelligence
            </span>
            {restaurant.premiumPassId && (
              <button
                type="button"
                onClick={() => void handleCopyId(restaurant.premiumPassId || '')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#171923] text-[#FF9F43] font-mono text-[11px] font-semibold hover:bg-[#2A2E3F]"
                title="Copy your Premium User ID"
              >
                <span>ID: {restaurant.premiumPassId}</span>
                {copiedId ? <Check className="w-3 h-3 text-[#34D399]" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171923]">
            AI Tracking Analytics
          </h1>
          <p className="text-xs sm:text-sm text-[#525866]">
            Live diner telemetry from <span className="font-mono text-[#171923]">menu_events</span>{' '}
            + Gemini hospitality intelligence for <strong>{restaurant.name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-[#E6DFD3]">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  range === opt.id
                    ? 'bg-[#171923] text-white'
                    : 'text-[#525866] hover:text-[#171923]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loadingEvents}
            onClick={() => void refreshEvents()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold text-[#525866] hover:text-[#171923] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
            Sync
          </button>

          <button
            type="button"
            disabled={generatingAi}
            onClick={() => void handleRunAiAnalysis()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {generatingAi ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {report ? 'Refresh AI Insights' : 'Run AI Analytics'}
          </button>
        </div>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-[#171923] text-white rounded-2xl p-4 col-span-2 sm:col-span-1">
          <p className="text-[11px] text-white/70">Tracked Signals</p>
          <p className="mt-1.5 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#FF9F43]">
            {telemetry.totalEvents}
          </p>
          <p className="text-[11px] text-white/65 mt-1">{telemetry.rangeLabel}</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4">
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Dish Views</span>
            <Flame className="w-3.5 h-3.5 text-[#C86D14]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
            {telemetry.dishViews}
          </p>
          <p className="text-[11px] text-[#8B8376] mt-1">Detail sheet opens</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4">
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Cart Adds</span>
            <ShoppingBag className="w-3.5 h-3.5 text-[#E67E22]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
            {telemetry.cartAdds}
          </p>
          <p className="text-[11px] text-[#239B69] font-mono mt-1">
            {formatInr(telemetry.cartIntentValueInr)} intent
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4">
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>UPI Pay Clicks</span>
            <Smartphone className="w-3.5 h-3.5 text-[#239B69]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#239B69]">
            {telemetry.upiPayClicks}
          </p>
          <p className="text-[11px] text-[#8B8376] font-mono mt-1">
            {formatInr(telemetry.upiIntentValueInr)} initiated
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Review Clicks</span>
            <Star className="w-3.5 h-3.5 text-[#FF9F43] fill-[#FF9F43]" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
            {telemetry.reviewClicks}
          </p>
          <p className="text-[11px] text-[#8B8376] mt-1">Google review taps</p>
        </div>
      </div>

      {/* Empty-traffic helper notice */}
      {telemetry.totalEvents === 0 && (
        <div className="rounded-2xl bg-[#FFF3E3] border border-[#F3D7B3] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[#7A440C]">
            <p className="font-bold text-[#171923]">Ready to capture live diner telemetry</p>
            <p className="mt-0.5 text-[#525866]">
              {restaurant.isPublished
                ? 'Open your live customer menu, tap a dish, add it to cart, or test a UPI button to watch real-time funnel metrics populate here — or run AI Analytics now to audit your menu catalog.'
                : 'Publish your menu first so customer scans, dish views, cart additions, and UPI clicks start recording automatically.'}
            </p>
          </div>
          <Link
            to={`/menu/${restaurant.slug}`}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] whitespace-nowrap shrink-0"
          >
            Open Live Menu
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Gemini AI Executive Intelligence Panel */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] overflow-hidden">
        <div className="bg-[#171923] text-white px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF9F43]/20 text-[#FF9F43] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold">Gemini Hospitality Strategist</h2>
              <p className="text-[11px] text-white/65">
                {generatedAt
                  ? `Generated at ${generatedAt} from your live ${telemetry.rangeLabel.toLowerCase()} telemetry`
                  : 'Synthesizes live menu_events, dish pricing, UPI flows & service hours'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={generatingAi}
            onClick={() => void handleRunAiAnalysis()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-60 whitespace-nowrap"
          >
            {generatingAi ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing telemetry...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                {report ? 'Re-run AI Report' : 'Generate AI Report'}
              </>
            )}
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {aiError && (
            <div className="mb-4 rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]">
              {aiError}
            </div>
          )}

          {!report && !generatingAi && (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm font-semibold text-[#171923]">
                Run a deep AI audit on {restaurant.name}&apos;s live tracking signals
              </p>
              <p className="text-xs text-[#6B7280] max-w-lg mx-auto leading-relaxed">
                Gemini inspects your conversion funnel, peak hours, top &amp; underperforming
                dishes, INR pricing, and UPI checkout flow to produce concrete revenue actions.
              </p>
            </div>
          )}

          {generatingAi && (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-xs text-[#525866]">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF9F43]" />
              <span>Crunching menu telemetry, peak bands, and dish conversion patterns...</span>
            </div>
          )}

          {report && !generatingAi && (
            <div className="space-y-6">
              {/* Executive Briefing + Health Score */}
              <div className="grid lg:grid-cols-12 gap-5 items-stretch">
                <div className="lg:col-span-4 rounded-2xl bg-[#FAF7F2] border border-[#EFE8DC] p-5 flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-[#171923] text-white flex flex-col items-center justify-center shrink-0">
                    <span className="font-mono text-2xl font-black text-[#FF9F43] tabular-nums">
                      {report.healthScore}
                    </span>
                    <span className="text-[10px] font-bold text-white/70">/ 100 · {report.healthGrade}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[#8B8376] uppercase tracking-wider">
                      Menu Health Score
                    </p>
                    <p className="text-sm font-bold text-[#171923] mt-0.5">{report.healthLabel}</p>
                    <p className="text-[11px] text-[#525866] mt-1">
                      Peak window: <strong>{telemetry.peakBandLabel}</strong>
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-8 rounded-2xl bg-[#FAF7F2] border border-[#EFE8DC] p-5 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#C86D14]">
                      Executive Briefing
                    </p>
                    <p className="text-sm text-[#171923] leading-relaxed mt-1.5">
                      {report.executiveSummary}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-[#EAE1D3] text-xs text-[#4A505E]">
                    <span className="font-bold text-[#171923]">Peak Traffic Strategy: </span>
                    {report.peakTrafficInsight}
                  </div>
                </div>
              </div>

              {/* Menu Engineering Matrix */}
              {report.menuEngineering.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">
                    AI Menu Engineering Matrix
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    {report.menuEngineering.map((card) => (
                      <div
                        key={`${card.dishName}-${card.tag}`}
                        className="rounded-xl border border-[#E6DFD3] bg-white p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-[#171923] truncate">
                            {card.dishName}
                          </p>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap shrink-0 ${TAG_STYLES[card.tag]}`}
                          >
                            {card.tag}
                          </span>
                        </div>
                        <p className="text-xs text-[#525866] leading-relaxed">{card.insight}</p>
                        <p className="text-xs font-semibold text-[#171923] pt-1 border-t border-[#F2ECE2]">
                          Action: <span className="font-normal text-[#373D4A]">{card.recommendedAction}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Funnel Advice + 7-Day Forecast */}
              <div className="grid lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 rounded-xl border border-[#EFE8DC] bg-[#FAF7F2] p-4 space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#171923]">
                    Conversion Funnel Plays
                  </h3>
                  <ul className="space-y-2 text-xs text-[#373D4A]">
                    {report.conversionFunnelAdvice.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-md bg-[#171923] text-[#FF9F43] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          0{idx + 1}
                        </span>
                        <span className="leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lg:col-span-5 rounded-xl bg-[#EAF7F1] border border-[#BFE6D4] p-4 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#1B6E4B]">
                      Next 7-Day Growth Focus
                    </p>
                    <p className="text-xs sm:text-sm text-[#171923] leading-relaxed mt-1.5 font-medium">
                      {report.growthForecast}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/menu"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B6E4B] hover:underline"
                  >
                    Apply updates in My Menu
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Conversion Funnel + Peak Service Bands */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#171923] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#C86D14]" />
                Diner Conversion Funnel
              </h2>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Live drop-off across scan, dish inspection, cart, UPI pay, and reviews
              </p>
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            {funnelSteps.map((step) => {
              const pct = step.count === 0 ? 3 : Math.max(8, Math.round((step.count / maxFunnel) * 100));
              return (
                <div key={step.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-semibold text-[#171923]">{step.label}</span>
                    <span className="font-mono text-[#525866] tabular-nums">
                      <strong className="text-[#171923]">{step.count}</strong> · {step.sub}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F2ECE2] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${step.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-5 bg-white rounded-2xl border border-[#E6DFD3] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#171923] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#C86D14]" />
              Peak Dining Service Bands
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Peak activity: <strong className="text-[#171923]">{telemetry.peakBandLabel}</strong>
            </p>
          </div>

          <div className="space-y-3">
            {telemetry.serviceBands.map((band) => {
              const widthPct =
                band.count === 0
                  ? 4
                  : Math.max(12, Math.round((band.count / telemetry.maxBandCount) * 100));
              const isPeak = band.label === telemetry.peakBandLabel && band.count > 0;
              return (
                <div key={band.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={isPeak ? 'font-bold text-[#171923]' : 'text-[#525866]'}>
                      {band.label}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#171923]">
                      {band.count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F2ECE2] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isPeak ? 'bg-[#FF9F43]' : 'bg-[#171923]/70'}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Breakdown: Top Engaged Dishes + Table QR Sources & UPI App Split */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#171923]">Top Engaged Dishes</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Ranked by live customer detail views and cart additions
            </p>
          </div>

          {telemetry.topDishes.length === 0 ? (
            <p className="text-xs text-[#8B8376] py-6 text-center">
              No dish-level taps recorded in {telemetry.rangeLabel.toLowerCase()} yet.
            </p>
          ) : (
            <div className="divide-y divide-[#F0EAE0]">
              {telemetry.topDishes.map((dish, idx) => (
                <div
                  key={dish.name}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-[#FAF6EE] border border-[#EAE1D3] font-mono text-[11px] font-bold text-[#171923] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-[#171923] truncate">{dish.name}</p>
                      <p className="text-[11px] text-[#6B7280] font-mono">
                        {dish.price > 0 ? formatInr(dish.price) : 'Menu item'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="text-[#525866]">{dish.views} views</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#EAF7F1] text-[#1B6E4B] font-bold">
                      {dish.cartAdds} cart
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white rounded-2xl border border-[#E6DFD3] p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#171923] flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#239B69]" />
              QR Table &amp; Channel Attribution
            </h2>
            {telemetry.topSources.length === 0 ? (
              <p className="text-xs text-[#8B8376] py-4">No channel scans yet in this range.</p>
            ) : (
              <ul className="divide-y divide-[#F0EAE0] mt-2">
                {telemetry.topSources.map((src) => (
                  <li key={src.source} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#171923]">{src.source}</span>
                    <span className="font-mono font-bold tabular-nums text-[#525866]">
                      {src.count} opens
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-4 border-t border-[#EFE8DC]">
            <h3 className="text-sm font-bold text-[#171923] mb-2">UPI App Preference</h3>
            {telemetry.upiAppBreakdown.length === 0 ? (
              <p className="text-xs text-[#8B8376]">
                Paytm, BHIM UPI, GPay &amp; PhonePe tap breakdown will appear as diners pay.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {telemetry.upiAppBreakdown.map((u) => (
                  <div
                    key={u.app}
                    className="rounded-xl bg-[#FAF7F2] border border-[#EFE8DC] px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-[#171923] truncate">{u.app}</span>
                    <span className="font-mono font-bold text-[#239B69]">{u.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

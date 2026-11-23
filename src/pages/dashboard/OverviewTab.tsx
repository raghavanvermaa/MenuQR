import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Eye,
  FolderPlus,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useDashboard } from '../DashboardLayout';
import { getPublicMenuUrl, listMenuEvents } from '../../lib/menuService';
import { downloadQrPng } from '../../lib/qrExport';
import { getEffectivePlan } from '../../lib/plans';
import type { MenuEvent } from '../../types/menuqr';

type DateRangePreset = 'today' | '7d' | '30d' | 'all' | 'custom';

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

function toLocalDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function OverviewTab() {
  const {
    restaurant,
    categories,
    items,
    events: contextEvents,
    auditLogs,
    refreshing,
    reloadAll,
    togglePublished,
    togglingPublish,
  } = useDashboard();

  // Direct `menu_events` state fetched live for the current restaurant
  const [menuEvents, setMenuEvents] = useState<MenuEvent[]>(contextEvents);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Date filter state
  const [datePreset, setDatePreset] = useState<DateRangePreset>('7d');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toLocalDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toLocalDateInputValue(new Date()));

  useEffect(() => {
    setMenuEvents(contextEvents);
  }, [contextEvents]);

  const fetchRestaurantMenuEvents = useCallback(async () => {
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const fresh = await listMenuEvents(restaurant.id, restaurant.ownerId);
      setMenuEvents(fresh);
    } catch (err) {
      setEventsError(
        err instanceof Error ? err.message : 'Unable to fetch menu_events right now.'
      );
    } finally {
      setLoadingEvents(false);
    }
  }, [restaurant.id, restaurant.ownerId]);

  useEffect(() => {
    void fetchRestaurantMenuEvents();
  }, [fetchRestaurantMenuEvents]);

  const plan = getEffectivePlan(restaurant);
  const activeDishes = items.filter((i) => i.isAvailable).length;
  const publicUrl = getPublicMenuUrl(restaurant.slug);

  const analytics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = endOfToday;
    let rangeLabel = 'Last 7 days';
    let dayCount = 7;

    if (datePreset === 'today') {
      rangeStart = startOfToday;
      rangeLabel = 'Today';
      dayCount = 1;
    } else if (datePreset === '7d') {
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(startOfToday.getDate() - 6);
      rangeLabel = 'Last 7 days';
      dayCount = 7;
    } else if (datePreset === '30d') {
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(startOfToday.getDate() - 29);
      rangeLabel = 'Last 30 days';
      dayCount = 30;
    } else if (datePreset === 'all') {
      rangeStart = null;
      rangeEnd = null;
      rangeLabel = 'All time';
      dayCount = 7;
    } else if (datePreset === 'custom') {
      const parsedStart = customStart ? new Date(`${customStart}T00:00:00`) : null;
      const parsedEnd = customEnd ? new Date(`${customEnd}T23:59:59.999`) : null;
      rangeStart = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
      rangeEnd = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;
      if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
        const tmp = rangeStart;
        rangeStart = rangeEnd;
        rangeEnd = tmp;
      }
      rangeLabel =
        customStart && customEnd ? `${customStart} to ${customEnd}` : 'Custom range';
      if (rangeStart && rangeEnd) {
        dayCount = Math.max(
          1,
          Math.min(31, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1)
        );
      }
    }

    let allTimeTotal = 0;
    let filteredDirectViews = 0;
    let filteredQrScans = 0;
    let filteredEngagementSignals = 0;
    let todayTotal = 0;

    // Build chart buckets (hourly for Today, or daily up to 14 visible bars for multi-day)
    const buckets: Array<{ key: string; label: string; views: number; scans: number }> = [];
    const bucketMap = new Map<
      string,
      { key: string; label: string; views: number; scans: number }
    >();

    if (datePreset === 'today') {
      const slots = [
        { key: '0', label: '12–4a' },
        { key: '1', label: '4–8a' },
        { key: '2', label: '8–12p' },
        { key: '3', label: '12–4p' },
        { key: '4', label: '4–8p' },
        { key: '5', label: '8–12a' },
      ];
      slots.forEach((slot) => {
        const b = { ...slot, views: 0, scans: 0 };
        buckets.push(b);
        bucketMap.set(b.key, b);
      });
    } else {
      const chartDays = datePreset === '30d' ? 14 : Math.min(14, Math.max(7, dayCount));
      const anchorEnd =
        datePreset === 'custom' && rangeEnd
          ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate())
          : startOfToday;
      for (let offset = chartDays - 1; offset >= 0; offset -= 1) {
        const d = new Date(anchorEnd);
        d.setDate(anchorEnd.getDate() - offset);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const label =
          chartDays <= 7
            ? d.toLocaleDateString('en-IN', { weekday: 'short' })
            : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const b = { key, label, views: 0, scans: 0 };
        buckets.push(b);
        bucketMap.set(key, b);
      }
    }

    for (const ev of menuEvents) {
      const date = getEventDate(ev);
      const inRange =
        (!rangeStart && !rangeEnd) ||
        (date !== null &&
          (!rangeStart || date >= rangeStart) &&
          (!rangeEnd || date <= rangeEnd));

      const isVisitEvent = ev.eventType === 'menu_view' || ev.eventType === 'qr_scan';
      if (!isVisitEvent) {
        if (inRange) filteredEngagementSignals += 1;
        continue;
      }

      allTimeTotal += 1;

      if (date && date >= startOfToday) {
        todayTotal += 1;
      }

      if (!inRange) continue;

      if (ev.eventType === 'qr_scan') {
        filteredQrScans += 1;
      } else {
        filteredDirectViews += 1;
      }

      if (date) {
        if (datePreset === 'today') {
          const slotKey = String(Math.floor(date.getHours() / 4));
          const b = bucketMap.get(slotKey);
          if (b) {
            if (ev.eventType === 'qr_scan') b.scans += 1;
            else b.views += 1;
          }
        } else {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const b = bucketMap.get(key);
          if (b) {
            if (ev.eventType === 'qr_scan') b.scans += 1;
            else b.views += 1;
          }
        }
      }
    }

    const filteredTotal = filteredDirectViews + filteredQrScans;
    const avgPerDay =
      dayCount > 0 ? Math.round((filteredTotal / dayCount) * 10) / 10 : filteredTotal;
    const maxBucket = Math.max(1, ...buckets.map((b) => b.views + b.scans));

    return {
      allTimeTotal,
      filteredTotal,
      filteredDirectViews,
      filteredQrScans,
      filteredEngagementSignals,
      todayTotal,
      avgPerDay,
      rangeLabel,
      buckets,
      maxBucket,
    };
  }, [menuEvents, datePreset, customStart, customEnd]);

  const checklist = [
    {
      label: 'Create restaurant profile & URL',
      done: true,
      to: '/dashboard/profile',
    },
    {
      label: 'Upload Payment QR / UPI for direct customer pay',
      done: Boolean(restaurant.paymentQrUrl || restaurant.upiId),
      to: '/dashboard/profile',
    },
    {
      label: 'Create at least one menu category',
      done: categories.length > 0,
      to: '/dashboard/categories',
    },
    {
      label: 'Add your first dish with INR price',
      done: items.length > 0,
      to: '/dashboard/menu',
    },
    {
      label: 'Publish menu so customers can scan & view',
      done: restaurant.isPublished,
      to: '/dashboard/qr',
    },
  ];
  const completedSteps = checklist.filter((c) => c.done).length;

  const handleRefreshAll = async () => {
    await Promise.all([reloadAll(), fetchRestaurantMenuEvents()]);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header & Mobile-Friendly Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#171923]">Overview</h1>
          <p className="text-xs sm:text-sm text-[#525866] mt-1 truncate">
            Live snapshot of{' '}
            <span className="font-mono text-[#171923]">/menu/{restaurant.slug}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Link
            to="/dashboard/menu?new=1"
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add dish
          </Link>
          <Link
            to="/dashboard/categories"
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold text-[#171923] hover:border-[#171923] whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            Add category
          </Link>
          <button
            type="button"
            onClick={() => void downloadQrPng(publicUrl, `${restaurant.slug}-qr`)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold text-[#171923] hover:border-[#171923] whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Download QR
          </button>
          <button
            type="button"
            disabled={refreshing || loadingEvents}
            onClick={() => void handleRefreshAll()}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold text-[#525866] hover:text-[#171923] hover:border-[#171923] disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing || loadingEvents ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Dedicated Menu Views Summary Card (Fetched from `menu_events` with Date Filter) */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#C86D14]" />
              <h2 className="text-base font-bold text-[#171923]">
                Menu Views — {restaurant.name}
              </h2>
              {loadingEvents && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C86D14]" />}
            </div>
            <p className="text-xs text-[#6B7280] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Live count from <span className="font-mono">menu_events</span> · Showing{' '}
                <span className="font-semibold text-[#171923]">{analytics.rangeLabel}</span>
              </span>
              <Link
                to="/dashboard/analytics"
                className="inline-flex items-center gap-1 font-semibold text-[#C86D14] hover:underline"
              >
                <Sparkles className="w-3 h-3" />
                AI Tracking Analytics
                {analytics.filteredEngagementSignals > 0
                  ? ` (${analytics.filteredEngagementSignals} diner actions)`
                  : ''}
                <ArrowRight className="w-3 h-3" />
              </Link>
            </p>
          </div>

          {/* Interactive Date Filter Controls (Scrollable on small mobile) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FAF6EE] border border-[#EAE1D3] overflow-x-auto no-scrollbar shrink-0">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDatePreset(opt.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  datePreset === opt.id
                    ? 'bg-[#171923] text-white shadow-xs'
                    : 'text-[#525866] hover:text-[#171923]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Picker Row */}
        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#FAF6EE] border border-[#EAE1D3]">
            <div>
              <label
                htmlFor="overview-start-date"
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[#525866] mb-1"
              >
                <Calendar className="w-3.5 h-3.5 text-[#C86D14]" />
                Start date
              </label>
              <input
                id="overview-start-date"
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#DDD5C7] bg-white text-xs font-mono text-[#171923] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
            <div>
              <label
                htmlFor="overview-end-date"
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[#525866] mb-1"
              >
                <Calendar className="w-3.5 h-3.5 text-[#C86D14]" />
                End date
              </label>
              <input
                id="overview-end-date"
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#DDD5C7] bg-white text-xs font-mono text-[#171923] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
              />
            </div>
          </div>
        )}

        {eventsError && (
          <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] px-3.5 py-2.5 text-xs text-[#B42318]">
            {eventsError}
          </div>
        )}

        {/* Filtered Views Summary Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl bg-[#171923] text-white p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-white/70">Total views ({analytics.rangeLabel})</p>
            <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-[#FF9F43]">
              {analytics.filteredTotal}
            </p>
            <p className="text-[11px] text-white/65 mt-1 tabular-nums">
              {analytics.todayTotal} today · {analytics.allTimeTotal} all-time
            </p>
          </div>

          <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE8DC] p-4">
            <p className="text-xs text-[#6B7280]">Direct menu views</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
              {analytics.filteredDirectViews}
            </p>
            <p className="text-[11px] text-[#8B8376] mt-1">Shared link opens</p>
          </div>

          <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE8DC] p-4">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs text-[#6B7280]">QR code scans</p>
              <QrCode className="w-3.5 h-3.5 text-[#239B69]" />
            </div>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#239B69]">
              {analytics.filteredQrScans}
            </p>
            <p className="text-[11px] text-[#8B8376] mt-1">Table &amp; poster scans</p>
          </div>

          <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE8DC] p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-[#6B7280]">
              {datePreset === 'today' ? 'QR share today' : 'Daily average'}
            </p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
              {datePreset === 'today'
                ? analytics.filteredTotal > 0
                  ? `${Math.round((analytics.filteredQrScans / analytics.filteredTotal) * 100)}%`
                  : '0%'
                : analytics.avgPerDay}
            </p>
            <p className="text-[11px] text-[#8B8376] mt-1">
              {datePreset === 'today' ? 'Of today traffic' : 'Views per day'}
            </p>
          </div>
        </div>

        {/* Adaptive Traffic Bar Chart */}
        <div className="pt-2 border-t border-[#F0EAE0]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold text-[#171923]">
              {datePreset === 'today' ? "Today's 4-hour breakdown" : 'Daily menu traffic'}
            </p>
            <div className="flex items-center gap-4 text-[11px] text-[#525866]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#FF9F43]" />
                Direct views
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#239B69]" />
                QR scans
              </span>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar pb-1">
            <div
              className="grid gap-2 items-end h-36 pt-3 min-w-[300px]"
              style={{
                gridTemplateColumns: `repeat(${analytics.buckets.length}, minmax(32px, 1fr))`,
              }}
            >
              {analytics.buckets.map((bucket) => {
                const total = bucket.views + bucket.scans;
                const heightPct =
                  total === 0 ? 5 : Math.max(14, Math.round((total / analytics.maxBucket) * 100));
                const scanPct = total === 0 ? 0 : Math.round((bucket.scans / total) * 100);
                return (
                  <div
                    key={bucket.key}
                    className="flex flex-col items-center gap-1.5 h-full justify-end"
                  >
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold tabular-nums text-[#525866]">
                      {total}
                    </span>
                    <div className="w-full max-w-[38px] flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-lg overflow-hidden bg-[#F4EFE6] flex flex-col justify-end transition-all duration-300"
                        style={{ height: `${heightPct}%` }}
                        title={`${bucket.label}: ${bucket.views} views, ${bucket.scans} QR scans`}
                      >
                        {total > 0 && (
                          <>
                            <div
                              className="w-full bg-[#FF9F43]"
                              style={{ height: `${100 - scanPct}%` }}
                            />
                            <div
                              className="w-full bg-[#239B69]"
                              style={{ height: `${scanPct}%` }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-[#6B7280] whitespace-nowrap">
                      {bucket.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Secondary Catalog & Workspace KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#6B7280]">Total dishes</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
            {items.length}
            {plan.dishLimit !== null && (
              <span className="text-sm font-normal text-[#8B8376]"> / {plan.dishLimit}</span>
            )}
          </p>
          <p className="text-[11px] text-[#239B69] mt-1 tabular-nums">{activeDishes} available</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#6B7280]">Categories</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#171923]">
            {categories.length}
          </p>
          <p className="text-[11px] text-[#8B8376] mt-1">Menu sections</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#6B7280]">Direct UPI QR</p>
          <p
            className={`mt-1.5 text-lg font-bold ${
              restaurant.paymentQrUrl || restaurant.upiId ? 'text-[#239B69]' : 'text-[#C86D14]'
            }`}
          >
            {restaurant.paymentQrUrl || restaurant.upiId ? 'Active' : 'Not set'}
          </p>
          <Link
            to="/dashboard/profile"
            className="text-[11px] text-[#6B7280] hover:text-[#171923] underline mt-1 inline-block"
          >
            {restaurant.paymentQrUrl || restaurant.upiId ? 'Manage QR' : 'Upload Payment QR'}
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4 sm:p-5">
          <p className="text-xs font-medium text-[#6B7280]">Menu status</p>
          <p
            className={`mt-1.5 text-lg font-bold ${
              restaurant.isSuspended
                ? 'text-[#B42318]'
                : restaurant.isPublished
                  ? 'text-[#239B69]'
                  : 'text-[#C86D14]'
            }`}
          >
            {restaurant.isSuspended
              ? 'Suspended'
              : restaurant.isPublished
                ? 'Published'
                : 'Draft'}
          </p>
          <p className="text-[11px] text-[#8B8376] mt-1">
            {restaurant.isPublished ? 'Tracking live views' : 'Publish to track views'}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Launch Checklist */}
        <section className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#171923]">Launch checklist</h2>
              <p className="text-xs text-[#6B7280] mt-0.5 tabular-nums">
                {completedSteps} of {checklist.length} milestones complete
              </p>
            </div>
            {!restaurant.isPublished && !restaurant.isSuspended && (
              <button
                type="button"
                disabled={togglingPublish}
                onClick={togglePublished}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#239B69] text-white text-xs font-semibold hover:bg-[#1D8257] whitespace-nowrap"
              >
                Publish live
              </button>
            )}
          </div>

          <div className="h-2 rounded-full bg-[#F1EAE0] overflow-hidden">
            <div
              className="h-full bg-[#239B69] transition-all duration-300"
              style={{ width: `${(completedSteps / checklist.length) * 100}%` }}
            />
          </div>

          <ul className="divide-y divide-[#F0EAE0]">
            {checklist.map((item) => (
              <li key={item.label} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-[#239B69] shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-[#C2B8A8] shrink-0" />
                  )}
                  <span
                    className={`text-xs sm:text-sm ${
                      item.done ? 'text-[#6B7280] line-through' : 'text-[#171923] font-medium'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
                {!item.done && (
                  <Link
                    to={item.to}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#C86D14] hover:underline whitespace-nowrap shrink-0"
                  >
                    Complete
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Recent Workspace Activity */}
        <section className="lg:col-span-5 bg-white rounded-2xl border border-[#E6DFD3] p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#171923] mb-1">Recent workspace activity</h2>
            <p className="text-xs text-[#6B7280] mb-4">Audit log of menu &amp; subscription events</p>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-[#8B8376] py-6 text-center">No activity logged yet.</p>
            ) : (
              <ul className="divide-y divide-[#F0EAE0]">
                {auditLogs.slice(0, 6).map((log) => (
                  <li key={log.id} className="py-2.5">
                    <p className="text-xs font-semibold text-[#171923]">
                      {log.details || log.action}
                    </p>
                    <p className="text-[11px] text-[#8B8376] font-mono mt-0.5">{log.action}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-4 border-t border-[#F0EAE0] flex items-center justify-between gap-3">
            <Link
              to={`/menu/${restaurant.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171923] hover:underline"
            >
              Open live customer menu
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/dashboard/qr"
              className="text-xs font-semibold text-[#C86D14] hover:underline"
            >
              Print QR poster
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

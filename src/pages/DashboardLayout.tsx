import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  ExternalLink,
  FolderKanban,
  Globe,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  QrCode,
  Settings,
  Shield,
  Sparkles,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { MenuQrBrand } from '../components/BrandUI';
import { useAuth } from '../contexts/AuthContext';
import {
  listAuditLogs,
  listCategories,
  listMenuEvents,
  listMenuItems,
  listOwnerRestaurants,
  listQrCodes,
  listSubscriptions,
  setRestaurantPublished,
} from '../lib/menuService';
import type {
  AuditLog,
  Category,
  MenuEvent,
  MenuItem,
  QrCodeRecord,
  Restaurant,
  SubscriptionRecord,
} from '../types/menuqr';

interface DashboardContextValue {
  restaurants: Restaurant[];
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
  qrCodes: QrCodeRecord[];
  events: MenuEvent[];
  auditLogs: AuditLog[];
  subscriptions: SubscriptionRecord[];
  refreshing: boolean;
  selectRestaurant: (id: string) => void;
  reloadAll: () => Promise<void>;
  togglePublished: () => Promise<void>;
  togglingPublish: boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardLayout');
  return ctx;
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/analytics', label: 'AI Analytics', icon: Sparkles, end: false },
  { to: '/dashboard/menu', label: 'My Menu', icon: UtensilsCrossed, end: false },
  { to: '/dashboard/categories', label: 'Categories', icon: FolderKanban, end: false },
  { to: '/dashboard/qr', label: 'QR Codes', icon: QrCode, end: false },
  { to: '/dashboard/profile', label: 'Restaurant Profile', icon: Store, end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, end: false },
  { to: '/dashboard/subscription', label: 'Subscription', icon: CreditCard, end: false },
];

export function DashboardLayout() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [qrCodes, setQrCodes] = useState<QrCodeRecord[]>([]);
  const [events, setEvents] = useState<MenuEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingPublish, setTogglingPublish] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const loadWorkspace = useCallback(
    async (preferredRestId?: string) => {
      if (!user) return;
      setRefreshing(true);
      setLoadError(null);
      try {
        const list = await listOwnerRestaurants(user.uid);
        setRestaurants(list);

        if (list.length === 0) {
          setInitialLoading(false);
          setRefreshing(false);
          return;
        }

        const activeRest =
          list.find((r) => r.id === (preferredRestId || selectedId)) || list[0];
        setSelectedId(activeRest.id);

        const [cats, dishes, qrs, evts, logs, subs] = await Promise.all([
          listCategories(activeRest.id, activeRest.ownerId),
          listMenuItems(activeRest.id, activeRest.ownerId),
          listQrCodes(activeRest.id, activeRest.ownerId),
          listMenuEvents(activeRest.id, activeRest.ownerId),
          listAuditLogs(activeRest.id, activeRest.ownerId),
          listSubscriptions(activeRest.id, activeRest.ownerId),
        ]);

        setCategories(cats);
        setItems(dishes);
        setQrCodes(qrs);
        setEvents(evts);
        setAuditLogs(logs);
        setSubscriptions(subs);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'Unable to load your restaurant workspace.'
        );
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [user, selectedId]
  );

  useEffect(() => {
    if (user) {
      void loadWorkspace();
    }
  }, [user]);

  const restaurant = restaurants.find((r) => r.id === selectedId) || restaurants[0];

  const selectRestaurant = (id: string) => {
    setSelectedId(id);
    void loadWorkspace(id);
  };

  const togglePublished = async () => {
    if (!restaurant || restaurant.isSuspended) return;
    setTogglingPublish(true);
    try {
      await setRestaurantPublished(restaurant, !restaurant.isPublished, categories, items);
      await loadWorkspace(restaurant.id);
    } finally {
      setTogglingPublish(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#FFF9F1] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-[#525866]">
          <Loader2 className="w-5 h-5 animate-spin text-[#FF9F43]" />
          Loading your restaurant workspace...
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-[#FFF9F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#E6DFD3] p-8 text-center space-y-5">
          <MenuQrBrand />
          <h1 className="text-xl font-bold text-[#171923]">Create your first restaurant</h1>
          <p className="text-sm text-[#525866] leading-relaxed">
            Set up your restaurant profile, add your first dish, and generate a permanent QR code
            for your tables.
          </p>
          {loadError && (
            <p className="text-xs text-[#B42318] bg-[#FFF1EE] p-3 rounded-lg break-words">{loadError}</p>
          )}
          <div className="flex flex-col gap-2.5">
            <Link
              to="/onboarding"
              className="w-full py-3 rounded-xl bg-[#FF9F43] text-[#171923] text-sm font-bold hover:bg-[#F09134]"
            >
              Start 4-step setup
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="w-full py-2.5 rounded-xl border border-[#DDD5C7] text-sm font-semibold text-[#171923] hover:bg-[#FAF6EE]"
              >
                Open Platform Admin Console
              </Link>
            )}
            <button
              type="button"
              disabled={signingOut}
              onClick={handleSignOut}
              className="w-full py-2.5 rounded-xl border border-[#E6DFD3] text-sm font-semibold text-[#525866] hover:text-[#171923] hover:bg-[#FAF6EE] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              Sign out{user?.email ? ` (${user.email})` : ''}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-[#EFE8DC]">
        <Link to="/" onClick={() => setMobileNavOpen(false)}>
          <MenuQrBrand size="sm" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden p-1.5 text-[#525866] hover:text-[#171923]"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Restaurant Switcher */}
      <div className="p-4 border-b border-[#EFE8DC]">
        <p className="text-[11px] font-medium text-[#8B8376] mb-1.5">Active restaurant</p>
        {restaurants.length > 1 ? (
          <select
            value={restaurant.id}
            onChange={(e) => selectRestaurant(e.target.value)}
            aria-label="Select restaurant"
            className="w-full rounded-lg border border-[#DDD5C7] bg-[#FAF6EE] px-2.5 py-2 text-sm font-semibold text-[#171923] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
          >
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="px-2.5 py-2 rounded-lg bg-[#FAF6EE] border border-[#EFE8DC]">
            <p className="text-sm font-semibold text-[#171923] truncate">{restaurant.name}</p>
            <p className="text-xs text-[#6B7280] font-mono truncate">/menu/{restaurant.slug}</p>
          </div>
        )}
        {restaurant.plan === 'pro' && restaurant.subscriptionStatus === 'active' && (
          <Link
            to="/onboarding"
            className="mt-2 inline-block text-xs font-semibold text-[#C86D14] hover:underline"
          >
            + Add new branch
          </Link>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#171923] text-white'
                    : 'text-[#4A505E] hover:bg-[#FAF6EE] hover:text-[#171923]'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          );
        })}

        {isAdmin && (
          <div className="pt-3 mt-3 border-t border-[#EFE8DC]">
            <NavLink
              to="/admin"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#9A5B13] hover:bg-[#FFF3E3] transition-colors whitespace-nowrap"
            >
              <Shield className="w-4 h-4 shrink-0" />
              Platform Admin
            </NavLink>
          </div>
        )}
      </nav>

      {/* Account Footer */}
      <div className="p-4 border-t border-[#EFE8DC] space-y-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#171923] truncate">
            {profile?.fullName || user?.displayName || 'Restaurant Owner'}
          </p>
          <p className="text-[11px] text-[#6B7280] truncate">{user?.email}</p>
        </div>
        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#E6DFD3] text-xs font-semibold text-[#525866] hover:text-[#171923] hover:bg-[#FAF6EE] transition-colors disabled:opacity-50"
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
  );

  return (
    <DashboardContext.Provider
      value={{
        restaurants,
        restaurant,
        categories,
        items,
        qrCodes,
        events,
        auditLogs,
        subscriptions,
        refreshing,
        selectRestaurant,
        reloadAll: () => loadWorkspace(restaurant.id),
        togglePublished,
        togglingPublish,
      }}
    >
      <div className="min-h-screen bg-[#FAF7F2] text-[#171923] flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-[#E6DFD3] fixed inset-y-0 left-0 z-30">
          {sidebarContent}
        </aside>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-[#171923]/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative w-64 max-w-[85vw] bg-white h-full z-10 shadow-xl">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="sticky top-0 z-20 min-h-14 sm:h-16 bg-white/95 backdrop-blur-sm border-b border-[#E6DFD3] px-3 sm:px-8 py-2 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-xl text-[#171923] hover:bg-[#FAF6EE]"
                aria-label="Open navigation"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#171923] truncate">{restaurant.name}</p>
                <p className="text-[11px] sm:text-xs text-[#6B7280] truncate">
                  {restaurant.isSuspended
                    ? 'Suspended'
                    : restaurant.isPublished
                      ? 'Menu Live'
                      : 'Draft'}{' '}
                  · {restaurant.plan.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <button
                type="button"
                disabled={togglingPublish || restaurant.isSuspended}
                onClick={togglePublished}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  restaurant.isPublished
                    ? 'border border-[#239B69]/40 bg-[#EAF7F1] text-[#1B6E4B] hover:bg-[#DCF2E7]'
                    : 'bg-[#239B69] text-white hover:bg-[#1D8257]'
                }`}
              >
                {togglingPublish ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>{restaurant.isPublished ? 'Live' : 'Publish'}</span>
              </button>

              <Link
                to={`/menu/${restaurant.slug}`}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-lg border border-[#DDD5C7] bg-white text-xs font-semibold text-[#171923] hover:border-[#171923] transition-colors whitespace-nowrap shrink-0"
              >
                <span className="hidden sm:inline">Preview</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                disabled={signingOut}
                onClick={handleSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3 py-2 rounded-lg border border-[#E6DFD3] bg-white text-xs font-semibold text-[#525866] hover:text-[#171923] hover:bg-[#FAF6EE] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {signingOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">Sign out</span>
              </button>
            </div>
          </header>

          {restaurant.isSuspended && (
            <div className="bg-[#FFF1EE] border-b border-[#F5C9C2] px-4 sm:px-8 py-3 text-xs font-medium text-[#B42318]">
              This restaurant account has been suspended by a platform administrator. Your public
              menu is currently hidden and editing is disabled.
            </div>
          )}

          <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </DashboardContext.Provider>
  );
}

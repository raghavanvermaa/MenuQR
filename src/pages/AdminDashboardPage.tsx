import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { MenuQrBrand } from '../components/BrandUI';
import { useAuth } from '../contexts/AuthContext';
import {
  adminCreatePremiumPass,
  adminListAllRestaurants,
  adminListPremiumPasses,
  adminRevokePremiumPass,
  adminToggleRestaurantSuspension,
  adminUpdateRestaurantSubscription,
  defaultOneYearExpiryDate,
  generatePremiumUserIdCode,
  getPersonalPremiumUserId,
} from '../lib/menuService';
import { PLANS } from '../lib/plans';
import type { PlanId, PremiumPass, Restaurant, SubscriptionStatus } from '../types/menuqr';

export function AdminDashboardPage() {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [premiumPasses, setPremiumPasses] = useState<PremiumPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | PlanId>('all');
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [editPlan, setEditPlan] = useState<PlanId>('free');
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active');
  const [editExpiry, setEditExpiry] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Premium User ID generator state
  const [newPassTier, setNewPassTier] = useState<'growth' | 'pro'>('pro');
  const [newPassEmail, setNewPassEmail] = useState('');
  const [newPassExpiry, setNewPassExpiry] = useState(() => defaultOneYearExpiryDate());
  const [newPassCustomId, setNewPassCustomId] = useState('');
  const [newPassNotes, setNewPassNotes] = useState('');
  const [mintingPass, setMintingPass] = useState(false);
  const [lastMintedPass, setLastMintedPass] = useState<PremiumPass | null>(null);
  const [revokingPassId, setRevokingPassId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const personalProId = user ? getPersonalPremiumUserId(user.uid) : '';

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, passes] = await Promise.all([
        adminListAllRestaurants(),
        adminListPremiumPasses(),
      ]);
      setRestaurants(list);
      setPremiumPasses(passes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load platform operations data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAdmin) {
      void loadAll();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (planFilter !== 'all' && r.plan !== planFilter) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.slug.toLowerCase().includes(q) &&
        !r.city.toLowerCase().includes(q) &&
        !r.email.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [restaurants, search, planFilter]);

  const stats = useMemo(() => {
    const total = restaurants.length;
    const published = restaurants.filter((r) => r.isPublished && !r.isSuspended).length;
    const paid = restaurants.filter((r) => r.plan !== 'free' && r.subscriptionStatus === 'active').length;
    const suspended = restaurants.filter((r) => r.isSuspended).length;
    const totalDishes = restaurants.reduce((acc, r) => acc + (r.dishCount || 0), 0);
    return { total, published, paid, suspended, totalDishes };
  }, [restaurants]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFF9F1] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#FF9F43]" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FFF9F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#E6DFD3] p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#FFF1EE] text-[#B42318] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#171923]">Administrator Access Required</h1>
          <p className="text-sm text-[#525866] leading-relaxed">
            This console is restricted to verified MENUQR platform administrators. Access is
            enforced at both the application and database security rule layers.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to="/dashboard"
              className="px-4 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold"
            >
              Go to Owner Dashboard
            </Link>
            <Link
              to="/"
              className="px-4 py-2.5 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#171923]"
            >
              Home
            </Link>
            {user && (
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#525866] hover:text-[#171923]"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const openSubEditor = (r: Restaurant) => {
    setEditing(r);
    setEditPlan(r.plan);
    setEditStatus(r.subscriptionStatus);
    setEditExpiry(r.subscriptionExpiresAt || '');
    setEditNotes('');
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await adminUpdateRestaurantSubscription(editing, {
        plan: editPlan,
        subscriptionStatus: editStatus,
        subscriptionExpiresAt: editExpiry,
        notes: editNotes || `Plan set to ${editPlan} (${editStatus}) by ${user.email}`,
      });
      setEditing(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subscription.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async (r: Restaurant) => {
    setBusyId(r.id);
    setError(null);
    try {
      await adminToggleRestaurantSuspension(r, !r.isSuspended);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change suspension status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(value);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  const handleMintPremiumPass = async (e: React.FormEvent) => {
    e.preventDefault();
    setMintingPass(true);
    setError(null);
    try {
      const created = await adminCreatePremiumPass({
        tier: newPassTier,
        assignedEmail: newPassEmail,
        expiresAt: newPassExpiry || defaultOneYearExpiryDate(),
        notes: newPassNotes,
        customId: newPassCustomId || undefined,
      });
      setLastMintedPass(created);
      setNewPassCustomId('');
      setNewPassEmail('');
      setNewPassNotes('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Premium User ID.');
    } finally {
      setMintingPass(false);
    }
  };

  const handleRevokePass = async (passId: string) => {
    setRevokingPassId(passId);
    setError(null);
    try {
      await adminRevokePremiumPass(passId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke Premium User ID.');
    } finally {
      setRevokingPassId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#171923]">
      <header className="bg-[#171923] text-white border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <MenuQrBrand inverted size="sm" />
            </Link>
            <span className="text-xs text-white/60 hidden sm:inline">Platform Administration</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white/75 hidden md:inline">{user.email}</span>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 font-semibold whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Owner Dashboard
            </Link>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10 font-semibold whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-[#C86D14]" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Platform Operations</h1>
            <p className="text-sm text-[#525866]">
              Manage registered restaurants, activate paid subscriptions, and moderate accounts.
            </p>
          </div>
        </div>

        {/* Platform Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Registered restaurants', value: stats.total },
            { label: 'Published live', value: stats.published },
            { label: 'Active paid plans', value: stats.paid },
            { label: 'Suspended', value: stats.suspended },
            { label: 'Total dishes hosted', value: stats.totalDishes },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#E6DFD3] p-5">
              <p className="text-xs font-medium text-[#6B7280]">{s.label}</p>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#171923]">
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]">
            {error}
          </div>
        )}

        {/* Premium User ID Generator & Pass Registry */}
        <section className="bg-white rounded-2xl border border-[#E6DFD3] overflow-hidden">
          <div className="bg-[#171923] text-white px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#FF9F43]">
                <Crown className="w-3.5 h-3.5" />
                Premium User ID Studio
              </div>
              <h2 className="text-lg font-bold">
                Generate &amp; Manage Cafe Owner Premium User IDs
              </h2>
              <p className="text-xs text-white/70">
                Single-use IDs that unlock MENUQR Growth/Pro &amp; AI Tracking Analytics when redeemed in any owner dashboard.
              </p>
            </div>

            {personalProId && (
              <div className="flex flex-wrap items-center gap-2.5 bg-white/10 border border-white/15 rounded-xl px-4 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
                    Your Personal Pro ID
                  </p>
                  <p className="font-mono text-sm font-bold text-[#FF9F43] tracking-wider">
                    {personalProId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(personalProId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold"
                >
                  {copiedId === personalProId ? (
                    <Check className="w-3.5 h-3.5 text-[#239B69]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedId === personalProId ? 'Copied' : 'Copy'}
                </button>
                <Link
                  to="/dashboard/analytics"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Analytics
                </Link>
              </div>
            )}
          </div>

          <div className="p-6 space-y-6">
            {lastMintedPass && (
              <div className="rounded-xl bg-[#EAF7F1] border border-[#B9E6D2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-[#19744E]">
                    New {lastMintedPass.tier.toUpperCase()} Premium User ID generated &amp; saved to Firestore
                  </p>
                  <p className="text-xs text-[#2D6A4F]">
                    Share{' '}
                    <span className="font-mono font-bold text-[#171923] bg-white px-2 py-0.5 rounded border border-[#B9E6D2]">
                      {lastMintedPass.id}
                    </span>{' '}
                    {lastMintedPass.assignedEmail
                      ? `with ${lastMintedPass.assignedEmail}`
                      : 'with any cafe or restaurant owner'}{' '}
                    (valid through {lastMintedPass.expiresAt}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(lastMintedPass.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] whitespace-nowrap shrink-0"
                >
                  {copiedId === lastMintedPass.id ? (
                    <Check className="w-3.5 h-3.5 text-[#239B69]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedId === lastMintedPass.id ? 'Copied ID' : 'Copy Premium ID'}
                </button>
              </div>
            )}

            <form
              onSubmit={handleMintPremiumPass}
              className="grid sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
            >
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-[#525866] mb-1" htmlFor="mint-tier">
                  Plan tier
                </label>
                <select
                  id="mint-tier"
                  value={newPassTier}
                  onChange={(e) => setNewPassTier(e.target.value as 'growth' | 'pro')}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold"
                >
                  <option value="pro">Pro (₹999/mo)</option>
                  <option value="growth">Growth (₹499/mo)</option>
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[11px] font-semibold text-[#525866] mb-1" htmlFor="mint-email">
                  Lock to owner email (optional)
                </label>
                <input
                  id="mint-email"
                  type="email"
                  value={newPassEmail}
                  onChange={(e) => setNewPassEmail(e.target.value)}
                  placeholder="Blank = any cafe owner"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DDD5C7] text-xs"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-[#525866] mb-1" htmlFor="mint-exp">
                  Valid through
                </label>
                <input
                  id="mint-exp"
                  type="date"
                  required
                  value={newPassExpiry}
                  onChange={(e) => setNewPassExpiry(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DDD5C7] text-xs font-mono"
                />
              </div>

              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#525866]" htmlFor="mint-id">
                    Custom ID (optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassCustomId(generatePremiumUserIdCode(newPassTier))}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#C86D14] hover:underline"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Preview code
                  </button>
                </div>
                <input
                  id="mint-id"
                  type="text"
                  maxLength={32}
                  value={newPassCustomId}
                  onChange={(e) => setNewPassCustomId(e.target.value.toUpperCase())}
                  placeholder="Auto-generated MQR-PRO-..."
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DDD5C7] font-mono text-xs uppercase"
                />
              </div>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  disabled={mintingPass}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-50"
                >
                  {mintingPass ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Generate ID
                </button>
              </div>

              <div className="sm:col-span-2 lg:col-span-12">
                <input
                  type="text"
                  maxLength={200}
                  value={newPassNotes}
                  onChange={(e) => setNewPassNotes(e.target.value)}
                  placeholder="Optional internal note (e.g., VIP cafe partner in Hauz Khas, paid via UPI)"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAE3D7] bg-[#FAF7F2] text-xs"
                />
              </div>
            </form>

            {/* Issued Passes Registry */}
            <div className="border-t border-[#EFE8DC] pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-[#171923] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#C86D14]" />
                  Issued Premium User IDs ({premiumPasses.length})
                </p>
              </div>

              {premiumPasses.length === 0 ? (
                <p className="text-xs text-[#6B7280] py-4 text-center bg-[#FAF7F2] rounded-xl">
                  No Premium User IDs generated yet. Use the form above to mint your first ID.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF6EE] border-b border-[#EFE8DC] text-[#525866]">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Premium User ID</th>
                        <th className="py-2.5 px-3 font-semibold">Tier</th>
                        <th className="py-2.5 px-3 font-semibold">Assigned / Redeemed By</th>
                        <th className="py-2.5 px-3 font-semibold">Status</th>
                        <th className="py-2.5 px-3 font-semibold">Expires</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EAE0]">
                      {premiumPasses.map((pass) => (
                        <tr key={pass.id} className="hover:bg-[#FAF7F2]/60">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#171923]">
                            {pass.id}
                          </td>
                          <td className="py-2.5 px-3 uppercase font-semibold text-[#C86D14]">
                            {pass.tier}
                          </td>
                          <td className="py-2.5 px-3 text-[#525866]">
                            {pass.status === 'redeemed' ? (
                              <span>
                                {pass.assignedEmail || pass.redeemedRestaurantId || pass.redeemedByUid || 'Redeemed'}
                              </span>
                            ) : pass.assignedEmail ? (
                              <span>Locked: {pass.assignedEmail}</span>
                            ) : (
                              <span className="text-[#8B8376]">Any cafe owner</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`font-semibold capitalize ${
                                pass.status === 'active'
                                  ? 'text-[#239B69]'
                                  : pass.status === 'redeemed'
                                    ? 'text-[#C86D14]'
                                    : 'text-[#B42318]'
                              }`}
                            >
                              {pass.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#525866]">
                            {pass.expiresAt}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleCopy(pass.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E6DFD3] text-[11px] font-semibold text-[#171923] hover:bg-[#FAF6EE]"
                              >
                                {copiedId === pass.id ? (
                                  <Check className="w-3 h-3 text-[#239B69]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                {copiedId === pass.id ? 'Copied' : 'Copy'}
                              </button>
                              {pass.status === 'active' && (
                                <button
                                  type="button"
                                  disabled={revokingPassId === pass.id}
                                  onClick={() => void handleRevokePass(pass.id)}
                                  className="px-2.5 py-1 rounded-lg border border-[#F5C9C2] text-[11px] font-semibold text-[#B42318] hover:bg-[#FFF1EE] disabled:opacity-50"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search restaurants by name, slug, city, or email..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as 'all' | PlanId)}
            aria-label="Filter by plan"
            className="px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
          </select>
        </div>

        {/* Restaurants Table */}
        <div className="bg-white rounded-2xl border border-[#E6DFD3] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-[#6B7280] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading registered restaurants...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#6B7280]">
              No registered customer restaurants match this filter yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF6EE] border-b border-[#EFE8DC] text-[#525866]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Restaurant</th>
                    <th className="py-3 px-4 font-semibold">City</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Plan & Expiry</th>
                    <th className="py-3 px-4 font-semibold text-right">Dishes</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EAE0]">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-[#FAF7F2]/60">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-[#171923]">{r.name}</p>
                        <p className="font-mono text-[11px] text-[#6B7280]">/menu/{r.slug}</p>
                      </td>
                      <td className="py-3.5 px-4 text-[#4A505E]">{r.city}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-semibold ${
                            r.isSuspended
                              ? 'text-[#B42318]'
                              : r.isPublished
                                ? 'text-[#239B69]'
                                : 'text-[#C86D14]'
                          }`}
                        >
                          {r.isSuspended ? 'Suspended' : r.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#171923]">
                          {PLANS[r.plan]?.name || r.plan} ·{' '}
                          <span className="capitalize font-normal text-[#525866]">
                            {r.subscriptionStatus}
                          </span>
                        </p>
                        <p className="font-mono text-[11px] text-[#8B8376]">
                          {r.subscriptionExpiresAt ? `Exp: ${r.subscriptionExpiresAt}` : 'No expiry'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {r.dishCount}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/menu/${r.slug}`}
                            className="p-1.5 rounded-lg border border-[#E6DFD3] text-[#525866] hover:text-[#171923]"
                            title="Open public menu"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => openSubEditor(r)}
                            className="px-3 py-1.5 rounded-lg bg-[#171923] text-white font-semibold hover:bg-[#2A2E3F] whitespace-nowrap"
                          >
                            Manage plan
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void handleToggleSuspend(r)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border font-semibold whitespace-nowrap ${
                              r.isSuspended
                                ? 'border-[#239B69] text-[#239B69] hover:bg-[#EAF7F1]'
                                : 'border-[#F5C9C2] text-[#B42318] hover:bg-[#FFF1EE]'
                            }`}
                          >
                            {r.isSuspended ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Reinstate
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                Suspend
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Subscription Management Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-[#171923]/55 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSubscription}
            className="bg-white rounded-2xl border border-[#E6DFD3] max-w-md w-full p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-[#171923]">Manage Subscription</h2>
              <p className="text-xs text-[#525866] mt-0.5">
                {editing.name} · <span className="font-mono">/menu/{editing.slug}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="adm-plan">
                Plan tier
              </label>
              <select
                id="adm-plan"
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value as PlanId)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm"
              >
                <option value="free">Free (₹0 · up to 20 dishes)</option>
                <option value="starter">Starter (₹299/mo · unlimited)</option>
                <option value="growth">Growth (₹499/mo · Table QR + WhatsApp)</option>
                <option value="pro">Pro (₹999/mo · Multi-branch)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="adm-status">
                Subscription status
              </label>
              <select
                id="adm-status"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as SubscriptionStatus)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="adm-exp">
                Expiry date (YYYY-MM-DD, optional)
              </label>
              <input
                id="adm-exp"
                type="date"
                value={editExpiry}
                onChange={(e) => setEditExpiry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" htmlFor="adm-notes">
                Activation / UPI reference note
              </label>
              <input
                id="adm-notes"
                type="text"
                maxLength={300}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="e.g., UPI Ref #429812 · Activated for 1 month"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#525866]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-60"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save subscription
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

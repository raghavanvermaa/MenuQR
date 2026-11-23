import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  LogOut,
  Printer,
  QrCode,
  Search,
  Smartphone,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { MenuQrBrand, DietaryMark, SmartImage } from '../components/BrandUI';
import { Landing3DShowcase } from '../components/Landing3DShowcase';
import { DEMO_ASSETS, DEMO_RESTAURANT } from '../data/demoRestaurant';
import { PLAN_ORDER, PLANS } from '../lib/plans';
import { generateQrDataUrl } from '../lib/qrExport';
import { getPublicMenuUrl } from '../lib/menuService';
import { useAuth } from '../contexts/AuthContext';

const USE_CASES = [
  {
    id: 'cafes',
    label: 'Cafes & Roasteries',
    headline: 'Showcase seasonal pour-overs, cold brews, and fresh bakes with crisp photography.',
    detail:
      'Highlight barista specials at the top of the menu and mark sold-out pastries unavailable in one tap during the morning rush.',
    metrics: 'Avg. setup time: 12 minutes · Zero reprinting for seasonal menus',
  },
  {
    id: 'restaurants',
    label: 'Dine-In Restaurants',
    headline: 'Keep every table updated the second prices or daily specials change.',
    detail:
      'Print permanent tabletop QR stands once. When kitchen availability shifts or GST prices change, every table sees the updated menu instantly.',
    metrics: 'Table-specific QR stands · Instant Indian Veg / Non-Veg / Egg filters',
  },
  {
    id: 'dhabas',
    label: 'Dhabas & Quick Service',
    headline: 'Fast-loading menus built for ordinary 4G connections and budget Android phones.',
    detail:
      'No heavy PDFs to pinch-and-zoom and no app downloads. Customers scan at the counter or table and browse clear INR prices immediately.',
    metrics: 'Lightweight mobile view · Works directly in phone camera & Google Lens',
  },
  {
    id: 'bakeries',
    label: 'Bakeries & Dessert Shops',
    headline: 'Turn visual cravings into higher order values with mouth-watering dish cards.',
    detail:
      'Upload cake, pastry, and brownie photos right from your phone, clearly mark Egg vs. Eggless items, and link customers straight to WhatsApp.',
    metrics: 'Clear Egg / Eggless indicators · Direct WhatsApp order link',
  },
  {
    id: 'cloud',
    label: 'Cloud Kitchens',
    headline: 'Share one clean menu link across Instagram bio, WhatsApp Broadcasts, and flyers.',
    detail:
      'Include a printed QR insert inside every takeaway bag so aggregator customers order directly from your brand next time.',
    metrics: 'Permanent shareable URL · Zero commission menu browsing',
  },
];

const FAQS = [
  {
    q: 'Do my customers need to download an app or create an account?',
    a: 'No. Customers simply point their phone camera (iOS, Android, or Google Lens) at your QR code and your menu opens immediately in their browser.',
  },
  {
    q: 'Will I have to reprint my QR posters whenever I change prices or dishes?',
    a: 'Never. Every restaurant receives a permanent menu URL (such as /menu/your-cafe). Your printed QR codes always point to that permanent link, so menu edits go live immediately.',
  },
  {
    q: 'How does the Free plan work, and how do I upgrade in India?',
    a: 'Start completely free with 1 restaurant, up to 20 dishes, and downloadable QR codes. During our Delhi NCR launch, paid plans (Starter ₹299/mo, Growth ₹499/mo, Pro ₹999/mo) are activated by our team after UPI or invoice confirmation — no surprise card charges.',
  },
  {
    q: 'Can I clearly show Vegetarian, Non-Vegetarian, and Egg dishes?',
    a: 'Yes. Every dish uses familiar Indian FSSAI-style Veg, Non-Veg, and Egg marks paired with clear labels and one-tap dietary filters for diners.',
  },
  {
    q: 'Can customers pay directly via Paytm, BHIM UPI, GPay, or PhonePe?',
    a: 'Yes. Add your Merchant UPI ID or upload your shop payment QR in your dashboard. Customers can add dishes to their cart, launch Paytm, BHIM UPI, Google Pay, or PhonePe with the exact total pre-filled, and leave a Google Review right after payment — with zero commission.',
  },
  {
    q: 'Are Hindi menus supported for customers?',
    a: 'Yes. Every public menu includes an instant EN / हिंदी switcher powered by AI translation, plus automatic Hindi detection for Hindi-locale phones.',
  },
];

export function LandingPage() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [demoQrUrl, setDemoQrUrl] = useState<string>('');
  const [activeUseCase, setActiveUseCase] = useState(USE_CASES[0].id);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const demoUrl = getPublicMenuUrl(DEMO_RESTAURANT.slug);

  useEffect(() => {
    document.title = 'MENUQR — Your Restaurant Menu, Beautifully Digital';
    void generateQrDataUrl(demoUrl, '#171923').then(setDemoQrUrl).catch(() => {});
  }, [demoUrl]);

  const selectedUseCase = USE_CASES.find((u) => u.id === activeUseCase) || USE_CASES[0];

  return (
    <div className="min-h-screen bg-[#FFF9F1] text-[#171923]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FFF9F1]/95 backdrop-blur-sm border-b border-[#E9E1D4]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <Link to="/" className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF9F43] rounded-md">
            <MenuQrBrand />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4A505E]">
            <a href="#features" className="hover:text-[#171923] transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#171923] transition-colors whitespace-nowrap shrink-0">
              How it works
            </a>
            <a href="#pricing" className="hover:text-[#171923] transition-colors whitespace-nowrap shrink-0">
              Pricing
            </a>
            <Link to="/menu/cafe-mocha" className="hover:text-[#171923] transition-colors whitespace-nowrap shrink-0">
              Demo menu
            </Link>
            {user ? (
              <Link to="/dashboard" className="hover:text-[#171923] transition-colors whitespace-nowrap shrink-0">
                Dashboard
              </Link>
            ) : (
              <Link to="/login" className="hover:text-[#171923] transition-colors whitespace-nowrap shrink-0">
                Login
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to={user ? '/dashboard' : '/register'}
              className="px-4 py-2 rounded-lg bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Open dashboard' : 'Get started'}
            </Link>
            {user && (
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/login');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#DDD5C7] bg-white text-xs font-semibold text-[#525866] hover:text-[#171923] hover:bg-[#FAF6EE] transition-colors whitespace-nowrap shrink-0"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section with Interactive 3D Bistro Stage */}
        <section className="pt-10 pb-16 lg:pt-14 lg:pb-24 border-b border-[#E9E1D4]">
          <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 lg:gap-10 items-center">
            <div className="lg:col-span-5 flex flex-col justify-center">
              <p className="text-xs font-semibold text-[#9A5B13] mb-4">
                Interactive 3D QR Menus for India · Launching across Delhi NCR
              </p>

              <h1
                className="font-bold tracking-tight text-[#171923] leading-[1.06] mb-5"
                style={{ fontSize: 'clamp(2.3rem, 4vw, 3.6rem)' }}
              >
                Your restaurant menu, beautifully digital.
              </h1>

              <p className="text-base sm:text-lg text-[#4A505E] leading-relaxed max-w-xl mb-7">
                Create an interactive digital menu for your restaurant. Update dishes and prices
                anytime, accept direct Paytm &amp; BHIM UPI payments, and grow Google Reviews after
                every meal.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 mb-8">
                <Link
                  to={user ? '/dashboard' : '/register'}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#FF9F43] text-[#171923] text-sm font-bold hover:bg-[#F09134] transition-colors whitespace-nowrap shrink-0"
                >
                  Create Your Free Menu
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/menu/cafe-mocha"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[#171923]/20 bg-white text-[#171923] text-sm font-semibold hover:border-[#171923] transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Demo Menu
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>

              {/* Compact Scannable Live Demo QR Card */}
              <div className="rounded-2xl bg-white border border-[#E6DFD3] p-4 flex items-center gap-4 mb-7">
                <div className="w-20 h-20 rounded-xl bg-[#171923] p-1.5 flex items-center justify-center shrink-0">
                  {demoQrUrl ? (
                    <img
                      src={demoQrUrl}
                      alt="Scan to open Cafe Mocha demo menu"
                      className="w-full h-full object-contain rounded-lg bg-white p-1"
                    />
                  ) : (
                    <QrCode className="w-10 h-10 text-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#9A5B13]">Live Demo · Cafe Mocha</p>
                  <p className="text-sm font-bold text-[#171923] truncate">
                    Scan with your phone camera
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Try EN/हिंदी, cart, Paytm/BHIM UPI pay &amp; Google Reviews.
                  </p>
                </div>
                <Link
                  to="/menu/cafe-mocha"
                  aria-label="Open Cafe Mocha demo"
                  className="w-9 h-9 rounded-xl bg-[#FAF6EE] hover:bg-[#FF9F43] text-[#171923] flex items-center justify-center shrink-0 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#6B7280] pt-5 border-t border-[#E9E1D4]">
                <span>Free up to 20 dishes</span>
                <span aria-hidden="true">·</span>
                <span>0% commission UPI</span>
                <span aria-hidden="true">·</span>
                <span>Post-payment Google Reviews</span>
                <span aria-hidden="true">·</span>
                <span>EN + हिंदी</span>
              </div>
            </div>

            {/* Right Hero Showcase: Interactive Three.js 3D Bistro Scene */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <Landing3DShowcase />
              <div className="grid grid-cols-3 gap-3 rounded-2xl bg-white border border-[#E6DFD3] px-5 py-3.5 text-left">
                <div>
                  <p className="font-mono text-base sm:text-lg font-bold tabular-nums text-[#171923]">
                    4 UPI Apps
                  </p>
                  <p className="text-[11px] sm:text-xs text-[#6B7280]">
                    Paytm, BHIM, GPay, PhonePe
                  </p>
                </div>
                <div>
                  <p className="font-mono text-base sm:text-lg font-bold tabular-nums text-[#171923]">
                    5★ Reviews
                  </p>
                  <p className="text-[11px] sm:text-xs text-[#6B7280]">
                    Google prompt after pay
                  </p>
                </div>
                <div>
                  <p className="font-mono text-base sm:text-lg font-bold tabular-nums text-[#171923]">
                    ₹0 Fee
                  </p>
                  <p className="text-[11px] sm:text-xs text-[#6B7280]">
                    Zero order commissions
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section — Asymmetric Editorial Grid */}
        <section id="features" className="py-20 lg:py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-14">
              <p className="text-xs font-semibold text-[#9A5B13] mb-2">Built for hospitality</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171923] mb-4">
                Everything a restaurant owner needs to run a modern digital menu.
              </h2>
              <p className="text-base text-[#4A505E]">
                No clunky PDFs, no developer dependency, and no per-order commissions. Manage your
                dishes from any phone or laptop.
              </p>
            </div>

            <div className="grid lg:grid-cols-12 gap-6">
              {/* Large Feature 1 */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] overflow-hidden flex flex-col justify-between">
                <div className="p-7 sm:p-8">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF3E3] text-[#C86D14] flex items-center justify-center mb-5">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-[#171923] mb-2.5">
                    Instant price, availability & photo updates
                  </h3>
                  <p className="text-sm text-[#4A505E] leading-relaxed max-w-xl">
                    Ran out of Paneer Tikka at 9 PM? Flip a single availability switch from your
                    dashboard and diners immediately see it marked unavailable — no crossed-out
                    paper menus.
                  </p>
                </div>
                <div className="px-7 pb-7 grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#FAF6EE]">
                    <SmartImage
                      src={DEMO_ASSETS.paneerTikka}
                      alt="Paneer Tikka"
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <DietaryMark foodType="veg" />
                        <p className="text-sm font-semibold truncate">Paneer Tikka</p>
                      </div>
                      <p className="font-mono text-xs font-semibold tabular-nums text-[#239B69] mt-1">
                        ₹249 · Available
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#FAF6EE]">
                    <SmartImage
                      src={DEMO_ASSETS.margheritaPizza}
                      alt="Margherita Pizza"
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <DietaryMark foodType="veg" />
                        <p className="text-sm font-semibold truncate">Margherita Pizza</p>
                      </div>
                      <p className="font-mono text-xs font-semibold tabular-nums text-[#171923] mt-1">
                        ₹299 · Featured
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="lg:col-span-5 bg-[#171923] text-white rounded-2xl p-7 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-white/10 text-[#FF9F43] flex items-center justify-center mb-5">
                    <Printer className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold mb-2.5">
                    Permanent QR codes & print-ready PDF posters
                  </h3>
                  <p className="text-sm text-white/75 leading-relaxed">
                    Download high-resolution PNG QR codes or A4 printable table posters with your
                    restaurant logo, brand accent, and "Scan to view our menu." ready for any local
                    print shop.
                  </p>
                </div>
                <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-white/75">
                  <span>High-contrast 1024px PNG</span>
                  <span aria-hidden="true">·</span>
                  <span>Print-ready A4 PDF</span>
                  <span aria-hidden="true">·</span>
                  <span>Table QRs</span>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E6DFD3] p-7 sm:p-8">
                <div className="w-10 h-10 rounded-xl bg-[#EAF7F1] text-[#239B69] flex items-center justify-center mb-5">
                  <Search className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-[#171923] mb-2.5">
                  AI paper menu import, EN / हिंदी toggle & Menu Assistant
                </h3>
                <p className="text-sm text-[#4A505E] leading-relaxed">
                  Snap a photo of your existing printed menu to import dishes in seconds. Diners can
                  switch between English and Hindi, filter Veg / Non-Veg / Egg, or ask the Menu
                  Assistant for combos under their budget.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] p-7 sm:p-8 flex flex-col sm:flex-row gap-6 items-center">
                <div className="flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF3E3] text-[#C86D14] flex items-center justify-center mb-5">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-[#171923] mb-2.5">
                    Direct Multi-UPI checkout &amp; post-payment Google Reviews
                  </h3>
                  <p className="text-sm text-[#4A505E] leading-relaxed">
                    Let customers pay directly via Paytm, BHIM UPI, Google Pay, PhonePe, or your
                    uploaded shop QR with zero commissions. Right after payment, diners are prompted
                    to rate their meal and post a Google Review to boost your local ranking.
                  </p>
                </div>
                <SmartImage
                  src={DEMO_ASSETS.chocolateBrownie}
                  alt="Artisanal chocolate brownie on ceramic plate"
                  className="w-full sm:w-44 h-40 rounded-xl object-cover shrink-0"
                />
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-20 bg-white border-y border-[#E9E1D4]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-14">
              <p className="text-xs font-semibold text-[#9A5B13] mb-2">How it works</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171923]">
                Go from paper menu to scannable QR tables in four simple steps.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  num: '01.',
                  title: 'Register your restaurant',
                  body: 'Sign in, enter your restaurant name, city, and contact details, and claim your permanent /menu/your-name URL.',
                },
                {
                  num: '02.',
                  title: 'Add branding & dishes',
                  body: 'Upload your logo, cover photo, categories, and dishes with INR pricing and Indian Veg / Non-Veg / Egg marks.',
                },
                {
                  num: '03.',
                  title: 'Download & print QR',
                  body: 'Export your permanent QR as a sharp PNG or printable A4 table poster ready for stands, counters, and flyers.',
                },
                {
                  num: '04.',
                  title: 'Update anytime live',
                  body: 'Change prices, add festival specials, or toggle out-of-stock dishes — your printed QR codes update automatically.',
                },
              ].map((step) => (
                <div key={step.num} className="pt-6 border-t border-[#171923]/15">
                  <p className="font-mono text-sm font-semibold text-[#C86D14] mb-3">{step.num}</p>
                  <h3 className="text-base font-bold text-[#171923] mb-2">{step.title}</h3>
                  <p className="text-sm text-[#4A505E] leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Restaurant Use Cases */}
        <section className="py-20 lg:py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
              <div className="max-w-xl">
                <p className="text-xs font-semibold text-[#9A5B13] mb-2">Use cases</p>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171923]">
                  Designed for every kitchen format across India.
                </h2>
              </div>

              <div className="flex flex-wrap gap-1.5 p-1 bg-[#F2EBE0] rounded-xl">
                {USE_CASES.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setActiveUseCase(u.id)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      activeUseCase === u.id
                        ? 'bg-white text-[#171923] shadow-xs'
                        : 'text-[#525866] hover:text-[#171923]'
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E6DFD3] p-8 sm:p-10 grid lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <p className="text-xs font-semibold text-[#239B69]">{selectedUseCase.label}</p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171923]">
                  {selectedUseCase.headline}
                </h3>
                <p className="text-base text-[#4A505E] leading-relaxed">{selectedUseCase.detail}</p>
                <p className="text-xs font-medium text-[#6B7280] pt-2">{selectedUseCase.metrics}</p>
              </div>
              <div className="lg:col-span-5 grid grid-cols-2 gap-3">
                <SmartImage
                  src={DEMO_ASSETS.cappuccino}
                  alt="Artisanal cappuccino"
                  className="w-full h-36 rounded-xl object-cover"
                />
                <SmartImage
                  src={DEMO_ASSETS.coldCoffee}
                  alt="Chilled cold coffee"
                  className="w-full h-36 rounded-xl object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-20 bg-white border-y border-[#E9E1D4]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-14">
              <p className="text-xs font-semibold text-[#9A5B13] mb-2">Simple INR pricing</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171923] mb-3">
                Start free. Upgrade only when your menu grows.
              </h2>
              <p className="text-base text-[#4A505E]">
                Zero commission on orders. Transparent monthly plans designed for Indian restaurants.
              </p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
              {PLAN_ORDER.map((planId) => {
                const plan = PLANS[planId];
                const isHighlight = planId === 'growth';
                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-7 flex flex-col justify-between border ${
                      isHighlight
                        ? 'bg-[#171923] text-white border-[#171923]'
                        : 'bg-[#FFF9F1]/60 text-[#171923] border-[#E6DFD3]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="text-lg font-bold">{plan.name}</h3>
                        {isHighlight && (
                          <span className="text-xs font-semibold text-[#FF9F43]">Most popular</span>
                        )}
                      </div>
                      <p
                        className={`text-xs mb-6 leading-relaxed ${
                          isHighlight ? 'text-white/70' : 'text-[#525866]'
                        }`}
                      >
                        {plan.audience}
                      </p>

                      <div className="flex items-baseline gap-1 mb-6">
                        <span className="font-mono text-3xl font-bold tabular-nums">
                          {plan.priceLabel}
                        </span>
                        <span
                          className={`text-xs ${isHighlight ? 'text-white/65' : 'text-[#6B7280]'}`}
                        >
                          {plan.monthlyInr === 0 ? 'forever' : '/month'}
                        </span>
                      </div>

                      <ul className="space-y-3 text-sm mb-8">
                        {plan.features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2.5">
                            <Check
                              className={`w-4 h-4 mt-0.5 shrink-0 ${
                                isHighlight ? 'text-[#FF9F43]' : 'text-[#239B69]'
                              }`}
                            />
                            <span className={isHighlight ? 'text-white/90' : 'text-[#373D4A]'}>
                              {feat}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Link
                      to={user ? '/dashboard/subscription' : '/register'}
                      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                        isHighlight
                          ? 'bg-[#FF9F43] text-[#171923] hover:bg-[#F09134]'
                          : 'bg-[#171923] text-white hover:bg-[#2A2E3F]'
                      }`}
                    >
                      {plan.monthlyInr === 0 ? 'Start for free' : `Choose ${plan.name}`}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 lg:py-24">
          <div className="max-w-4xl mx-auto px-6">
            <div className="mb-10">
              <p className="text-xs font-semibold text-[#9A5B13] mb-2">Questions</p>
              <h2 className="text-3xl font-bold tracking-tight text-[#171923]">
                Frequently asked by restaurant owners
              </h2>
            </div>

            <div className="divide-y divide-[#E6DFD3] border-y border-[#E6DFD3]">
              {FAQS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q} className="py-5">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 text-left"
                    >
                      <span className="text-base font-semibold text-[#171923]">{item.q}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-[#6B7280] shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-sm text-[#4A505E] leading-relaxed max-w-3xl">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final Conversion Block */}
        <section className="pb-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-2xl bg-[#171923] text-white p-10 sm:p-14 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div className="max-w-xl">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                  Ready to put your restaurant menu on every table?
                </h2>
                <p className="text-sm sm:text-base text-white/75">
                  Create your restaurant, upload your first dishes, and download a print-ready QR
                  poster in minutes.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0">
                <Link
                  to={user ? '/dashboard' : '/register'}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#FF9F43] text-[#171923] text-sm font-bold hover:bg-[#F09134] transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  Create Your Free Menu
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#E9E1D4] bg-white py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <MenuQrBrand size="sm" />
            <p className="text-xs text-[#6B7280]">
              Digital QR menus built for restaurants, cafes, bakeries, dhabas & cloud kitchens in
              India.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-[#525866]">
            <Link to="/menu/cafe-mocha" className="hover:text-[#171923] transition-colors">
              Demo Menu (Cafe Mocha)
            </Link>
            <a href="#pricing" className="hover:text-[#171923] transition-colors">
              Pricing
            </a>
            <Link to="/login" className="hover:text-[#171923] transition-colors">
              Owner Login
            </Link>
            {isAdmin && (
              <Link to="/admin" className="hover:text-[#171923] transition-colors">
                Platform Admin
              </Link>
            )}
            <span className="text-[#8B8376]">© {new Date().getFullYear()} MENUQR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

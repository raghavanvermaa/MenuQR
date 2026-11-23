import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail, Phone, User } from 'lucide-react';
import { MenuQrBrand, SmartImage } from '../components/BrandUI';
import { DEMO_ASSETS } from '../data/demoRestaurant';
import { useAuth } from '../contexts/AuthContext';

const FIREBASE_AUTH_PROVIDERS_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0886802942/authentication/providers';

function mapAuthError(error: unknown): { message: string; showProviderSetup?: boolean } {
  const code = (error as { code?: string })?.code || '';
  if (code === 'auth/popup-closed-by-user') {
    return { message: 'Sign-in window was closed before completing.' };
  }
  if (code === 'auth/email-already-in-use') {
    return { message: 'An account with this email already exists. Please log in instead.' };
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return { message: 'Incorrect email or password. Please check your credentials and try again.' };
  }
  if (code === 'auth/weak-password') {
    return { message: 'Password must be at least 8 characters long.' };
  }
  if (code === 'auth/invalid-email') {
    return { message: 'Please enter a valid email address.' };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      message:
        'Email/Password sign-in needs to be toggled ON once in your Firebase Console (Authentication → Sign-in method → Email/Password). Meanwhile, "Continue with Google" works immediately.',
      showProviderSetup: true,
    };
  }
  return {
    message: error instanceof Error ? error.message : 'Authentication failed. Please try again.',
  };
}

function AuthErrorBanner({ error }: { error: { message: string; showProviderSetup?: boolean } | null }) {
  if (!error) return null;
  return (
    <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318] space-y-2" role="alert">
      <p>{error.message}</p>
      {error.showProviderSetup && (
        <a
          href={FIREBASE_AUTH_PROVIDERS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block font-semibold text-[#171923] underline"
        >
          Open Firebase Sign-in Method Settings →
        </a>
      )}
    </div>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FFF9F1] grid lg:grid-cols-12">
      {/* Left Brand Showcase */}
      <div className="hidden lg:flex lg:col-span-5 bg-[#171923] text-white p-10 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <Link to="/" className="inline-block">
            <MenuQrBrand inverted />
          </Link>
          <h2 className="mt-12 text-3xl font-bold tracking-tight leading-snug">
            Launch your restaurant’s digital QR menu in minutes.
          </h2>
          <p className="mt-4 text-sm text-white/75 leading-relaxed max-w-sm">
            Organize categories, upload appetizing dish photos, update INR prices anytime, and print
            permanent QR posters for every table.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="rounded-xl overflow-hidden border border-white/10">
            <SmartImage
              src={DEMO_ASSETS.cover}
              alt="Modern Delhi specialty cafe"
              className="w-full h-48 object-cover"
            />
          </div>
          <p className="text-xs text-white/60">
            Trusted by cafes, bakeries, dhabas & cloud kitchens · Delhi NCR
          </p>
        </div>
      </div>

      {/* Right Auth Form */}
      <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="lg:hidden">
            <MenuQrBrand size="sm" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#525866] hover:text-[#171923] transition-colors ml-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>
        </div>

        <div className="max-w-md w-full mx-auto my-10 bg-white rounded-2xl border border-[#E6DFD3] p-7 sm:p-9">
          <h1 className="text-2xl font-bold text-[#171923] tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-[#525866] mb-6">{subtitle}</p>
          {children}
        </div>

        <p className="text-center text-xs text-[#8B8376]">
          Want to preview the diner experience first?{' '}
          <Link to="/menu/cafe-mocha" className="font-semibold text-[#171923] underline">
            Explore Cafe Mocha demo
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-[#D8D0C2] bg-white hover:bg-[#FAF6EE] text-sm font-semibold text-[#171923] transition-colors disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
          />
          <path
            fill="#34A853"
            d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
          />
          <path
            fill="#EA4335"
            d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
          />
        </svg>
      )}
      {label}
    </button>
  );
}

export function LoginPage() {
  const { signInWithGoogle, loginWithEmail } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<{ message: string; showProviderSetup?: boolean } | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError({ message: 'Enter both email and password.' });
      return;
    }
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your restaurant menus and QR codes."
    >
      <GoogleButton
        label="Continue with Google"
        loading={googleLoading}
        onClick={handleGoogle}
      />

      <div className="my-6 flex items-center gap-3 text-xs text-[#8B8376]">
        <div className="flex-1 h-px bg-[#EAE3D7]" />
        <span>or with email</span>
        <div className="flex-1 h-px bg-[#EAE3D7]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#171923] mb-1.5" htmlFor="login-email">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@restaurant.in"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[#171923]" htmlFor="login-password">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-[#C86D14] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
        </div>

        <AuthErrorBanner error={error} />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Log in
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[#525866]">
        New to MENUQR?{' '}
        <Link to="/register" className="font-semibold text-[#171923] hover:underline">
          Create your free account
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { signInWithGoogle, registerWithEmail } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<{ message: string; showProviderSetup?: boolean } | null>(null);

  const hasMinLen = password.length >= 8;
  const hasNumber = /\d/.test(password);

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigate('/onboarding');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError({ message: 'Please enter your full name.' });
      return;
    }
    if (!hasMinLen || !hasNumber) {
      setError({ message: 'Password must be at least 8 characters and include at least one number.' });
      return;
    }
    setLoading(true);
    try {
      await registerWithEmail({ fullName, email, password, phone });
      navigate('/onboarding');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your MENUQR account"
      subtitle="Set up your restaurant’s digital menu in less than 5 minutes."
    >
      <GoogleButton
        label="Sign up with Google (Recommended)"
        loading={googleLoading}
        onClick={handleGoogle}
      />

      <div className="my-6 flex items-center gap-3 text-xs text-[#8B8376]">
        <div className="flex-1 h-px bg-[#EAE3D7]" />
        <span>or register with email</span>
        <div className="flex-1 h-px bg-[#EAE3D7]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#171923] mb-1.5" htmlFor="reg-name">
            Full name
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="reg-name"
              type="text"
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Aarav Sharma"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#171923] mb-1.5" htmlFor="reg-email">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@restaurant.in"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#171923] mb-1.5" htmlFor="reg-phone">
            Phone number <span className="font-normal text-[#8B8376]">(optional)</span>
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="reg-phone"
              type="tel"
              maxLength={24}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98110 00000"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#171923] mb-1.5" htmlFor="reg-password">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="reg-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters with a number"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px]">
            <span className={hasMinLen ? 'text-[#239B69] font-medium' : 'text-[#8B8376]'}>
              {hasMinLen ? '✓' : '·'} 8+ characters
            </span>
            <span className={hasNumber ? 'text-[#239B69] font-medium' : 'text-[#8B8376]'}>
              {hasNumber ? '✓' : '·'} At least 1 number
            </span>
          </div>
        </div>

        <AuthErrorBanner error={error} />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[#FF9F43] text-[#171923] text-sm font-bold hover:bg-[#F09134] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Create Free Account
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[#525866]">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-[#171923] hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ message: string; showProviderSetup?: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email linked to your MENUQR account and we will send a reset link."
    >
      {sent ? (
        <div className="space-y-5">
          <div className="rounded-xl bg-[#EAF7F1] border border-[#BDE5D2] p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#239B69] shrink-0 mt-0.5" />
            <div className="text-xs text-[#1B6E4B] leading-relaxed">
              <p className="font-semibold mb-1">Password reset link sent</p>
              <p>Check your inbox at {email} and follow the link to choose a new password.</p>
            </div>
          </div>
          <Link
            to="/login"
            className="w-full inline-flex items-center justify-center py-2.5 rounded-xl bg-[#171923] text-white text-sm font-semibold"
          >
            Return to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#171923] mb-1.5" htmlFor="reset-email">
              Email address
            </label>
            <input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@restaurant.in"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
            />
          </div>

          <AuthErrorBanner error={error} />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Send reset email
          </button>

          <p className="text-center text-xs text-[#525866] pt-2">
            Remembered it?{' '}
            <Link to="/login" className="font-semibold text-[#171923] hover:underline">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

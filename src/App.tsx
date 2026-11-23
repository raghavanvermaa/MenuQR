import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages';
import { OnboardingPage } from './pages/OnboardingPage';
import { PublicMenuPage } from './pages/PublicMenuPage';
import { DashboardLayout } from './pages/DashboardLayout';
import { OverviewTab } from './pages/dashboard/OverviewTab';
import { AiAnalyticsTab } from './pages/dashboard/AiAnalyticsTab';
import { MenuTab } from './pages/dashboard/MenuTab';
import { CategoriesTab } from './pages/dashboard/CategoriesTab';
import { QrCodesTab } from './pages/dashboard/QrCodesTab';
import {
  ProfileTab,
  SettingsTab,
  SubscriptionTab,
} from './pages/dashboard/ProfileSettingsSubscriptionTabs';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF9F1] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#FF9F43]" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Marketing Website */}
            <Route path="/" element={<LandingPage />} />

            {/* Authentication */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Public Customer-Facing Digital Menu */}
            <Route path="/menu/:slug" element={<PublicMenuPage />} />

            {/* Protected Restaurant Onboarding */}
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <OnboardingPage />
                </RequireAuth>
              }
            />

            {/* Protected Owner Dashboard */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardLayout />
                </RequireAuth>
              }
            >
              <Route index element={<OverviewTab />} />
              <Route path="analytics" element={<AiAnalyticsTab />} />
              <Route path="menu" element={<MenuTab />} />
              <Route path="categories" element={<CategoriesTab />} />
              <Route path="qr" element={<QrCodesTab />} />
              <Route path="profile" element={<ProfileTab />} />
              <Route path="settings" element={<SettingsTab />} />
              <Route path="subscription" element={<SubscriptionTab />} />
            </Route>

            {/* Protected Platform Admin Console */}
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminDashboardPage />
                </RequireAuth>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

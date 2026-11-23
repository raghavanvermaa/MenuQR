import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, db, googleAuthProvider } from '../lib/firebase';
import { getProfile, upsertProfile } from '../lib/menuService';
import type { Profile } from '../types/menuqr';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  registerWithEmail: (params: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ verificationSent: boolean }>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const hydrateUser = async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    // If the user just verified their email (e.g. password sign-up), ensure the JWT ID token
    // itself reflects email_verified: true so Firestore security rules accept writes immediately.
    if (firebaseUser.emailVerified) {
      try {
        const tokenResult = await firebaseUser.getIdTokenResult();
        if (!tokenResult.claims.email_verified) {
          await firebaseUser.getIdToken(true);
        }
      } catch {
        // Proceed with existing token if offline
      }
    }

    setUser(firebaseUser);

    // Determine server-controlled admin status strictly (requires verified email)
    let adminFlag =
      firebaseUser.emailVerified === true &&
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

    if (!adminFlag && firebaseUser.emailVerified) {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
        adminFlag = adminSnap.exists();
      } catch {
        adminFlag = false;
      }
    }
    setIsAdmin(adminFlag);

    // Sync profile document for authenticated users
    try {
      const synced = await upsertProfile({
        uid: firebaseUser.uid,
        fullName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Owner',
        email: firebaseUser.email || '',
      });
      setProfile(synced);
    } catch {
      const existing = await getProfile(firebaseUser.uid).catch(() => null);
      setProfile(
        existing || {
          id: firebaseUser.uid,
          fullName: firebaseUser.displayName || 'Restaurant Owner',
          email: firebaseUser.email || '',
          phone: '',
        }
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      void hydrateUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    await hydrateUser(cred.user);
  };

  const registerWithEmail = async (params: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
    await updateProfile(cred.user, { displayName: params.fullName.trim() });
    let verificationSent = false;
    try {
      await sendEmailVerification(cred.user);
      verificationSent = true;
    } catch {
      verificationSent = false;
    }
    try {
      await upsertProfile({
        uid: cred.user.uid,
        fullName: params.fullName.trim(),
        email: params.email.trim(),
        phone: params.phone?.trim() || '',
      });
    } catch {
      // Profile will be synced again on hydration
    }
    await hydrateUser(cred.user);
    return { verificationSent };
  };

  const loginWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await hydrateUser(cred.user);
  };

  const requestPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const resendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      await hydrateUser(auth.currentUser);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } finally {
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      signInWithGoogle,
      registerWithEmail,
      loginWithEmail,
      requestPasswordReset,
      resendVerificationEmail,
      refreshUser,
      signOut,
    }),
    [user, profile, loading, isAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

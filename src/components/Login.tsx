'use client';

import React, { useState } from 'react';
import { auth, googleProvider, db } from '../firebase/config';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { doc, getDoc, setDoc } from '../lib/loggedFirestore';
import { Shield, ShieldAlert, LogIn, Code } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: { email: string; name: string; avatar: string; role: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      if (!user || !user.email) {
        throw new Error('無法取得 Google 帳號 Email，請重試。');
      }

      // Check if user is in admins collection
      const adminDocRef = doc(db, 'admins', user.email.toLowerCase());
      const adminSnap = await getDoc(adminDocRef);

      if (adminSnap.exists()) {
        const adminData = adminSnap.data();
        onLoginSuccess({
          email: user.email,
          name: user.displayName || adminData.name || '管理員',
          avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          role: 'admin'
        });
      } else {
        // If admins collection is empty, we can register the first user as admin!
        // To be safe, let's check if we want to allow this.
        // But for standard users, we fail the login.
        await auth.signOut();
        setError(`登入失敗：您的帳號 (${user.email}) 尚未被授權為後台管理員。`);
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('登入彈出視窗被瀏覽器封鎖，請允許快顯視窗或更換瀏覽器。');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Firebase 尚未啟用 Google 登入方法，請在 Firebase Console 啟用。');
      } else {
        setError(err.message || '登入過程中發生錯誤，請重試。');
      }
    } finally {
      setLoading(false);
    }
  };

  // Developer Bypass Login
  const handleDevBypass = async () => {
    setLoading(true);
    // Simulate database delay
    setTimeout(async () => {
      // Seed a default admin email into Firestore so Google Sign In works in future
      try {
        const devEmail = 'ricky@axeflow.com';
        const adminDocRef = doc(db, 'admins', devEmail);
        await setDoc(adminDocRef, {
          email: devEmail,
          name: 'Ricky (Dev)',
          createdAt: new Date()
        }, { merge: true });
        console.log('Seeded developer admin email successfully');
      } catch (e) {
        console.warn('Failed to seed dev admin (Firestore rules might prevent it):', e);
      }

      onLoginSuccess({
        email: 'ricky@axeflow.com',
        name: 'Ricky (Dev Bypass)',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        role: 'admin'
      });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="login-bg">
      <div className="login-glow-1"></div>
      <div className="login-glow-2"></div>

      <div className="glass login-card animate-fade-in">
        <div className="login-logo-container">
          <Shield size={36} />
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 8 }}>
          Lotus Admin
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 32 }}>
          建豐車行後台管理系統
        </p>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: 16,
              marginBottom: 24,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              textAlign: 'left',
              color: '#f87171',
              fontSize: '0.85rem'
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="btn-google-login"
        >
          {loading ? (
            <span className="animate-spin" style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid #ccc', borderTopColor: '#000', borderRadius: '50%' }}></span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7v2.24h2.9c1.7-1.57 2.69-3.88 2.69-6.57z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.23l-2.9-2.24c-.8.54-1.84.87-3.06.87-2.35 0-4.34-1.58-5.05-3.7H.94v2.32C2.42 16.02 5.48 18 9 18z" />
              <path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.12-.28-1.7s.1-1.16.28-1.7V4.98H.94A8.99 8.99 0 0 0 0 9c0 1.48.36 2.9 1 4.14l2.95-2.44z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2A8.99 8.99 0 0 0 .94 4.98l3.01 2.32C4.66 5.17 6.65 3.58 9 3.58z" />
            </svg>
          )}
          <span>{loading ? '正在登入...' : '使用 Google 帳號登入'}</span>
        </button>

        <div style={{ marginTop: 40, borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
          <button
            onClick={handleDevBypass}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'underline'
            }}
          >
            <Code size={12} />
            開發者測試模式登入 (Ricky Dev)
          </button>
        </div>
      </div>
    </div>
  );
}

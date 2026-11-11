'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Compass, 
  Car, 
  Users, 
  ClipboardList, 
  Tag, 
  Shield, 
  LogOut,
  MapPin,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';

// Components
import Login from '../components/Login';
import Overview from '../components/Overview';
import DispatchMap from '../components/DispatchMap';
import DriverManager from '../components/DriverManager';
import UserManager from '../components/UserManager';
import OrderManager from '../components/OrderManager';
import MarketingManager from '../components/MarketingManager';
import AdminManager from '../components/AdminManager';

interface AdminUser {
  email: string;
  name: string;
  avatar: string;
  role: string;
}

export default function Home() {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [openTabs, setOpenTabs] = useState<string[]>(['overview']);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore Firebase Auth state on mount
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        try {
          // Double check Firestore admin database whitelist
          const adminDocRef = doc(db, 'admins', firebaseUser.email.toLowerCase());
          const adminSnap = await getDoc(adminDocRef);

          if (adminSnap.exists()) {
            const adminData = adminSnap.data();
            setAdminUser({
              email: firebaseUser.email,
              name: firebaseUser.displayName || adminData.name || '管理員',
              avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
              role: 'admin'
            });
          } else {
            console.warn("User is not in the admin collection. Logging out.");
            await auth.signOut();
            setAdminUser(null);
          }
        } catch (e) {
          console.error("Error restoring admin state:", e);
          setAdminUser(null);
        }
      } else {
        // If not bypass logged in, reset admin state
        if (!adminUser || adminUser.email !== 'ricky@axeflow.com') {
          setAdminUser(null);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [adminUser]);

  // Automatically collapse sidebar on dispatch map to maximize screen area
  useEffect(() => {
    if (activeTab === 'dispatch') {
      setSidebarCollapsed(true);
    }
  }, [activeTab]);

  const handleLoginSuccess = (user: AdminUser) => {
    setAdminUser(user);
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
    setAdminUser(null);
  };

  const handleNavigate = (tabId: string) => {
    if (!openTabs.includes(tabId)) {
      setOpenTabs([...openTabs, tabId]);
    }
    setActiveTab(tabId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabId === 'overview' && openTabs.length === 1) return;

    const newTabs = openTabs.filter(t => t !== tabId);
    setOpenTabs(newTabs);

    if (activeTab === tabId && newTabs.length > 0) {
      setActiveTab(newTabs[newTabs.length - 1]);
    }
  };

  const getTabIcon = (tabId: string) => {
    switch (tabId) {
      case 'overview': return <LayoutDashboard size={12} />;
      case 'dispatch': return <Compass size={12} />;
      case 'drivers': return <Car size={12} />;
      case 'users': return <Users size={12} />;
      case 'orders': return <ClipboardList size={12} />;
      case 'marketing': return <Tag size={12} />;
      case 'admins': return <Shield size={12} />;
      default: return <LayoutDashboard size={12} />;
    }
  };

  const getTabLabel = (tabId: string) => {
    switch (tabId) {
      case 'overview': return '儀表板總覽';
      case 'dispatch': return '派車現況';
      case 'drivers': return '司機管理';
      case 'users': return '乘客管理';
      case 'orders': return '訂單管理';
      case 'marketing': return '優惠券管理';
      case 'admins': return '管理者管理';
      default: return '儀表板總覽';
    }
  };

  if (authLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07080d', color: 'var(--text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin" style={{ width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto 16px auto' }}></div>
          <span>正在載入管理系統...</span>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!adminUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderTabContent = () => {
    const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    switch (activeTab) {
      case 'overview':
        return <Overview onNavigate={handleNavigate} />;
      case 'dispatch':
        return <DispatchMap apiKey={mapsApiKey} />;
      case 'drivers':
        return <DriverManager />;
      case 'users':
        return <UserManager />;
      case 'orders':
        return <OrderManager />;
      case 'marketing':
        return <MarketingManager />;
      case 'admins':
        return <AdminManager currentAdminEmail={adminUser.email} />;
      default:
        return <Overview onNavigate={handleNavigate} />;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'overview': return '儀表板總覽';
      case 'dispatch': return '派車現況';
      case 'drivers': return '司機管理';
      case 'users': return '乘客管理';
      case 'orders': return '訂單管理';
      case 'marketing': return '優惠券管理';
      case 'admins': return '管理者管理';
      default: return 'Lotus Admin';
    }
  };

  return (
    <div className={`admin-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* 1. Sidebar Left */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-symbol">
            <Shield size={20} />
          </div>
          {!sidebarCollapsed && <span className="logo-text">Lotus Admin</span>}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
            className="sidebar-toggle-btn"
            title={sidebarCollapsed ? '展開選單' : '收合選單'}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="sidebar-menu">
          <button 
            onClick={() => handleNavigate('overview')}
            className={`menu-item ${activeTab === 'overview' ? 'active' : ''}`}
            title="儀表板總覽"
          >
            <LayoutDashboard size={18} />
            {!sidebarCollapsed && <span>儀表板總覽</span>}
          </button>
          
          <button 
            onClick={() => handleNavigate('dispatch')}
            className={`menu-item ${activeTab === 'dispatch' ? 'active' : ''}`}
            title="派車現況"
          >
            <Compass size={18} />
            {!sidebarCollapsed && <span>派車現況</span>}
          </button>
          
          <button 
            onClick={() => handleNavigate('drivers')}
            className={`menu-item ${activeTab === 'drivers' ? 'active' : ''}`}
            title="司機管理"
          >
            <Car size={18} />
            {!sidebarCollapsed && <span>司機管理</span>}
          </button>
          
          <button 
            onClick={() => handleNavigate('users')}
            className={`menu-item ${activeTab === 'users' ? 'active' : ''}`}
            title="乘客管理"
          >
            <Users size={18} />
            {!sidebarCollapsed && <span>乘客管理</span>}
          </button>
          
          <button 
            onClick={() => handleNavigate('orders')}
            className={`menu-item ${activeTab === 'orders' ? 'active' : ''}`}
            title="訂單管理"
          >
            <ClipboardList size={18} />
            {!sidebarCollapsed && <span>訂單管理</span>}
          </button>
          
          <button 
            onClick={() => handleNavigate('marketing')}
            className={`menu-item ${activeTab === 'marketing' ? 'active' : ''}`}
            title="優惠券管理"
          >
            <Tag size={18} />
            {!sidebarCollapsed && <span>優惠券管理</span>}
          </button>
          
          <button 
            onClick={() => handleNavigate('admins')}
            className={`menu-item ${activeTab === 'admins' ? 'active' : ''}`}
            title="管理者管理"
          >
            <Shield size={18} />
            {!sidebarCollapsed && <span>管理者管理</span>}
          </button>
        </nav>

        {/* User profile footer */}
        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <img 
              src={adminUser.avatar} 
              alt={adminUser.name} 
              className="user-avatar"
            />
            {!sidebarCollapsed && (
              <div className="user-info">
                <span className="user-name" title={adminUser.email}>{adminUser.name}</span>
                <span className="user-role">系統管理員</span>
              </div>
            )}
          </div>
          
          <button onClick={handleSignOut} className="btn-signout" title="登出系統">
            <LogOut size={14} />
            {!sidebarCollapsed && <span>登出系統</span>}
          </button>
        </div>
      </aside>

      {/* 2. Workspace Right */}
      <main className="admin-workspace">
        {activeTab !== 'dispatch' && (
          <header className="workspace-header">
            <h1 className="header-title">{getTabTitle()}</h1>
            <div className="header-actions">
              {/* Display Firebase project status */}
              <div className="glass" style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }}></span>
                <span>已連接: axeflowlotus-6dc3b</span>
              </div>
            </div>
          </header>
        )}

        {/* Tabs Bar */}
        <div className="workspace-tabs-bar">
          {openTabs.map((tabId) => {
            const isActive = activeTab === tabId;
            return (
              <div 
                key={tabId} 
                onClick={() => setActiveTab(tabId)}
                className={`workspace-tab-pill ${isActive ? 'active' : ''}`}
                title={getTabLabel(tabId)}
              >
                {getTabIcon(tabId)}
                <span className="tab-label">{getTabLabel(tabId)}</span>
                {openTabs.length > 1 && (
                  <button onClick={(e) => handleCloseTab(e, tabId)} className="tab-close-btn" type="button" title="關閉分頁" aria-label={`關閉${getTabLabel(tabId)}分頁`}>
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Body content switches based on tab */}
        <div className={`workspace-body ${activeTab === 'dispatch' ? 'no-padding' : ''}`}>
          {renderTabContent()}
        </div>
      </main>
    </div>
  );
}

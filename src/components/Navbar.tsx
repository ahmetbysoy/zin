import React from 'react';
import { 
  BarChart3, 
  Layers, 
  Settings, 
  Terminal, 
  TrendingUp, 
  Zap 
} from 'lucide-react';
import { ActiveTab } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isRunning: boolean;
  totalBuckets: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  isRunning,
  totalBuckets,
}) => {
  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string | number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
    { id: 'wallets', label: 'Kovalar', icon: Layers, badge: totalBuckets },
    { id: 'stats', label: 'İstatistik', icon: BarChart3 },
    { id: 'logs', label: 'Terminal', icon: Terminal },
    { id: 'settings', label: 'Ayarlar', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-rose-200/80 dark:border-stone-800 shadow-lg px-2 py-1.5 transition-colors">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-rose-50/50 dark:hover:bg-stone-800/50 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.id === 'dashboard' && isRunning && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                )}
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-3 text-[9px] font-mono px-1 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-extrabold border border-rose-200 dark:border-rose-900">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] tracking-tight mt-0.5">{tab.label}</span>
              {isActive && (
                <span className="absolute -bottom-1 w-8 h-1 bg-rose-600 dark:bg-rose-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

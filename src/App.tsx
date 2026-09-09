import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Activity, 
  ArrowDownRight, 
  ArrowUpRight, 
  Play, 
  Radio, 
  Square, 
  Volume2, 
  VolumeX, 
  Zap 
} from 'lucide-react';
import { soundEngine } from './audio';
import { BucketManager, WSManager } from './engine';
import { 
  ActiveTab, 
  AppSettings, 
  BucketStats, 
  BucketThresholds, 
  CustomBucket, 
  RecentTrade, 
  SmartMoneyDivergence, 
  SortOption, 
  TerminalLog, 
  TimeframeOption 
} from './types';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { BucketList } from './components/BucketList';
import { StatsView } from './components/StatsView';
import { LogsView } from './components/LogsView';
import { SettingsView } from './components/SettingsView';

const QUICK_COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', '1000PEPEUSDT', 'TRBUSDT', 'XRPUSDT', 'BNBUSDT'];

export default function App() {
  // Navigation & Settings
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('kara_para_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      theme: 'dark',
      soundEnabled: true,
      activeTimeframe: '1m',
      bufferSize: 1000,
      maxRecentTrades: 30,
      autoReconnect: true,
    };
  });

  // Trading Symbol & State
  const [symbolInput, setSymbolInput] = useState('BTCUSDT');
  const [activeSymbol, setActiveSymbol] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');

  // Quant Engine State
  const [thresholds, setThresholds] = useState<BucketThresholds>({
    shrimpMax: 1000,
    crabMax: 10000,
    whaleMax: 100000,
  });
  const [customBuckets, setCustomBuckets] = useState<CustomBucket[]>([]);
  const [sortedBuckets, setSortedBuckets] = useState<BucketStats[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('activity');
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [divergence, setDivergence] = useState<SmartMoneyDivergence>({
    timeframe: '1m',
    retailDelta: 0,
    smartDelta: 0,
    signal: 'NEUTRAL',
    signalTitle: '⚖️ DENGELİ / NÖTR PİYASA (1M)',
    signalDesc: 'Gerçek Binance Futures akışı bekleniyor...',
    confidence: 50,
    timestamp: Date.now(),
  });
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

  // Engine & WS Refs
  const bucketManagerRef = useRef<BucketManager | null>(null);
  const wsManagerRef = useRef<WSManager | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const tradeBatchRef = useRef<RecentTrade[]>([]);
  const lastSignalRef = useRef<string>('NEUTRAL');

  if (!bucketManagerRef.current) {
    bucketManagerRef.current = new BucketManager(appSettings.bufferSize);
  }
  if (!wsManagerRef.current) {
    wsManagerRef.current = new WSManager(bucketManagerRef.current);
  }

  // Terminal Logger
  const addLog = useCallback((text: string, type: 'info' | 'warn' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [
      ...prev.slice(-300),
      { id: Date.now() + Math.random(), text, type, time, timestamp: Date.now() },
    ]);
  }, []);

  // Theme Synchronizer
  useEffect(() => {
    const root = document.documentElement;
    if (appSettings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [appSettings.theme]);

  // Audio mute state
  useEffect(() => {
    soundEngine.setMuted(!appSettings.soundEnabled);
  }, [appSettings.soundEnabled]);

  // Save settings
  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    setAppSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem('kara_para_settings', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Setup callbacks
  useEffect(() => {
    const bm = bucketManagerRef.current;
    const ws = wsManagerRef.current;
    if (!bm || !ws) return;

    setCustomBuckets([...bm.customBuckets]);

    bm.onThresholdUpdate = (t) => {
      setThresholds({ ...t });
    };

    bm.onCustomBucketsUpdate = (buckets) => {
      setCustomBuckets([...buckets]);
    };

    ws.onStatusChange = (status) => {
      setConnectionState(status);
      if (status === 'connected') setIsRunning(true);
      else if (status === 'disconnected' || status === 'error') setIsRunning(false);
    };

    ws.onLog = (msg, type) => {
      addLog(msg, type);
    };

    ws.onTrade = (trade) => {
      tradeBatchRef.current.push(trade);
      if (tradeBatchRef.current.length > 50) {
        tradeBatchRef.current.shift();
      }

      const prev = prevPriceRef.current;
      if (prev !== null) {
        if (trade.price > prev) setPriceDirection('up');
        else if (trade.price < prev) setPriceDirection('down');
      }
      prevPriceRef.current = trade.price;
      setCurrentPrice(trade.price);
    };

    addLog('Terminal başlatıldı. Binance Futures verilerine hazır.', 'info');
  }, [addLog]);

  // Decoupled 120ms React UI Refresh Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const bm = bucketManagerRef.current;
      if (!bm) return;

      const now = Date.now();
      const div = bm.getSmartMoneyDivergence(appSettings.activeTimeframe, now);
      setDivergence(div);

      // Dopamin Ses Tetikleyici: Boğa Emilimi ya da Dağıtım tespit edildiğinde
      if (div.signal !== lastSignalRef.current) {
        if (div.signal === 'ACCUMULATION') {
          soundEngine.playSignalChime('bull');
          addLog(`💥 SİNYAL ALARMI: ${div.signalTitle}`, 'success');
        } else if (div.signal === 'DISTRIBUTION') {
          soundEngine.playSignalChime('bear');
          addLog(`🚨 SİNYAL ALARMI: ${div.signalTitle}`, 'warn');
        }
        lastSignalRef.current = div.signal;
      }

      // Kovaları sırala
      const sorted = bm.getAllBucketsSorted(sortOption, appSettings.activeTimeframe, now);
      setSortedBuckets(sorted);

      // İşlem akışını aktar
      if (tradeBatchRef.current.length > 0) {
        setRecentTrades((prev) => {
          const combined = [...tradeBatchRef.current.reverse(), ...prev];
          tradeBatchRef.current = [];
          return combined.slice(0, 80);
        });
      }
    }, 120);

    return () => clearInterval(interval);
  }, [appSettings.activeTimeframe, sortOption, addLog]);

  // Start Stream Handler
  const handleStart = (symbolToStart?: string) => {
    const sym = (symbolToStart || symbolInput).trim().toUpperCase();
    if (!sym) return;

    setActiveSymbol(sym);
    setSymbolInput(sym);
    setIsRunning(true);
    wsManagerRef.current?.connect(sym);
  };

  // Stop Stream Handler
  const handleStop = () => {
    wsManagerRef.current?.disconnect();
    setIsRunning(false);
    setConnectionState('disconnected');
    setCurrentPrice(null);
    prevPriceRef.current = null;
  };

  return (
    <div className="min-h-screen bg-pink-50/50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans pb-24 transition-colors">
      
      {/* ==================================================================== */}
      {/* TOP HEADER & STREAM CONTROL BAR */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-rose-200/80 dark:border-stone-800 shadow-xs px-3 py-2.5 transition-colors">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          
          {/* Logo & Status Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-white font-black shadow-xs">
                <Zap className="w-5 h-5 fill-white" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-black tracking-tight leading-none text-stone-900 dark:text-stone-100">
                  KARA PARA <span className="text-rose-600 dark:text-rose-400">FUTURES</span>
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-stone-400">
                    Akıllı Para vs Retail Radarı
                  </span>
                </div>
              </div>
            </div>

            {/* Price Badge on Mobile */}
            <div className="md:hidden">
              <div
                id="price-val"
                className={`font-mono text-sm font-black px-2.5 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 ${
                  priceDirection === 'up' ? 'text-emerald-600 dark:text-emerald-400' :
                  priceDirection === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-stone-700 dark:text-stone-300'
                }`}
              >
                {currentPrice ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: currentPrice < 1 ? 4 : 2 })}` : '---'}
              </div>
            </div>
          </div>

          {/* Controls & Quick Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Real-time Price Badge on Desktop */}
            <div
              id="price-val"
              className={`hidden md:block font-mono text-base font-black px-3.5 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors ${
                priceDirection === 'up' ? 'text-emerald-600 dark:text-emerald-400' :
                priceDirection === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-stone-700 dark:text-stone-300'
              }`}
            >
              {currentPrice ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: currentPrice < 1 ? 4 : 2 })}` : '---'}
            </div>

            {/* Coin Input & Start/Stop Form */}
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <input
                id="coinInput"
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                placeholder="BTCUSDT..."
                className="w-28 sm:w-32 px-3 py-1.5 text-xs font-mono font-bold uppercase bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-400 text-stone-900 dark:text-stone-100"
              />

              {!isRunning ? (
                <button
                  id="startBtn"
                  type="button"
                  onClick={() => handleStart()}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>BAŞLAT</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-3.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-rose-300 font-black text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-300" />
                  <span>DURDUR</span>
                </button>
              )}
            </div>

            {/* WebSocket Status Indicator */}
            <div
              id="ws-status"
              className={`p-1.5 px-2.5 rounded-xl font-mono text-[11px] font-bold border transition-colors flex items-center gap-1.5 ${
                connectionState === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                  : connectionState === 'connecting'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                  : 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${connectionState === 'connected' ? 'animate-pulse text-emerald-600' : ''}`} />
              <span className="truncate max-w-[130px]">
                {connectionState === 'connected' ? `Bağlı (${activeSymbol})` : connectionState === 'connecting' ? 'Bağlanıyor...' : 'Kapalı'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Coin Bar */}
        <div className="max-w-5xl mx-auto flex items-center gap-1.5 pt-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-mono text-stone-400 shrink-0">Hızlı Pariteler:</span>
          {QUICK_COINS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleStart(c)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all shrink-0 ${
                activeSymbol === c && isRunning
                  ? 'bg-rose-600 text-white shadow-2xs font-black'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-rose-100 dark:hover:bg-stone-700'
              }`}
            >
              {c.replace('USDT', '')}
            </button>
          ))}
        </div>
      </header>

      {/* ==================================================================== */}
      {/* MAIN CONTENT AREA BY ACTIVE TAB */}
      {/* ==================================================================== */}
      <main className="max-w-5xl mx-auto px-3 py-4">
        {activeTab === 'dashboard' && (
          <Dashboard
            divergence={divergence}
            topBuckets={sortedBuckets}
            recentTrades={recentTrades}
            activeTimeframe={appSettings.activeTimeframe}
            onTimeframeChange={(tf) => handleUpdateSettings({ activeTimeframe: tf })}
            maxTradesShown={appSettings.maxRecentTrades}
            activeSymbol={activeSymbol}
            onNavigateToWallets={() => setActiveTab('wallets')}
          />
        )}

        {activeTab === 'wallets' && (
          <BucketList
            buckets={sortedBuckets}
            activeTimeframe={appSettings.activeTimeframe}
            onTimeframeChange={(tf) => handleUpdateSettings({ activeTimeframe: tf })}
            sortBy={sortOption}
            onSortChange={setSortOption}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView
            bucketManager={bucketManagerRef.current!}
            activeSymbol={activeSymbol}
          />
        )}

        {activeTab === 'logs' && (
          <LogsView
            logs={terminalLogs}
            onClearLogs={() => setTerminalLogs([])}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            bucketManager={bucketManagerRef.current!}
            customBuckets={customBuckets}
            appSettings={appSettings}
            onUpdateSettings={handleUpdateSettings}
            onRefreshCustomBuckets={() => setCustomBuckets([...bucketManagerRef.current!.customBuckets])}
          />
        )}
      </main>

      {/* ==================================================================== */}
      {/* FIXED BOTTOM NAVIGATION TOOLBAR */}
      {/* ==================================================================== */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRunning={isRunning}
        totalBuckets={customBuckets.length + 4}
      />

    </div>
  );
}

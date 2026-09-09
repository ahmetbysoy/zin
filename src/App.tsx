import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  AlertTriangle,
  ArrowDownRight, 
  ArrowUpRight, 
  BarChart3, 
  CheckCircle2,
  Compass,
  Layers, 
  Play, 
  Radio, 
  ShieldAlert,
  Sliders, 
  Square, 
  Terminal, 
  TrendingDown, 
  TrendingUp, 
  Zap 
} from 'lucide-react';
import { BucketManager, WSManager } from './engine';
import { BucketKey, BucketThresholds, EngineStatsState, RecentTrade, SmartMoneyDivergence } from './types';

export default function App() {
  const [symbolInput, setSymbolInput] = useState('TRBUSDT');
  const [activeSymbol, setActiveSymbol] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [engineMode, setEngineMode] = useState<'dynamic' | 'static'>('dynamic');
  const [thresholds, setThresholds] = useState<BucketThresholds>({
    shrimpMax: 1000,
    crabMax: 10000,
    whaleMax: 100000,
  });
  const [bufferCount, setBufferCount] = useState(0);
  const [bootstrapVol, setBootstrapVol] = useState<number | null>(null);
  const [bootstrapMultiplier, setBootstrapMultiplier] = useState<number>(1.0);
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [stats, setStats] = useState<Record<BucketKey, any>>({
    shrimp: { buyVol: 0, sellVol: 0, count: 0, rolling1mDelta: 0, directionalBias: 50, aggressionScore: 50 },
    crab: { buyVol: 0, sellVol: 0, count: 0, rolling1mDelta: 0, directionalBias: 50, aggressionScore: 50 },
    whale: { buyVol: 0, sellVol: 0, count: 0, rolling1mDelta: 0, directionalBias: 50, aggressionScore: 50 },
    leviathan: { buyVol: 0, sellVol: 0, count: 0, rolling1mDelta: 0, directionalBias: 50, aggressionScore: 50 },
  });
  const [divergence, setDivergence] = useState<SmartMoneyDivergence>({
    retailDelta1m: 0,
    smartDelta1m: 0,
    signal: 'NEUTRAL',
    signalTitle: '⚖️ DENGELİ / NÖTR PİYASA',
    signalDesc: 'Veri toplanıyor...',
    confidence: 50,
  });
  const [terminalLogs, setTerminalLogs] = useState<Array<{ id: number; text: string; type: 'info' | 'warn' | 'success' | 'error'; time: string }>>([]);

  // Singleton managers
  const bucketManagerRef = useRef<BucketManager | null>(null);
  const wsManagerRef = useRef<WSManager | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const tradeBatchRef = useRef<RecentTrade[]>([]);

  // Initialize managers once
  if (!bucketManagerRef.current) {
    bucketManagerRef.current = new BucketManager();
  }
  if (!wsManagerRef.current) {
    wsManagerRef.current = new WSManager(bucketManagerRef.current);
  }

  const addLog = (text: string, type: 'info' | 'warn' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [{ id: Date.now() + Math.random(), text, type, time }, ...prev.slice(0, 60)]);
  };

  useEffect(() => {
    const bm = bucketManagerRef.current!;
    const wm = wsManagerRef.current!;

    bm.onThresholdUpdate = (newThresholds, mode) => {
      setThresholds({ ...newThresholds });
      setBufferCount(bm.ringBuffer.count);
      setBootstrapVol(bm.lastBootstrapVolume);
      setBootstrapMultiplier(bm.lastMultiplier);
    };

    wm.onStatusChange = (status, msg) => {
      setConnectionState(status);
      if (status === 'connected') {
        setIsRunning(true);
      } else if (status === 'disconnected' || status === 'error') {
        setIsRunning(false);
      }
    };

    wm.onLog = (msg, type) => {
      addLog(msg, type);
    };

    wm.onTrade = (trade) => {
      tradeBatchRef.current.unshift(trade);
      if (tradeBatchRef.current.length > 25) {
        tradeBatchRef.current.pop();
      }

      // Price tick direction
      if (prevPriceRef.current !== null) {
        if (trade.price > prevPriceRef.current) setPriceDirection('up');
        else if (trade.price < prevPriceRef.current) setPriceDirection('down');
      }
      prevPriceRef.current = trade.price;
      setCurrentPrice(trade.price);
    };

    // Smooth UI sync interval (120ms) - Updates rolling 1m stats & divergence
    const interval = setInterval(() => {
      if (tradeBatchRef.current.length > 0) {
        setTrades([...tradeBatchRef.current]);
      }
      if (bm) {
        const rolling = bm.getAllRollingStats();
        setStats(rolling);
        const div = bm.getSmartMoneyDivergence();
        setDivergence(div);
        setBufferCount(bm.ringBuffer.count);
      }
    }, 120);

    return () => {
      clearInterval(interval);
      wm.disconnect();
    };
  }, []);

  const handleStartAnalysis = (overrideSymbol?: string) => {
    const targetSymbol = (overrideSymbol || symbolInput).trim().toUpperCase();
    if (!targetSymbol) {
      alert('Lan manyak mısın? Coin sembolü gir! (Örn: BTCUSDT)');
      return;
    }

    const wm = wsManagerRef.current;
    if (!wm) return;

    setActiveSymbol(targetSymbol);
    setSymbolInput(targetSymbol);
    tradeBatchRef.current = [];
    setTrades([]);
    setCurrentPrice(null);
    prevPriceRef.current = null;

    wm.disconnect();
    wm.connect(targetSymbol);
  };

  const handleStopAnalysis = () => {
    const wm = wsManagerRef.current;
    if (wm) {
      wm.disconnect();
      setIsRunning(false);
      addLog(`⏹️ WS durduruldu: ${activeSymbol}`, 'warn');
    }
  };

  const handleToggleMode = (mode: 'dynamic' | 'static') => {
    setEngineMode(mode);
    if (bucketManagerRef.current) {
      bucketManagerRef.current.setMode(mode);
      setThresholds(
        mode === 'dynamic'
          ? { ...bucketManagerRef.current.dynamicThresholds }
          : { ...bucketManagerRef.current.staticThresholds }
      );
      addLog(`⚙️ Eşik Modu: ${mode.toUpperCase()}`, 'info');
    }
  };

  const quickCoins = ['TRBUSDT', '1000PEPEUSDT', 'BTCUSDT', 'SOLUSDT', 'ETHUSDT', 'DOGEUSDT'];

  const bucketMetadata: Record<BucketKey, { name: string; icon: string; rangeDesc: string; role: string; border: string; bg: string }> = {
    shrimp: {
      name: 'Karides',
      icon: '🦐',
      rangeDesc: `< $${thresholds.shrimpMax.toLocaleString()}`,
      role: 'Retail / Gürültü',
      border: 'border-pink-200',
      bg: 'bg-white/90',
    },
    crab: {
      name: 'Yengeç',
      icon: '🦀',
      rangeDesc: `$${thresholds.shrimpMax.toLocaleString()} - $${thresholds.crabMax.toLocaleString()}`,
      role: 'Mid-Tier / Swing',
      border: 'border-rose-200',
      bg: 'bg-rose-50/70',
    },
    whale: {
      name: 'Balina',
      icon: '🐋',
      rangeDesc: `$${thresholds.crabMax.toLocaleString()} - $${thresholds.whaleMax.toLocaleString()}`,
      role: 'Smart Money (Yön Verici)',
      border: 'border-pink-300',
      bg: 'bg-pink-100/60',
    },
    leviathan: {
      name: 'Leviathan',
      icon: '🦑',
      rangeDesc: `> $${thresholds.whaleMax.toLocaleString()}`,
      role: 'Market Maker / Likidite Avcısı',
      border: 'border-purple-300',
      bg: 'bg-purple-100/60',
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/80 via-pink-50/60 to-rose-100/40 text-stone-800 antialiased p-3 sm:p-5 lg:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* TOP BAR / BRAND HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rose-200/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  KARA PARA <span className="text-rose-600 font-extrabold text-xs uppercase px-2 py-0.5 rounded-md bg-rose-100 border border-rose-200">Faza 2 Engine</span>
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold border border-pink-200">PWA</span>
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Binance Futures 1m Kayan Pencere, Smart Money Divergence & Quantile Motoru
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live price badge */}
            <div className="px-3.5 py-2 bg-white/90 border border-rose-200 rounded-xl shadow-2xs flex items-center gap-2.5">
              <span className="text-xs text-stone-400 font-medium">CANLI FİYAT</span>
              <span 
                id="price-val" 
                className={`font-mono text-lg font-bold transition-colors ${
                  priceDirection === 'up' ? 'text-emerald-600' : priceDirection === 'down' ? 'text-rose-600' : 'text-stone-900'
                }`}
              >
                {currentPrice ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: currentPrice < 1 ? 4 : 2 })}` : '$--'}
              </span>
            </div>

            {/* Mode switch */}
            <div className="flex bg-rose-100/70 p-1 rounded-xl border border-rose-200/80 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleToggleMode('dynamic')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  engineMode === 'dynamic' 
                    ? 'bg-white text-rose-700 shadow-2xs font-bold' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Dinamik (Quantile)
              </button>
              <button
                type="button"
                onClick={() => handleToggleMode('static')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  engineMode === 'static' 
                    ? 'bg-white text-rose-700 shadow-2xs font-bold' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Statik (Sabit)
              </button>
            </div>
          </div>
        </header>

        {/* INPUT & CONTROL BAR */}
        <section className="bg-white/90 backdrop-blur-xs rounded-2xl p-4 sm:p-5 border border-pink-200/80 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <input
                id="coinInput"
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="Örn: TRBUSDT, 1000PEPEUSDT, BTCUSDT"
                className="w-full bg-rose-50/40 border border-rose-200 rounded-xl px-4 py-3 text-stone-900 font-mono font-bold text-base uppercase focus:outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all placeholder:text-stone-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStartAnalysis();
                }}
              />
              <span className="absolute right-3 top-3 text-xs font-semibold text-rose-400 bg-rose-100 px-2 py-1 rounded-md">
                BINANCE FUTURES
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="startBtn"
                type="button"
                onClick={() => handleStartAnalysis()}
                disabled={isRunning}
                className={`px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 ${
                  isRunning 
                    ? 'bg-rose-100 text-rose-400 cursor-not-allowed border border-rose-200' 
                    : 'bg-rose-600 hover:bg-rose-700 active:scale-98 text-white'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                {isRunning ? 'AKIŞ AKTİF' : 'ANALİZİ BAŞLAT'}
              </button>

              {isRunning && (
                <button
                  type="button"
                  onClick={handleStopAnalysis}
                  className="px-4 py-3 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-700 border border-stone-200 rounded-xl font-medium text-sm transition-all"
                  title="Akışı Durdur"
                >
                  <Square className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Coin Pills */}
          <div className="flex items-center flex-wrap gap-1.5 pt-1">
            <span className="text-xs text-stone-400 font-medium mr-1">Hızlı Seçim:</span>
            {quickCoins.map((coin) => (
              <button
                key={coin}
                type="button"
                onClick={() => {
                  setSymbolInput(coin);
                  handleStartAnalysis(coin);
                }}
                className={`text-xs px-2.5 py-1 rounded-lg font-mono transition-all ${
                  activeSymbol === coin
                    ? 'bg-rose-600 text-white font-bold shadow-2xs'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/60'
                }`}
              >
                {coin}
              </button>
            ))}
          </div>

          {/* WS STATUS BAR WITH EXACT REQUIRED ID */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-rose-100">
            <div
              id="ws-status"
              className={`p-3 rounded-xl font-mono text-sm flex items-center gap-2 border transition-all ${
                connectionState === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                  : connectionState === 'connecting'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                  : connectionState === 'error'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                  : 'bg-stone-100 text-stone-600 border-stone-200'
              }`}
            >
              <Radio className={`w-4 h-4 ${connectionState === 'connected' ? 'animate-pulse text-emerald-600' : ''}`} />
              <span>
                {connectionState === 'connected'
                  ? `Status: Bağlı (${activeSymbol})`
                  : connectionState === 'connecting'
                  ? `Status: Bağlanıyor (${symbolInput})...`
                  : connectionState === 'error'
                  ? 'Status: Bağlantı Hatası!'
                  : 'Status: Beklemede (Coin girip Başlat\'a bas)'}
              </span>
            </div>

            {/* Bootstrap & Memory Indicator */}
            <div className="flex items-center gap-3 text-xs font-mono text-stone-500 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>Ring Buffer: <strong className="text-stone-800">{bufferCount} / 500</strong></span>
              </div>
              {bootstrapVol !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-300">|</span>
                  <span>24s Hacim: <strong className="text-stone-800">${(bootstrapVol / 1_000_000).toFixed(1)}M</strong></span>
                  <span className="px-1.5 py-0.5 rounded-sm bg-rose-100 text-rose-800 font-bold text-[10px]">{bootstrapMultiplier}x</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FAZA 2 YENİLİK: AKILLI PARA VS APTAL PARA UYUMSUZLUK RADARI (SMART MONEY DIVERGENCE) */}
        <section className={`rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
          divergence.signal === 'ACCUMULATION' 
            ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-400/20' 
            : divergence.signal === 'DISTRIBUTION'
            ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/20'
            : divergence.signal === 'BULL_MOMENTUM'
            ? 'bg-teal-50/90 border-teal-300'
            : divergence.signal === 'BEAR_MOMENTUM'
            ? 'bg-amber-50/90 border-amber-300'
            : 'bg-white/90 border-pink-200/80'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-5 h-5 ${
                  divergence.signal === 'ACCUMULATION' ? 'text-emerald-600' :
                  divergence.signal === 'DISTRIBUTION' ? 'text-rose-600' : 'text-stone-500'
                }`} />
                <h2 className="text-sm font-extrabold tracking-tight text-stone-900">
                  {divergence.signalTitle}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-white/80 border border-stone-200">
                  Güven: %{divergence.confidence}
                </span>
              </div>
              <p className="text-xs text-stone-600 font-medium">
                {divergence.signalDesc}
              </p>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-stone-200 shadow-2xs">
                <span className="text-stone-400 text-[10px] block">RETAIL (KARİDES) 1M</span>
                <span className={`font-bold ${divergence.retailDelta1m >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {divergence.retailDelta1m >= 0 ? '+' : ''}${Math.round(divergence.retailDelta1m).toLocaleString()}
                </span>
              </div>
              <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-stone-200 shadow-2xs">
                <span className="text-stone-400 text-[10px] block">SMART (BALİNA+LEV) 1M</span>
                <span className={`font-bold text-sm ${divergence.smartDelta1m >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {divergence.smartDelta1m >= 0 ? '+' : ''}${Math.round(divergence.smartDelta1m).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* DİNAMİK QUANTILE BUCKET EŞİKLERİ KARTI */}
        <section className="bg-white/90 rounded-2xl p-4 sm:p-5 border border-pink-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-stone-900 tracking-tight">
                {engineMode === 'dynamic' ? 'Canlı Quantile Rolling Eşikleri (P70, P90, P98)' : 'Sabit Kara Para Eşikleri'}
              </h2>
            </div>
            <span className="text-xs text-stone-400 font-mono">
              {engineMode === 'dynamic' ? 'Her 50 işlemde bir oto-kalibre olur' : 'Manuel statik mod'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80">
              <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                <span>🦐 Karides (Noise)</span>
                <span className="font-mono text-[10px] bg-stone-200 px-1.5 py-0.2 rounded-sm text-stone-700">P0-P70</span>
              </div>
              <div className="font-mono text-sm font-bold text-stone-800">
                &lt; ${thresholds.shrimpMax.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/80">
              <div className="flex items-center justify-between text-xs text-rose-700 mb-1">
                <span>🦀 Yengeç (Mid)</span>
                <span className="font-mono text-[10px] bg-rose-200 px-1.5 py-0.2 rounded-sm text-rose-800">P70-P90</span>
              </div>
              <div className="font-mono text-sm font-bold text-stone-800">
                ${thresholds.shrimpMax.toLocaleString()} - ${thresholds.crabMax.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-pink-50 border border-pink-200/80">
              <div className="flex items-center justify-between text-xs text-pink-700 mb-1">
                <span>🐋 Balina (Smart)</span>
                <span className="font-mono text-[10px] bg-pink-200 px-1.5 py-0.2 rounded-sm text-pink-800">P90-P98</span>
              </div>
              <div className="font-mono text-sm font-bold text-stone-800">
                ${thresholds.crabMax.toLocaleString()} - ${thresholds.whaleMax.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200/80">
              <div className="flex items-center justify-between text-xs text-purple-800 mb-1">
                <span>🦑 Leviathan (MM)</span>
                <span className="font-mono text-[10px] bg-purple-200 px-1.5 py-0.2 rounded-sm text-purple-900 font-bold">&gt; P98</span>
              </div>
              <div className="font-mono text-sm font-bold text-purple-950">
                &gt; ${thresholds.whaleMax.toLocaleString()}
              </div>
            </div>
          </div>
        </section>

        {/* 4 HAYALİ CÜZDAN GRUBU İSTATİSTİKLERİ (FAZA 2: 1M ROLLING & AGRESYON MOTORU) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {(['shrimp', 'crab', 'whale', 'leviathan'] as BucketKey[]).map((key) => {
            const meta = bucketMetadata[key];
            const s = stats[key] || { buyVol: 0, sellVol: 0, count: 0, rolling1mDelta: 0, directionalBias: 50, aggressionScore: 50 };
            const netDeltaAll = s.buyVol - s.sellVol;
            const delta1m = s.rolling1mDelta || 0;
            const bias = s.directionalBias ?? 50;
            const isBullish = bias > 55;
            const isBearish = bias < 45;

            return (
              <div
                key={key}
                className={`rounded-2xl p-4 border ${meta.border} ${meta.bg} shadow-xs flex flex-col justify-between space-y-3 transition-all`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{meta.icon}</span>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900 leading-none">{meta.name}</h3>
                      <span className="text-[10px] font-medium text-stone-400 block mt-0.5">{meta.role}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isBullish ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                    isBearish ? 'bg-rose-100 text-rose-800 border-rose-200' :
                    'bg-stone-100 text-stone-600 border-stone-200'
                  }`}>
                    {isBullish ? 'LONG BIAS 🟢' : isBearish ? 'SHORT BIAS 🔴' : 'NÖTR ⚪'}
                  </span>
                </div>

                {/* 1m Rolling Net Delta (FAZA 2 Ana Metriği) */}
                <div className="p-2.5 rounded-xl bg-white/80 border border-pink-100">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-0.5">
                    <span>Son 1 Dakika Net Delta</span>
                    <span className="font-mono text-stone-500">{s.rolling1mCount || 0} tx/dk</span>
                  </div>
                  <div className={`font-mono text-lg font-black flex items-center gap-1 ${
                    delta1m > 0 ? 'text-emerald-600' : delta1m < 0 ? 'text-rose-600' : 'text-stone-600'
                  }`}>
                    {delta1m > 0 ? <ArrowUpRight className="w-4 h-4 stroke-[3]" /> : delta1m < 0 ? <ArrowDownRight className="w-4 h-4 stroke-[3]" /> : null}
                    <span>{delta1m > 0 ? '+' : ''}${Math.round(delta1m).toLocaleString()}</span>
                  </div>
                </div>

                {/* Kümülatif Net Delta & Hacim Bilgisi */}
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-stone-500">
                    <span>Toplam Delta:</span>
                    <span className={`font-bold ${netDeltaAll >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {netDeltaAll >= 0 ? '+' : ''}${Math.round(netDeltaAll).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Toplam Alım:</span>
                    <span className="font-semibold">${Math.round(s.buyVol).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Toplam Satım:</span>
                    <span className="font-semibold">${Math.round(s.sellVol).toLocaleString()}</span>
                  </div>
                </div>

                {/* 1m Agresyon & Yön Barı */}
                <div className="pt-1">
                  <div className="flex justify-between text-[11px] font-mono font-semibold mb-1">
                    <span className="text-emerald-700">Agresif Alıcı %{bias}</span>
                    <span className="text-rose-700">Satıcı %{100 - bias}</span>
                  </div>
                  <div className="w-full h-2 bg-rose-200/80 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${bias}%` }}
                    ></div>
                    <div
                      className="bg-rose-500 h-full transition-all duration-300"
                      style={{ width: `${100 - bias}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* BOTTOM SPLIT: CANLI İŞLEM AKIŞI + TERMINAL LOGLARI */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Canlı İşlem Ticker (7 Kolon) */}
          <div className="lg:col-span-7 bg-white/90 rounded-2xl p-4 sm:p-5 border border-pink-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-bold text-stone-900">Canlı İşlem Akışı (Son Gelenler)</h2>
              </div>
              <span className="text-xs text-stone-400 font-mono">Gerçek Binance Stream</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-rose-100 text-stone-400">
                    <th className="pb-2 font-medium">Zaman</th>
                    <th className="pb-2 font-medium">Fiyat</th>
                    <th className="pb-2 font-medium">Değer (USDT)</th>
                    <th className="pb-2 font-medium">Taraf</th>
                    <th className="pb-2 font-medium text-right">Kova</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-stone-400 font-sans">
                        Henüz işlem akışı başlatılmadı. Yukarıdan coini seçip <strong>"ANALİZİ BAŞLAT"</strong> tuşuna bas!
                      </td>
                    </tr>
                  ) : (
                    trades.slice(0, 12).map((t) => {
                      const meta = bucketMetadata[t.bucket];
                      return (
                        <tr key={t.id} className="hover:bg-rose-50/50 transition-colors">
                          <td className="py-2 text-stone-500">{new Date(t.time).toLocaleTimeString()}</td>
                          <td className={`py-2 font-semibold ${t.isBuyerMaker ? 'text-rose-600' : 'text-emerald-600'}`}>
                            ${t.price.toLocaleString(undefined, { minimumFractionDigits: t.price < 1 ? 4 : 2 })}
                          </td>
                          <td className="py-2 font-bold text-stone-800">
                            ${Math.round(t.notional).toLocaleString()}
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              t.isBuyerMaker ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {t.isBuyerMaker ? 'MARKET SATIŞ' : 'MARKET ALIŞ'}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.border} ${meta.bg} text-stone-800`}>
                              {meta.icon} {meta.name}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Terminal Konsolu (5 Kolon) */}
          <div className="lg:col-span-5 bg-stone-950 rounded-2xl p-4 sm:p-5 text-emerald-400 font-mono shadow-xs space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                <div className="flex items-center gap-2 text-stone-300 text-xs font-semibold">
                  <Terminal className="w-3.5 h-3.5 text-rose-400" />
                  <span>KARA PARA ÇEKİRDEK LOGLARI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTerminalLogs([])}
                  className="text-[10px] text-stone-500 hover:text-stone-300"
                >
                  Temizle
                </button>
              </div>

              <div className="h-64 overflow-y-auto space-y-1.5 text-[11px] pt-2 scrollbar-thin">
                {terminalLogs.length === 0 ? (
                  <div className="text-stone-600 text-xs py-4 text-center">
                    Terminal hazır. Başlat komutunu bekliyor...
                  </div>
                ) : (
                  terminalLogs.map((log) => (
                    <div key={log.id} className="leading-relaxed">
                      <span className="text-stone-600 mr-1.5">[{log.time}]</span>
                      <span className={
                        log.type === 'success' ? 'text-emerald-300 font-bold' :
                        log.type === 'warn' ? 'text-amber-300' :
                        log.type === 'error' ? 'text-rose-400 font-bold' :
                        'text-stone-300'
                      }>
                        {log.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-stone-800/80 text-[10px] text-stone-500 flex items-center justify-between">
              <span>WebSocket: wss://fstream.binance.com</span>
              <span className="text-emerald-500 font-bold">● ONLINE</span>
            </div>
          </div>

        </section>

      </div>
    </div>
  );
}

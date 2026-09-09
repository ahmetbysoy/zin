import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  ArrowDownRight, 
  ArrowUpRight, 
  BarChart3, 
  Check, 
  Flame, 
  Layers, 
  Play, 
  Plus, 
  Radio, 
  RefreshCw, 
  RotateCcw, 
  Search, 
  Settings, 
  ShieldAlert, 
  SlidersHorizontal, 
  Sparkles, 
  Square, 
  Terminal, 
  Trash2, 
  TrendingDown, 
  TrendingUp, 
  Wallet, 
  Zap 
} from 'lucide-react';
import { BucketManager, WSManager } from './engine';
import { ActiveTab, BucketConfig, BucketStats, RecentTrade, SmartMoneyDivergence, SortOption } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('analysis');
  const [symbolInput, setSymbolInput] = useState('TRBUSDT');
  const [activeSymbol, setActiveSymbol] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [engineMode, setEngineMode] = useState<'dynamic' | 'static'>('dynamic');
  
  const [buckets, setBuckets] = useState<BucketConfig[]>([]);
  const [bucketStatsList, setBucketStatsList] = useState<BucketStats[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('activity');
  
  const [bufferCount, setBufferCount] = useState(0);
  const [bootstrapVol, setBootstrapVol] = useState<number | null>(null);
  const [bootstrapMultiplier, setBootstrapMultiplier] = useState<number>(1.0);
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  
  const [divergence, setDivergence] = useState<SmartMoneyDivergence>({
    retailDelta1m: 0,
    smartDelta1m: 0,
    signal: 'NEUTRAL',
    signalTitle: '⚖️ DENGELİ / NÖTR PİYASA',
    signalDesc: 'Veri akışı bekleniyor...',
    confidence: 50,
  });
  
  const [terminalLogs, setTerminalLogs] = useState<Array<{ id: number; text: string; type: 'info' | 'warn' | 'success' | 'error'; time: string }>>([]);

  // Form State for Adding New Bucket
  const [newBucketForm, setNewBucketForm] = useState({
    name: '',
    minUsdt: 1000,
    maxUsdt: 5000,
    icon: '🦈',
    color: 'text-sky-700',
    bgColor: 'bg-sky-50/80',
    borderColor: 'border-sky-300',
    isSmartMoney: false,
  });
  const [isAddingBucket, setIsAddingBucket] = useState(false);

  // Singleton managers
  const bucketManagerRef = useRef<BucketManager | null>(null);
  const wsManagerRef = useRef<WSManager | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const tradeBatchRef = useRef<RecentTrade[]>([]);

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

    // Initial buckets
    setBuckets(bm.getBuckets());

    bm.onBucketsChange = (updated) => {
      setBuckets([...updated]);
    };

    bm.onThresholdUpdate = (updated, mode) => {
      setBuckets([...updated]);
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
      if (tradeBatchRef.current.length > 30) {
        tradeBatchRef.current.pop();
      }

      if (prevPriceRef.current !== null) {
        if (trade.price > prevPriceRef.current) setPriceDirection('up');
        else if (trade.price < prevPriceRef.current) setPriceDirection('down');
      }
      prevPriceRef.current = trade.price;
      setCurrentPrice(trade.price);
    };

    // Smooth UI sync (120ms)
    const interval = setInterval(() => {
      if (tradeBatchRef.current.length > 0) {
        setTrades([...tradeBatchRef.current]);
      }
      if (bm) {
        const statsArray = bm.getAllRollingStats(sortOption);
        setBucketStatsList(statsArray);
        const div = bm.getSmartMoneyDivergence();
        setDivergence(div);
        setBufferCount(bm.ringBuffer.count);
      }
    }, 120);

    return () => {
      clearInterval(interval);
      wm.disconnect();
    };
  }, [sortOption]);

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
      addLog(`⏹️ WS akışı durduruldu: ${activeSymbol}`, 'warn');
    }
  };

  const handleToggleMode = (mode: 'dynamic' | 'static') => {
    setEngineMode(mode);
    if (bucketManagerRef.current) {
      bucketManagerRef.current.setMode(mode);
      setBuckets(bucketManagerRef.current.getBuckets());
      addLog(`⚙️ Eşik Modu: ${mode.toUpperCase()} (Kalıcı)`, 'info');
    }
  };

  const handleCreateBucket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBucketForm.name.trim()) {
      alert('Kova adı boş olamaz!');
      return;
    }
    if (newBucketForm.minUsdt >= newBucketForm.maxUsdt) {
      alert('Min USDT, Max USDT değerinden küçük olmalıdır!');
      return;
    }

    const bm = bucketManagerRef.current!;
    const id = `b_${Date.now()}`;
    bm.addBucket({
      id,
      name: newBucketForm.name.trim(),
      minUsdt: Number(newBucketForm.minUsdt),
      maxUsdt: Number(newBucketForm.maxUsdt),
      icon: newBucketForm.icon || '📦',
      color: newBucketForm.color,
      bgColor: newBucketForm.bgColor,
      borderColor: newBucketForm.borderColor,
      isSmartMoney: newBucketForm.isSmartMoney,
    });

    addLog(`✨ Yeni Kova Eklendi: ${newBucketForm.name} ($${newBucketForm.minUsdt} - $${newBucketForm.maxUsdt})`, 'success');
    setIsAddingBucket(false);
    setNewBucketForm({
      name: '',
      minUsdt: 5000,
      maxUsdt: 25000,
      icon: '🦈',
      color: 'text-sky-700',
      bgColor: 'bg-sky-50/80',
      borderColor: 'border-sky-300',
      isSmartMoney: false,
    });
  };

  const handleDeleteBucket = (id: string, name: string) => {
    if (confirm(`"${name}" kovasını silmek istediğine emin misin?`)) {
      const bm = bucketManagerRef.current!;
      bm.removeBucket(id);
      addLog(`🗑️ Kova Silindi: ${name}`, 'warn');
    }
  };

  const handleResetBuckets = () => {
    if (confirm('Tüm kovalar varsayılan Kara Para Standartlarına sıfırlansın mı?')) {
      const bm = bucketManagerRef.current!;
      bm.resetToDefaults();
      addLog('🔄 Kovalar varsayılan 4 seviyeye sıfırlandı.', 'info');
    }
  };

  const quickCoins = ['TRBUSDT', '1000PEPEUSDT', 'BTCUSDT', 'SOLUSDT', 'ETHUSDT', 'DOGEUSDT'];

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/80 via-pink-50/60 to-rose-100/40 text-stone-800 antialiased p-3 sm:p-5 lg:p-7 pb-28 font-sans">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* HEADER / BRAND / CONTROLS */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rose-200/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  KARA PARA <span className="text-rose-600 font-extrabold text-xs uppercase px-2 py-0.5 rounded-md bg-rose-100 border border-rose-200">Faza 3 Quant</span>
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold border border-pink-200">PWA</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-600">
                  {buckets.length} Kova Aktif
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Dinamik Cüzdan Hiyerarşisi, Akıllı Sıralama & LocalStorage Kalıcı Bellek
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live price badge */}
            <div className="px-3.5 py-2 bg-white/90 border border-rose-200 rounded-xl shadow-2xs flex items-center gap-2.5">
              <span className="text-xs text-stone-400 font-medium">FİYAT</span>
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
                Dinamik
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
                Statik
              </button>
            </div>
          </div>
        </header>

        {/* INPUT & STATUS BAR (Always visible for rock-solid connection management) */}
        <section className="bg-white/90 backdrop-blur-xs rounded-2xl p-4 border border-pink-200/80 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <input
                id="coinInput"
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="Örn: TRBUSDT, 1000PEPEUSDT, BTCUSDT"
                className="w-full bg-rose-50/40 border border-rose-200 rounded-xl px-4 py-2.5 text-stone-900 font-mono font-bold text-base uppercase focus:outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all placeholder:text-stone-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStartAnalysis();
                }}
              />
              <span className="absolute right-3 top-2.5 text-[11px] font-semibold text-rose-400 bg-rose-100 px-2 py-0.5 rounded-md">
                BINANCE FUTURES
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="startBtn"
                type="button"
                onClick={() => handleStartAnalysis()}
                disabled={isRunning}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 ${
                  isRunning 
                    ? 'bg-rose-100 text-rose-400 cursor-not-allowed border border-rose-200' 
                    : 'bg-rose-600 hover:bg-rose-700 active:scale-98 text-white'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                {isRunning ? 'AKIŞ AKTİF' : 'BAŞLAT'}
              </button>

              {isRunning && (
                <button
                  type="button"
                  onClick={handleStopAnalysis}
                  className="px-3 py-2.5 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-700 border border-stone-200 rounded-xl font-medium text-sm transition-all"
                  title="Akışı Durdur"
                >
                  <Square className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Coin Pills & Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-[11px] text-stone-400 font-medium mr-1">Hızlı Seçim:</span>
              {quickCoins.map((coin) => (
                <button
                  key={coin}
                  type="button"
                  onClick={() => {
                    setSymbolInput(coin);
                    handleStartAnalysis(coin);
                  }}
                  className={`text-xs px-2.5 py-0.5 rounded-lg font-mono transition-all ${
                    activeSymbol === coin
                      ? 'bg-rose-600 text-white font-bold shadow-2xs'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/60'
                  }`}
                >
                  {coin}
                </button>
              ))}
            </div>

            <div
              id="ws-status"
              className={`px-3 py-1 rounded-xl font-mono text-xs flex items-center gap-1.5 border transition-all ${
                connectionState === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                  : connectionState === 'connecting'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                  : connectionState === 'error'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                  : 'bg-stone-100 text-stone-600 border-stone-200'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${connectionState === 'connected' ? 'animate-pulse text-emerald-600' : ''}`} />
              <span>
                {connectionState === 'connected'
                  ? `Bağlı (${activeSymbol})`
                  : connectionState === 'connecting'
                  ? `Bağlanıyor (${symbolInput})...`
                  : connectionState === 'error'
                  ? 'Bağlantı Hatası!'
                  : 'Beklemede'}
              </span>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* TAB 1: ANALİZ SEKME İÇERİĞİ (Grafik, Divergence, Akış & Terminal) */}
        {/* ==================================================================== */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            
            {/* SMART MONEY DIVERGENCE RADAR */}
            <section className={`rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
              divergence.signal === 'ACCUMULATION' 
                ? 'bg-emerald-50/95 border-emerald-300 ring-2 ring-emerald-400/20' 
                : divergence.signal === 'DISTRIBUTION'
                ? 'bg-rose-50/95 border-rose-300 ring-2 ring-rose-400/20'
                : divergence.signal === 'BULL_MOMENTUM'
                ? 'bg-teal-50/95 border-teal-300'
                : divergence.signal === 'BEAR_MOMENTUM'
                ? 'bg-amber-50/95 border-amber-300'
                : 'bg-white/90 border-pink-200/80'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-5 h-5 ${
                      divergence.signal === 'ACCUMULATION' ? 'text-emerald-600' :
                      divergence.signal === 'DISTRIBUTION' ? 'text-rose-600' : 'text-stone-500'
                    }`} />
                    <h2 className="text-sm font-black tracking-tight text-stone-900">
                      {divergence.signalTitle}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-white/90 border border-stone-200">
                      Güven: %{divergence.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 font-medium">
                    {divergence.signalDesc}
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-stone-200 shadow-2xs">
                    <span className="text-stone-400 text-[10px] block">RETAIL (APTAL PARA) 1M</span>
                    <span className={`font-bold ${divergence.retailDelta1m >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {divergence.retailDelta1m >= 0 ? '+' : ''}${Math.round(divergence.retailDelta1m).toLocaleString()}
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-white/80 rounded-xl border border-stone-200 shadow-2xs">
                    <span className="text-stone-400 text-[10px] block">SMART (AKILLI PARA) 1M</span>
                    <span className={`font-bold text-sm ${divergence.smartDelta1m >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {divergence.smartDelta1m >= 0 ? '+' : ''}${Math.round(divergence.smartDelta1m).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* TOP 4 ACTIVE BUCKETS MINI SHOWCASE */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {bucketStatsList.slice(0, 4).map((b) => (
                <div key={b.id} className={`p-3.5 rounded-2xl border ${b.config.borderColor} ${b.config.bgColor} shadow-xs space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{b.config.icon}</span>
                    <span className="text-[10px] font-mono text-stone-400 bg-white/80 px-2 py-0.5 rounded-full">
                      {b.rolling1mCount} tx/dk
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-stone-900 truncate">{b.name}</h3>
                    <div className={`font-mono text-base font-black flex items-center gap-0.5 ${
                      b.rolling1mDelta > 0 ? 'text-emerald-600' : b.rolling1mDelta < 0 ? 'text-rose-600' : 'text-stone-500'
                    }`}>
                      {b.rolling1mDelta > 0 ? '+' : ''}${Math.round(b.rolling1mDelta).toLocaleString()}
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-rose-200/60 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 h-full" style={{ width: `${b.directionalBias}%` }}></div>
                    <div className="bg-rose-500 h-full" style={{ width: `${100 - b.directionalBias}%` }}></div>
                  </div>
                </div>
              ))}
            </section>

            {/* LIVE TRADES & TERMINAL SPLIT */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Canlı İşlem Ticker (7 Kolon) */}
              <div className="lg:col-span-7 bg-white/90 rounded-2xl p-4 sm:p-5 border border-pink-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-rose-500" />
                    <h2 className="text-sm font-bold text-stone-900">Canlı İşlem Akışı (Gerçek Stream)</h2>
                  </div>
                  <span className="text-xs text-stone-400 font-mono">Son 12 İşlem</span>
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
                            Henüz işlem akışı yok. Yukarıdan <strong>"BAŞLAT"</strong> tuşuna bas!
                          </td>
                        </tr>
                      ) : (
                        trades.slice(0, 12).map((t) => (
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
                                {t.isBuyerMaker ? 'SATICI MARKET' : 'ALICI MARKET'}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-stone-100 border border-stone-200 text-stone-800">
                                {t.bucketIcon} {t.bucketName}
                              </span>
                            </td>
                          </tr>
                        ))
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
                      <span>ÇEKİRDEK SİSTEM LOGLARI</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTerminalLogs([])}
                      className="text-[10px] text-stone-500 hover:text-stone-300"
                    >
                      Temizle
                    </button>
                  </div>

                  <div className="h-60 overflow-y-auto space-y-1.5 text-[11px] pt-2 scrollbar-thin">
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
                  <span>Binance Futures Stream</span>
                  <span className="text-emerald-500 font-bold">● AKTİF</span>
                </div>
              </div>

            </section>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: CÜZDANLAR SEKME İÇERİĞİ (Akıllı Sıralama & 20 Bucket Listesi) */}
        {/* ==================================================================== */}
        {activeTab === 'wallets' && (
          <div className="space-y-4">
            
            {/* SORTING BAR */}
            <div className="bg-white/90 rounded-2xl p-4 border border-pink-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-bold text-stone-900">
                  Hayali Cüzdan Segmentasyonu ({bucketStatsList.length} Kova)
                </h2>
              </div>

              {/* Sorting Pills */}
              <div className="flex items-center flex-wrap gap-1.5 text-xs">
                <span className="text-stone-400 font-medium mr-1 text-[11px]">Sırala:</span>
                {[
                  { id: 'activity', label: '⚡ En Aktifler' },
                  { id: 'delta_desc', label: '🟢 En Çok Alınanlar' },
                  { id: 'delta_asc', label: '🔴 En Çok Satılanlar' },
                  { id: 'volume', label: '📊 1m Hacim' },
                  { id: 'hierarchy', label: '🏛️ Min USDT' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortOption(s.id as SortOption)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                      sortOption === s.id
                        ? 'bg-rose-600 text-white font-bold shadow-2xs'
                        : 'bg-rose-50 hover:bg-rose-100 text-stone-700 border border-rose-200/70'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* BUCKET CARDS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {bucketStatsList.map((b, index) => {
                const isBull = b.directionalBias > 55;
                const isBear = b.directionalBias < 45;

                return (
                  <div
                    key={b.id}
                    className={`rounded-2xl p-4 border ${b.config.borderColor} ${b.config.bgColor} shadow-xs flex flex-col justify-between space-y-3 transition-all relative overflow-hidden`}
                  >
                    {/* Rank Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{b.config.icon}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-stone-900 leading-tight">{b.name}</h3>
                            {b.config.isSmartMoney && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-800 border border-purple-200">
                                SMART
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-stone-500">
                            ${b.config.minUsdt.toLocaleString()} - {b.config.maxUsdt > 100000000 ? '∞' : `$${b.config.maxUsdt.toLocaleString()}`}
                          </span>
                        </div>
                      </div>

                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                        isBull ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        isBear ? 'bg-rose-100 text-rose-800 border-rose-200' :
                        'bg-stone-100 text-stone-600 border-stone-200'
                      }`}>
                        {isBull ? 'LONG BIAS 🟢' : isBear ? 'SHORT BIAS 🔴' : 'NÖTR ⚪'}
                      </span>
                    </div>

                    {/* 1m Rolling Net Delta */}
                    <div className="p-2.5 rounded-xl bg-white/85 border border-pink-100 shadow-2xs">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-0.5">
                        <span>Son 1 Dakika Net Delta</span>
                        <span className="font-mono text-stone-600 font-bold">{b.rolling1mCount} işlem/dk</span>
                      </div>
                      <div className={`font-mono text-xl font-black flex items-center gap-1 ${
                        b.rolling1mDelta > 0 ? 'text-emerald-600' : b.rolling1mDelta < 0 ? 'text-rose-600' : 'text-stone-600'
                      }`}>
                        {b.rolling1mDelta > 0 ? <ArrowUpRight className="w-5 h-5 stroke-[3]" /> : b.rolling1mDelta < 0 ? <ArrowDownRight className="w-5 h-5 stroke-[3]" /> : null}
                        <span>{b.rolling1mDelta > 0 ? '+' : ''}${Math.round(b.rolling1mDelta).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Stats Breakdown */}
                    <div className="space-y-1 text-xs font-mono pt-1">
                      <div className="flex justify-between text-stone-500">
                        <span>Toplam Delta:</span>
                        <span className={`font-bold ${b.buyVol - b.sellVol >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {b.buyVol - b.sellVol >= 0 ? '+' : ''}${Math.round(b.buyVol - b.sellVol).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-stone-600">
                        <span>1m Alım Hacmi:</span>
                        <span className="font-semibold text-emerald-700">${Math.round(b.rolling1mBuyVol).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-stone-600">
                        <span>1m Satım Hacmi:</span>
                        <span className="font-semibold text-rose-700">${Math.round(b.rolling1mSellVol).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Agresyon & Yön Barı */}
                    <div className="pt-1">
                      <div className="flex justify-between text-[10px] font-mono font-bold mb-1">
                        <span className="text-emerald-700">Alıcı %{b.directionalBias}</span>
                        <span className="text-rose-700">Satıcı %{100 - b.directionalBias}</span>
                      </div>
                      <div className="w-full h-2 bg-rose-200/80 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${b.directionalBias}%` }}
                        ></div>
                        <div
                          className="bg-rose-500 h-full transition-all duration-300"
                          style={{ width: `${100 - b.directionalBias}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: AYARLAR SEKME İÇERİĞİ (Bucket Ekle, Sil, LocalStorage Yönet) */}
        {/* ==================================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            
            {/* BUCKET EKLEME FORMU KARTI */}
            <section className="bg-white/90 rounded-2xl p-5 border border-pink-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-rose-100">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-rose-600" />
                  <h2 className="text-sm font-bold text-stone-900">
                    Yeni Hayali Cüzdan Kovası Ekle
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingBucket(!isAddingBucket)}
                  className="text-xs px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition-all shadow-2xs"
                >
                  {isAddingBucket ? 'Formu Kapat' : '+ Yeni Kova Oluştur'}
                </button>
              </div>

              {isAddingBucket && (
                <form onSubmit={handleCreateBucket} className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-stone-600 block mb-1">Kova İsmi</label>
                      <input
                        type="text"
                        placeholder="Örn: Mega Balina"
                        value={newBucketForm.name}
                        onChange={(e) => setNewBucketForm({ ...newBucketForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-rose-50/50 border border-rose-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-400 focus:outline-hidden"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-stone-600 block mb-1">Min USDT</label>
                      <input
                        type="number"
                        min="0"
                        value={newBucketForm.minUsdt}
                        onChange={(e) => setNewBucketForm({ ...newBucketForm, minUsdt: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-rose-50/50 border border-rose-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-400 focus:outline-hidden"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-stone-600 block mb-1">Max USDT</label>
                      <input
                        type="number"
                        min="1"
                        value={newBucketForm.maxUsdt}
                        onChange={(e) => setNewBucketForm({ ...newBucketForm, maxUsdt: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-rose-50/50 border border-rose-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-400 focus:outline-hidden"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-stone-600 block mb-1">İkon (Emoji)</label>
                      <input
                        type="text"
                        value={newBucketForm.icon}
                        onChange={(e) => setNewBucketForm({ ...newBucketForm, icon: e.target.value })}
                        className="w-full px-3 py-2 bg-rose-50/50 border border-rose-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-rose-400 focus:outline-hidden"
                        maxLength={4}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-700">
                      <input
                        type="checkbox"
                        checked={newBucketForm.isSmartMoney}
                        onChange={(e) => setNewBucketForm({ ...newBucketForm, isSmartMoney: e.target.checked })}
                        className="w-4 h-4 rounded-md text-rose-600 focus:ring-rose-400"
                      />
                      <span>Bu grubu "Akıllı Para (Smart Money)" olarak işaretle</span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-rose-100">
                    <button
                      type="button"
                      onClick={() => setIsAddingBucket(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
                    >
                      İptal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                    >
                      Kovayı Kaydet ve Belleğe Çak
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* MEVCUT KOVALARIN LİSTESİ VE YÖNETİMİ */}
            <section className="bg-white/90 rounded-2xl p-5 border border-pink-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-rose-100">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-rose-600" />
                  <h2 className="text-sm font-bold text-stone-900">
                    Aktif Kovalar ({buckets.length} Adet - LocalStorage Kalıcı)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleResetBuckets}
                  className="flex items-center gap-1 text-xs text-rose-700 hover:text-rose-800 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg font-medium transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Varsayılanlara Sıfırla</span>
                </button>
              </div>

              <div className="divide-y divide-rose-100">
                {buckets.map((b) => (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl p-2 rounded-xl bg-stone-50 border border-stone-200/70">{b.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-stone-900">{b.name}</span>
                          {b.isSmartMoney && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-800 border border-purple-200">
                              Smart Money
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-stone-500">
                          Aralık: ${b.minUsdt.toLocaleString()} - {b.maxUsdt > 100000000 ? 'Sınırsız (∞)' : `$${b.maxUsdt.toLocaleString()}`}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteBucket(b.id, b.name)}
                      className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Kovayı Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}

      </div>

      {/* ==================================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR (FIXED BOTTOM BLUR) */}
      {/* ==================================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-t border-rose-200/80 shadow-lg px-4 py-2.5">
        <div className="max-w-md mx-auto grid grid-cols-3 gap-2">
          
          <button
            type="button"
            onClick={() => setActiveTab('analysis')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              activeTab === 'analysis'
                ? 'text-rose-600 bg-rose-50/80 font-bold'
                : 'text-stone-500 hover:text-stone-900 font-medium'
            }`}
          >
            <Activity className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] tracking-tight">Analiz</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallets')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all relative ${
              activeTab === 'wallets'
                ? 'text-rose-600 bg-rose-50/80 font-bold'
                : 'text-stone-500 hover:text-stone-900 font-medium'
            }`}
          >
            <Wallet className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] tracking-tight">Cüzdanlar</span>
            <span className="absolute top-1 right-6 w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              activeTab === 'settings'
                ? 'text-rose-600 bg-rose-50/80 font-bold'
                : 'text-stone-500 hover:text-stone-900 font-medium'
            }`}
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] tracking-tight">Ayarlar</span>
          </button>

        </div>
      </nav>

    </div>
  );
}

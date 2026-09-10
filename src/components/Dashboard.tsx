import React, { useState } from 'react';
import { 
  Activity, 
  ArrowDownRight, 
  ArrowUpRight, 
  ChevronDown, 
  ChevronUp, 
  Flame, 
  Layers, 
  ShieldAlert, 
  TrendingUp, 
  Zap 
} from 'lucide-react';
import { 
  BucketStats, 
  RecentTrade, 
  SmartMoneyDivergence, 
  TimeframeOption 
} from '../types';

interface DashboardProps {
  divergence: SmartMoneyDivergence;
  topBuckets: BucketStats[];
  recentTrades: RecentTrade[];
  activeTimeframe: TimeframeOption;
  onTimeframeChange: (tf: TimeframeOption) => void;
  maxTradesShown: number;
  activeSymbol: string;
  onNavigateToWallets: () => void;
}

// Standart Finansal Para Formatı: Asla "$-49.048" üretmez, "-$49,048" veya "+$12,450" üretir
const formatSignedUsd = (val: number): string => {
  if (val === 0 || isNaN(val)) return '$0';
  const isNeg = val < 0;
  return `${isNeg ? '-$' : '+$'}${Math.round(Math.abs(val)).toLocaleString('en-US')}`;
};

const formatPrice = (price: number): string => {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (price >= 0.01) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  return `$${price.toFixed(8)}`;
};

export const Dashboard: React.FC<DashboardProps> = ({
  divergence,
  topBuckets,
  recentTrades,
  activeTimeframe,
  onTimeframeChange,
  maxTradesShown,
  activeSymbol,
  onNavigateToWallets,
}) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const isAccumulation = divergence.signal === 'ACCUMULATION';
  const isDistribution = divergence.signal === 'DISTRIBUTION';
  const isBullMomentum = divergence.signal === 'BULL_MOMENTUM';
  const isBearMomentum = divergence.signal === 'BEAR_MOMENTUM';

  const buyerPct = typeof divergence.overallObi === 'number' 
    ? Math.round(Math.max(5, Math.min(95, 50 + (divergence.overallObi / 2))))
    : 50;

  return (
    <div className="space-y-3">
      
      {/* ==================================================================== */}
      {/* SMART MONEY DIVERGENCE RADARI (Ultra Kompakt Taktik HUD) */}
      {/* ==================================================================== */}
      <section className={`rounded-xl p-2 sm:p-3.5 border transition-all shadow-xs ${
        isAccumulation
          ? 'bg-emerald-50/95 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-400/20'
          : isDistribution
          ? 'bg-rose-50/95 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 ring-1 ring-rose-400/20'
          : isBullMomentum
          ? 'bg-teal-50/95 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700'
          : isBearMomentum
          ? 'bg-amber-50/95 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
          : 'bg-white/95 dark:bg-stone-900/90 border-pink-200/80 dark:border-stone-800'
      }`}>
        {/* Satır 1: Başlık, Güven, Timeframe Seçici & Detay Aç/Kapa */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldAlert className={`w-4 h-4 shrink-0 ${
              isAccumulation ? 'text-emerald-600 dark:text-emerald-400' :
              isDistribution ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'
            }`} />
            <h2 className="text-xs sm:text-sm font-black tracking-tight text-stone-900 dark:text-stone-100 truncate">
              {divergence.signalTitle}
            </h2>
            <span className="text-[10px] sm:text-xs px-1.5 py-0.2 rounded-md font-mono font-bold bg-white/90 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 shrink-0">
              %{divergence.confidence}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Timeframe Selector (Çok Kompakt) */}
            <div className="flex bg-rose-100/70 dark:bg-stone-800 p-0.5 rounded-lg border border-rose-200/80 dark:border-stone-700 text-[10px] font-bold">
              {(['1m', '5m', '15m'] as TimeframeOption[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-1.5 py-0.5 rounded-md transition-all cursor-pointer ${
                    activeTimeframe === tf
                      ? 'bg-rose-600 text-white shadow-2xs font-black'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Detay Göster / Gizle Butonu */}
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="p-1 rounded-lg text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 bg-white/80 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700 transition-all cursor-pointer"
              title={showDetails ? 'Özeti Küçült' : 'Detayları Göster'}
            >
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Satır 2: Kompakt Metrik Şeridi (RETAIL | SMART | OBI | Denge) */}
        <div className="mt-2 grid grid-cols-4 gap-1 sm:gap-2 font-mono text-center">
          <div className="p-1 sm:p-1.5 bg-white/90 dark:bg-stone-800/90 rounded-lg border border-stone-200/80 dark:border-stone-700/80 shadow-2xs flex flex-col justify-center">
            <span className="text-stone-400 dark:text-stone-500 text-[8px] uppercase font-sans truncate">RETAIL</span>
            <span className={`font-bold text-[11px] sm:text-xs truncate ${divergence.retailDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatSignedUsd(divergence.retailDelta)}
            </span>
          </div>

          <div className="p-1 sm:p-1.5 bg-white/90 dark:bg-stone-800/90 rounded-lg border border-stone-200/80 dark:border-stone-700/80 shadow-2xs flex flex-col justify-center">
            <span className="text-stone-400 dark:text-stone-500 text-[8px] uppercase font-sans truncate">SMART</span>
            <span className={`font-bold text-[11px] sm:text-xs truncate ${divergence.smartDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatSignedUsd(divergence.smartDelta)}
            </span>
          </div>

          <div className="p-1 sm:p-1.5 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 rounded-lg shadow-2xs flex flex-col justify-center">
            <span className="text-stone-400 dark:text-stone-500 text-[8px] uppercase font-sans truncate">OBI</span>
            <span className={`font-bold text-[11px] sm:text-xs truncate ${
              (divergence.overallObi ?? 0) > 10 ? 'text-emerald-400 dark:text-emerald-600' :
              (divergence.overallObi ?? 0) < -10 ? 'text-rose-400 dark:text-rose-600' : 'text-stone-300 dark:text-stone-700'
            }`}>
              {(divergence.overallObi ?? 0) > 0 ? '+' : ''}{divergence.overallObi ?? 0}%
            </span>
          </div>

          <div className="p-1 sm:p-1.5 bg-white/90 dark:bg-stone-800/90 rounded-lg border border-stone-200/80 dark:border-stone-700/80 shadow-2xs flex flex-col justify-center">
            <span className="text-stone-400 dark:text-stone-500 text-[8px] uppercase font-sans truncate">DENGE</span>
            <span className="font-bold text-[10px] sm:text-xs truncate flex items-center justify-center gap-0.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${(divergence.overallObi ?? 0) > 0 ? 'bg-emerald-500' : (divergence.overallObi ?? 0) < 0 ? 'bg-rose-500' : 'bg-stone-400'}`} />
              <span className="truncate">{buyerPct}% Alıcı</span>
            </span>
          </div>
        </div>

        {/* İsteğe Bağlı Detay Alanı (Kullanıcı açtığında genişler) */}
        {showDetails && (
          <div className="mt-2.5 pt-2 border-t border-stone-200/60 dark:border-stone-800/80 space-y-2 animate-in fade-in duration-150">
            <p className="text-[11px] sm:text-xs text-stone-600 dark:text-stone-300 font-medium">
              {divergence.signalDesc}
            </p>

            {/* OBI Bar */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[9px] font-mono font-bold text-stone-500 dark:text-stone-400 whitespace-nowrap">
                Emir Akışı:
              </span>
              <div className="flex-1 h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden flex relative">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${buyerPct}%` }}
                />
                <div 
                  className="bg-rose-500 h-full transition-all duration-300"
                  style={{ width: `${100 - buyerPct}%` }}
                />
              </div>
              <span className="text-[9px] font-mono font-black text-stone-700 dark:text-stone-300">
                {(divergence.overallObi ?? 0) > 0 ? 'Alıcı Hakim' : (divergence.overallObi ?? 0) < 0 ? 'Satıcı Hakim' : 'Nötr'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* EN AKTİF KOVALAR KISA ÖZETİ (TOP ACTIVE BUCKETS MINI-SHOWCASE) */}
      {/* ==================================================================== */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
              En Aktif Kovalar ({activeTimeframe})
            </h3>
          </div>
          <button
            type="button"
            onClick={onNavigateToWallets}
            className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline flex items-center gap-1"
          >
            <span>Tümünü Gör ({topBuckets.length})</span>
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {topBuckets.slice(0, 4).map((b) => {
            const delta = b.rollingDelta ?? 0;
            const bias = b.directionalBias ?? 50;
            return (
              <div
                key={b.id}
                className="p-3 rounded-2xl border border-rose-200/80 dark:border-stone-800 bg-white/95 dark:bg-stone-900 shadow-xs space-y-1.5 bucket-card hover:border-rose-300 dark:hover:border-rose-800"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-xl">{b.icon}</span>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{b.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-md">
                    {b.rollingCount || 0} tx
                  </span>
                </div>

                <div>
                  <div className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">Net Delta ({activeTimeframe})</div>
                  <div className={`font-mono text-base font-black flex items-center gap-0.5 ${
                    delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : delta < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500'
                  }`}>
                    {delta > 0 ? <ArrowUpRight className="w-4 h-4 stroke-[3]" /> : delta < 0 ? <ArrowDownRight className="w-4 h-4 stroke-[3]" /> : null}
                    <span>{formatSignedUsd(delta)}</span>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-rose-200/60 dark:bg-stone-800 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${bias}%` }} />
                  <div className="bg-rose-500 h-full" style={{ width: `${100 - bias}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* CANLI İŞLEM AKIŞI (LIVE STREAM TICKER) */}
      {/* ==================================================================== */}
      <section className="bg-white/95 dark:bg-stone-900 rounded-2xl p-4 sm:p-5 border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <Activity className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Canlı İşlem Akışı ({activeSymbol || 'Binance Stream'})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Canlı Akış
            </span>
            <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">
              Son {recentTrades.slice(0, maxTradesShown).length} İşlem
            </span>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1 sm:mx-0">
          <table className="w-full text-left text-xs font-mono min-w-[500px]">
            <thead>
              <tr className="border-b border-rose-100 dark:border-stone-800 text-stone-400 dark:text-stone-500">
                <th className="pb-2 font-medium">Zaman</th>
                <th className="pb-2 font-medium">Fiyat</th>
                <th className="pb-2 font-medium">Değer (USDT)</th>
                <th className="pb-2 font-medium">İşlem Tarafı</th>
                <th className="pb-2 font-medium text-right">Eşleşen Kova</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50 dark:divide-stone-800/60">
              {recentTrades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-400 dark:text-stone-500 font-sans">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs font-medium">Binance Futures gerçek emir akışına bağlanılıyor...</p>
                    </div>
                  </td>
                </tr>
              ) : (
                recentTrades.slice(0, maxTradesShown).map((t, idx) => {
                  const isWhale = t.notional >= 50000;
                  const isLeviathan = t.notional >= 250000;
                  return (
                    <tr 
                      key={`${t.id}_${t.time}_${idx}`} 
                      className={`transition-colors ${
                        isLeviathan 
                          ? 'bg-amber-100/50 dark:bg-amber-950/40 border-l-2 border-amber-500 font-bold' 
                          : isWhale
                          ? 'bg-rose-50/60 dark:bg-stone-800/60 border-l-2 border-rose-500'
                          : 'hover:bg-rose-50/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <td className="py-2 text-stone-500 dark:text-stone-400">{new Date(t.time).toLocaleTimeString()}</td>
                      <td className={`py-2 font-semibold ${t.isBuyerMaker ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatPrice(t.price)}
                      </td>
                      <td className="py-2 font-bold text-stone-800 dark:text-stone-200">
                        ${Math.round(t.notional).toLocaleString()}
                        {isLeviathan && <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-black">🔥 BLOK</span>}
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          t.isBuyerMaker 
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' 
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {t.isBuyerMaker ? 'SATICI MARKET' : 'ALICI MARKET'}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          isLeviathan
                            ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                            : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200'
                        }`}>
                          {t.bucketIcon} {t.bucketName}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
};

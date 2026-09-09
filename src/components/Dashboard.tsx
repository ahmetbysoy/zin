import React from 'react';
import { 
  Activity, 
  ArrowDownRight, 
  ArrowUpRight, 
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

const formatPrice = (price: number): string => {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (price >= 0.01) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
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
  const isAccumulation = divergence.signal === 'ACCUMULATION';
  const isDistribution = divergence.signal === 'DISTRIBUTION';
  const isBullMomentum = divergence.signal === 'BULL_MOMENTUM';
  const isBearMomentum = divergence.signal === 'BEAR_MOMENTUM';

  return (
    <div className="space-y-4">
      
      {/* ==================================================================== */}
      {/* SMART MONEY DIVERGENCE RADARI (Multi-Timeframe 1m/5m/15m) */}
      {/* ==================================================================== */}
      <section className={`rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
        isAccumulation
          ? 'bg-emerald-50/95 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-400/20'
          : isDistribution
          ? 'bg-rose-50/95 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 ring-2 ring-rose-400/20'
          : isBullMomentum
          ? 'bg-teal-50/95 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700'
          : isBearMomentum
          ? 'bg-amber-50/95 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
          : 'bg-white/95 dark:bg-stone-900/90 border-pink-200/80 dark:border-stone-800'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center flex-wrap gap-2">
              <ShieldAlert className={`w-5 h-5 ${
                isAccumulation ? 'text-emerald-600 dark:text-emerald-400' :
                isDistribution ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'
              }`} />
              <h2 className="text-sm sm:text-base font-black tracking-tight text-stone-900 dark:text-stone-100">
                {divergence.signalTitle}
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-white/90 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
                Güven: %{divergence.confidence}
              </span>
            </div>

            <p className="text-xs text-stone-600 dark:text-stone-300 font-medium max-w-2xl">
              {divergence.signalDesc}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
            {/* Timeframe Selector */}
            <div className="flex bg-rose-100/70 dark:bg-stone-800 p-1 rounded-xl border border-rose-200/80 dark:border-stone-700 text-xs font-bold">
              {(['1m', '5m', '15m'] as TimeframeOption[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeTimeframe === tf
                      ? 'bg-rose-600 text-white shadow-2xs font-black'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Delta & OBI Badges */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <div className="px-3 py-1.5 bg-white/90 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xs">
                <span className="text-stone-400 dark:text-stone-500 text-[9px] block uppercase font-sans">RETAIL DELTA ({activeTimeframe})</span>
                <span className={`font-bold ${divergence.retailDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {divergence.retailDelta >= 0 ? '+' : ''}${Math.round(divergence.retailDelta).toLocaleString()}
                </span>
              </div>
              <div className="px-3 py-1.5 bg-white/90 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xs">
                <span className="text-stone-400 dark:text-stone-500 text-[9px] block uppercase font-sans">SMART DELTA ({activeTimeframe})</span>
                <span className={`font-bold text-sm ${divergence.smartDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {divergence.smartDelta >= 0 ? '+' : ''}${Math.round(divergence.smartDelta).toLocaleString()}
                </span>
              </div>

              {/* OBI DENGESİZLİK SKORU */}
              {typeof divergence.overallObi === 'number' && (
                <div className="px-3 py-1.5 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 rounded-xl shadow-2xs">
                  <span className="text-stone-400 dark:text-stone-500 text-[9px] block uppercase font-sans">OBI (IMBALANCE)</span>
                  <span className={`font-bold text-sm ${
                    divergence.overallObi > 10 ? 'text-emerald-400 dark:text-emerald-600' :
                    divergence.overallObi < -10 ? 'text-rose-400 dark:text-rose-600' : 'text-stone-300 dark:text-stone-700'
                  }`}>
                    {divergence.overallObi > 0 ? '+' : ''}{divergence.overallObi}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canlı OBI İlerleme Çubuğu */}
        {typeof divergence.overallObi === 'number' && (
          <div className="mt-3 pt-2.5 border-t border-stone-200/60 dark:border-stone-800/80 flex items-center gap-3">
            <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-stone-400 whitespace-nowrap">
              Emir Akışı Dengesi (Alış vs Satış):
            </span>
            <div className="flex-1 h-2 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden flex relative">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${Math.max(5, Math.min(95, 50 + (divergence.overallObi / 2)))}%` }}
                title={`Alıcı Ağırlığı: %${Math.round(50 + (divergence.overallObi / 2))}`}
              />
              <div 
                className="bg-rose-500 h-full transition-all duration-300"
                style={{ width: `${Math.max(5, Math.min(95, 50 - (divergence.overallObi / 2)))}%` }}
                title={`Satıcı Ağırlığı: %${Math.round(50 - (divergence.overallObi / 2))}`}
              />
            </div>
            <span className="text-[10px] font-mono font-black text-stone-700 dark:text-stone-300">
              {divergence.overallObi > 0 ? '🟢 Alıcı Hakim' : divergence.overallObi < 0 ? '🔴 Satıcı Hakim' : '⚖️ Nötr'}
            </span>
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
                    <span>{delta > 0 ? '+' : ''}${Math.round(delta).toLocaleString()}</span>
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

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
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
                recentTrades.slice(0, maxTradesShown).map((t) => {
                  const isWhale = t.notional >= 50000;
                  const isLeviathan = t.notional >= 250000;
                  return (
                    <tr 
                      key={t.id} 
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

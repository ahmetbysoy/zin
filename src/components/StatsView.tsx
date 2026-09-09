import React from 'react';
import { 
  BarChart3, 
  GitCompare, 
  PieChart, 
  Scale, 
  ShieldCheck, 
  TrendingDown, 
  TrendingUp, 
  Zap 
} from 'lucide-react';
import { BucketManager } from '../engine';
import { SmartMoneyDivergence, TimeframeOption } from '../types';

interface StatsViewProps {
  bucketManager: BucketManager;
  activeSymbol: string;
}

export const StatsView: React.FC<StatsViewProps> = ({
  bucketManager,
  activeSymbol,
}) => {
  const timeframes: TimeframeOption[] = ['1m', '5m', '15m'];
  const now = Date.now();

  const divergenceReports = timeframes.map((tf) => ({
    tf,
    div: bucketManager.getSmartMoneyDivergence(tf, now),
  }));

  // Kategori bazlı kümülatif hacimler
  const allBuckets = bucketManager.getAllBucketsSorted('hierarchy', '5m', now);

  const smartBuckets = allBuckets.filter((b) => b.isSmartMoney);
  const retailBuckets = allBuckets.filter((b) => !b.isSmartMoney);

  const totalSmartVol = smartBuckets.reduce((sum, b) => sum + (b.rollingBuyVol ?? 0) + (b.rollingSellVol ?? 0), 0);
  const totalRetailVol = retailBuckets.reduce((sum, b) => sum + (b.rollingBuyVol ?? 0) + (b.rollingSellVol ?? 0), 0);
  const combinedVol = Math.max(1, totalSmartVol + totalRetailVol);

  const smartRatio = Math.round((totalSmartVol / combinedVol) * 100);
  const retailRatio = 100 - smartRatio;

  const totalSmartDelta = smartBuckets.reduce((sum, b) => sum + (b.rollingDelta ?? 0), 0);
  const totalRetailDelta = retailBuckets.reduce((sum, b) => sum + (b.rollingDelta ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white/95 dark:bg-stone-900 p-4 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-rose-500" />
          <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
            Multi-Timeframe Akıllı Para Matrisi ({activeSymbol || 'BTCUSDT'})
          </h2>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
          1 dakikalık, 5 dakikalık ve 15 dakikalık pencerelerde gerçek zamanlı Akıllı Para vs Retail ayrışması
        </p>
      </div>

      {/* Multi-Timeframe Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {divergenceReports.map(({ tf, div }) => {
          const isAcc = div.signal === 'ACCUMULATION';
          const isDist = div.signal === 'DISTRIBUTION';
          const isBull = div.signal === 'BULL_MOMENTUM';
          const isBear = div.signal === 'BEAR_MOMENTUM';

          return (
            <div
              key={tf}
              className={`p-4 rounded-2xl border transition-all ${
                isAcc
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                  : isDist
                  ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                  : isBull
                  ? 'bg-teal-50/90 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800'
                  : isBear
                  ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                  : 'bg-white/95 dark:bg-stone-900 border-pink-200/80 dark:border-stone-800'
              }`}
            >
              <div className="flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800 pb-2.5 mb-2.5">
                <span className="font-mono text-sm font-black px-2.5 py-0.5 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                  {tf.toUpperCase()} PENCERE
                </span>
                <span className="text-xs font-mono font-bold text-stone-600 dark:text-stone-300">
                  Güven: %{div.confidence}
                </span>
              </div>

              <div className="space-y-2">
                <div className="font-black text-sm text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  {isAcc || isBull ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-rose-600" />}
                  <span>{div.signal}</span>
                </div>

                <div className="space-y-1 font-mono text-xs pt-1">
                  <div className="flex justify-between">
                    <span className="text-stone-500 dark:text-stone-400">Retail Delta:</span>
                    <span className={`font-bold ${div.retailDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {div.retailDelta >= 0 ? '+' : ''}${Math.round(div.retailDelta).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 dark:text-stone-400">Smart Delta:</span>
                    <span className={`font-bold ${div.smartDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {div.smartDelta >= 0 ? '+' : ''}${Math.round(div.smartDelta).toLocaleString()}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-stone-600 dark:text-stone-300 pt-1 leading-relaxed border-t border-stone-200/60 dark:border-stone-800">
                  {div.signalDesc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dominance Ratio & Volume Split Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        
        {/* Smart Money vs Retail Hacim Oranı */}
        <div className="p-4 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Hacim Hakimiyeti (Smart vs Retail)
            </h3>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono font-bold">
              <span className="text-amber-600 dark:text-amber-400">Smart Money: %{smartRatio}</span>
              <span className="text-stone-500 dark:text-stone-400">Retail: %{retailRatio}</span>
            </div>

            <div className="w-full h-3 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex">
              <div
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${smartRatio}%` }}
              />
              <div
                className="bg-stone-400 h-full transition-all duration-300"
                style={{ width: `${retailRatio}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-stone-400 pt-1">
              <span>Toplam Smart: ${Math.round(totalSmartVol).toLocaleString()}</span>
              <span>Toplam Retail: ${Math.round(totalRetailVol).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Net Delta Dengesi */}
        <div className="p-4 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Kümülatif Net Delta Karşılaştırması
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
              <div className="text-[10px] uppercase font-sans text-amber-800 dark:text-amber-300 font-bold">
                Smart Money Net Delta
              </div>
              <div className={`text-base font-black mt-1 ${totalSmartDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalSmartDelta >= 0 ? '+' : ''}${Math.round(totalSmartDelta).toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-stone-50 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700">
              <div className="text-[10px] uppercase font-sans text-stone-600 dark:text-stone-400 font-bold">
                Retail Net Delta
              </div>
              <div className={`text-base font-black mt-1 ${totalRetailDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalRetailDelta >= 0 ? '+' : ''}${Math.round(totalRetailDelta).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

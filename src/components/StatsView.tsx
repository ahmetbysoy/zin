import React, { useState } from 'react';
import { 
  BarChart3, 
  Download, 
  Flame, 
  GitCompare, 
  Layers, 
  Percent, 
  Scale, 
  TrendingDown, 
  TrendingUp, 
  Zap 
} from 'lucide-react';
import { BucketManager } from '../engine';
import { TimeframeOption } from '../types';

interface StatsViewProps {
  bucketManager: BucketManager;
  activeSymbol: string;
}

export const StatsView: React.FC<StatsViewProps> = ({
  bucketManager,
  activeSymbol,
}) => {
  const [exportNotice, setExportNotice] = useState(false);
  const timeframes: TimeframeOption[] = ['1m', '5m', '15m'];
  const now = Date.now();

  const divergenceReports = timeframes.map((tf) => ({
    tf,
    div: bucketManager.getSmartMoneyDivergence(tf, now),
  }));

  // Kategori bazlı kümülatif hacimler (5m penceresi)
  const allBuckets5m = bucketManager.getAllBucketsSorted('hierarchy', '5m', now);
  const smartBuckets5m = allBuckets5m.filter((b) => b.isSmartMoney);
  const retailBuckets5m = allBuckets5m.filter((b) => !b.isSmartMoney);

  const totalSmartBuy = smartBuckets5m.reduce((sum, b) => sum + (b.rollingBuyVol ?? 0), 0);
  const totalSmartSell = smartBuckets5m.reduce((sum, b) => sum + (b.rollingSellVol ?? 0), 0);
  const totalSmartVol = totalSmartBuy + totalSmartSell;

  const totalRetailBuy = retailBuckets5m.reduce((sum, b) => sum + (b.rollingBuyVol ?? 0), 0);
  const totalRetailSell = retailBuckets5m.reduce((sum, b) => sum + (b.rollingSellVol ?? 0), 0);
  const totalRetailVol = totalRetailBuy + totalRetailSell;

  const combinedVol = Math.max(1, totalSmartVol + totalRetailVol);
  const smartRatio = Math.round((totalSmartVol / combinedVol) * 100);
  const retailRatio = 100 - smartRatio;

  const totalSmartDelta = totalSmartBuy - totalSmartSell;
  const totalRetailDelta = totalRetailBuy - totalRetailSell;

  // Order Flow Imbalance (OBI) Hesaplaması: (Buy - Sell) / (Buy + Sell)
  const smartOBI = totalSmartVol > 0 ? Math.round((totalSmartDelta / totalSmartVol) * 100) : 0;
  const retailOBI = totalRetailVol > 0 ? Math.round((totalRetailDelta / totalRetailVol) * 100) : 0;
  const overallOBI = combinedVol > 0 ? Math.round(((totalSmartDelta + totalRetailDelta) / combinedVol) * 100) : 0;

  // CSV Dışa Aktarma
  const handleExportCSV = () => {
    const buckets1m = bucketManager.getAllBucketsSorted('hierarchy', '1m', now);
    const buckets5m = bucketManager.getAllBucketsSorted('hierarchy', '5m', now);
    const buckets15m = bucketManager.getAllBucketsSorted('hierarchy', '15m', now);

    const headers = [
      'Kova ID',
      'Kova Adi',
      'Tur',
      'Min USDT',
      'Max USDT',
      '1m Delta (USDT)',
      '1m Hacim (USDT)',
      '1m Islem Adedi',
      '5m Delta (USDT)',
      '5m Hacim (USDT)',
      '5m Islem Adedi',
      '15m Delta (USDT)',
      '15m Hacim (USDT)',
      '15m Islem Adedi',
    ];

    const rows = buckets1m.map((b1) => {
      const b5 = buckets5m.find((x) => x.id === b1.id) || b1;
      const b15 = buckets15m.find((x) => x.id === b1.id) || b1;

      return [
        `"${b1.id}"`,
        `"${b1.name.replace(/"/g, '""')}"`,
        b1.isSmartMoney ? '"Smart Money"' : '"Retail"',
        b1.minValue ?? 0,
        b1.maxValue ?? 0,
        Math.round(b1.rollingDelta ?? 0),
        Math.round((b1.rollingBuyVol ?? 0) + (b1.rollingSellVol ?? 0)),
        b1.rollingCount ?? 0,
        Math.round(b5.rollingDelta ?? 0),
        Math.round((b5.rollingBuyVol ?? 0) + (b5.rollingSellVol ?? 0)),
        b5.rollingCount ?? 0,
        Math.round(b15.rollingDelta ?? 0),
        Math.round((b15.rollingBuyVol ?? 0) + (b15.rollingSellVol ?? 0)),
        b15.rollingCount ?? 0,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `kara_para_${activeSymbol || 'BTCUSDT'}_${new Date().toISOString().slice(0, 19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice(true);
    setTimeout(() => setExportNotice(false), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Header & CSV Export */}
      <div className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-rose-500" />
            <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
              Multi-Timeframe Akıllı Para Matrisi ({activeSymbol || 'BTCUSDT'})
            </h2>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            1m, 5m ve 15m pencerelerinde mikro-akış ayrışması ve Order Flow Imbalance (OBI)
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="px-3.5 py-2 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-stone-800 dark:hover:bg-stone-200 shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5 text-rose-400 dark:text-rose-600" />
          <span>{exportNotice ? 'CSV İndirildi!' : 'Matrisi CSV İndir'}</span>
        </button>
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
              className={`p-4 rounded-2xl border transition-all shadow-xs ${
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

      {/* OBI (Order Flow Imbalance) & Dominance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Smart Money OBI */}
        <div className="p-4 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Smart Money OBI</span>
            <span className={`text-xs font-mono font-black ${smartOBI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {smartOBI >= 0 ? '+' : ''}{smartOBI}%
            </span>
          </div>
          <div className="w-full h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${Math.max(0, (smartOBI + 100) / 2)}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${Math.max(0, (100 - smartOBI) / 2)}%` }} />
          </div>
          <p className="text-[10px] text-stone-500 font-mono">
            Balina & Leviathan net emir dengesizliği (5m)
          </p>
        </div>

        {/* Retail OBI */}
        <div className="p-4 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Retail OBI</span>
            <span className={`text-xs font-mono font-black ${retailOBI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {retailOBI >= 0 ? '+' : ''}{retailOBI}%
            </span>
          </div>
          <div className="w-full h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${Math.max(0, (retailOBI + 100) / 2)}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${Math.max(0, (100 - retailOBI) / 2)}%` }} />
          </div>
          <p className="text-[10px] text-stone-500 font-mono">
            Karides ve küçük yatırımcı net emir dengesizliği (5m)
          </p>
        </div>

        {/* Overall Market Imbalance */}
        <div className="p-4 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Toplam Piyasa İmbilansı</span>
            <span className={`text-xs font-mono font-black ${overallOBI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {overallOBI >= 0 ? '+' : ''}{overallOBI}%
            </span>
          </div>
          <div className="w-full h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${Math.max(0, (overallOBI + 100) / 2)}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${Math.max(0, (100 - overallOBI) / 2)}%` }} />
          </div>
          <p className="text-[10px] text-stone-500 font-mono">
            Tahtadaki tüm hacim üzerinde alıcı / satıcı net baskısı
          </p>
        </div>
      </div>

      {/* Dominance Ratio & Net Delta Cards */}
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

      {/* Multi-Timeframe Kova Matrisi Tablosu */}
      <div className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Kova Bazında Multi-Timeframe Delta & Hacim Matrisi
          </h3>
        </div>

        <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 sticky top-0 z-10">
              <tr>
                <th className="p-2.5">Kova Adı</th>
                <th className="p-2.5">Tür</th>
                <th className="p-2.5">1m Delta</th>
                <th className="p-2.5">5m Delta</th>
                <th className="p-2.5">15m Delta</th>
                <th className="p-2.5 text-right">5m Hacim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {allBuckets5m.map((b5) => {
                const b1 = bucketManager.getAllBucketsSorted('hierarchy', '1m', now).find((x) => x.id === b5.id) || b5;
                const b15 = bucketManager.getAllBucketsSorted('hierarchy', '15m', now).find((x) => x.id === b5.id) || b5;
                const d1 = b1.rollingDelta ?? 0;
                const d5 = b5.rollingDelta ?? 0;
                const d15 = b15.rollingDelta ?? 0;
                const vol5 = (b5.rollingBuyVol ?? 0) + (b5.rollingSellVol ?? 0);

                return (
                  <tr key={b5.id} className="hover:bg-rose-50/40 dark:hover:bg-stone-800/40 transition-colors">
                    <td className="p-2.5 font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                      <span>{b5.icon}</span>
                      <span>{b5.name}</span>
                    </td>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        b5.isSmartMoney
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                      }`}>
                        {b5.isSmartMoney ? 'Smart' : 'Retail'}
                      </span>
                    </td>
                    <td className={`p-2.5 font-bold ${d1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {d1 >= 0 ? '+' : ''}${Math.round(d1).toLocaleString()}
                    </td>
                    <td className={`p-2.5 font-bold ${d5 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {d5 >= 0 ? '+' : ''}${Math.round(d5).toLocaleString()}
                    </td>
                    <td className={`p-2.5 font-bold ${d15 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {d15 >= 0 ? '+' : ''}${Math.round(d15).toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-medium text-stone-600 dark:text-stone-400">
                      ${Math.round(vol5).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

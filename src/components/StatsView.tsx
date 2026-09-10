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
  Zap,
  Clock,
  Activity
} from 'lucide-react';
import { BucketManager } from '../engine';
import { TimeframeOption } from '../types';

interface StatsViewProps {
  bucketManager: BucketManager;
  activeSymbol: string;
}

// Standart Finansal Para Formatı: Asla "$-49.048" basmaz! Doğrusu: "-$49,048" ve "+$12,450"
export const formatSignedUsd = (val: number): string => {
  if (val === 0 || isNaN(val)) return '$0';
  const isNeg = val < 0;
  const abs = Math.round(Math.abs(val)).toLocaleString('en-US');
  return `${isNeg ? '-$' : '+$'}${abs}`;
};

export const formatCompactSignedUsd = (val: number): string => {
  if (val === 0 || isNaN(val)) return '$0';
  const isNeg = val < 0;
  const sign = isNeg ? '-$' : '+$';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}M`;
  }
  if (abs >= 1_000) {
    const formatted = (abs / 1_000).toFixed(0);
    return `${sign}${formatted}K`;
  }
  return `${sign}${Math.round(abs)}`;
};

export const formatUsd = (val: number): string => {
  if (isNaN(val)) return '$0';
  return `$${Math.round(Math.abs(val)).toLocaleString('en-US')}`;
};

const getSignalLabel = (signal: string): { label: string; short: string } => {
  switch (signal) {
    case 'ACCUMULATION':
      return { label: 'Akıllı Para Toplama', short: 'Toplama' };
    case 'DISTRIBUTION':
      return { label: 'Akıllı Para Boşaltma', short: 'Boşaltma' };
    case 'BULL_MOMENTUM':
      return { label: 'Boğa Akışı', short: 'Boğa' };
    case 'BEAR_MOMENTUM':
      return { label: 'Ayı Akışı', short: 'Ayı' };
    default:
      return { label: 'Nötr Akış', short: 'Nötr' };
  }
};

export const StatsView: React.FC<StatsViewProps> = ({
  bucketManager,
  activeSymbol,
}) => {
  const [exportNotice, setExportNotice] = useState(false);
  const timeframes: TimeframeOption[] = ['1m', '5m', '15m'];
  const now = Date.now();

  // Veri doluluk oranını hesapla (Pencere Isınma İlerlemesi)
  const oldestTradeTime = bucketManager.rollingTrades.length > 0 
    ? bucketManager.rollingTrades[0].time 
    : now;
  const availableHistoryMs = Math.max(0, now - oldestTradeTime);

  const getWindowCoverage = (tf: TimeframeOption): { percent: number; isReady: boolean; text: string } => {
    // REST Kline & AggTrade Bootstrap varsa doğrudan Canlı kabul et
    if (bucketManager.hasHistory(tf)) {
      return { percent: 100, isReady: true, text: 'Canlı' };
    }
    const targetMs = tf === '15m' ? 900_000 : tf === '5m' ? 300_000 : 60_000;
    const ratio = Math.min(1, availableHistoryMs / targetMs);
    const percent = Math.round(ratio * 100);
    const isReady = percent >= 95;
    const text = isReady ? 'Canlı' : `Isınıyor %${percent}`;
    return { percent, isReady, text };
  };

  const divergenceReports = timeframes.map((tf) => ({
    tf,
    coverage: getWindowCoverage(tf),
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

  // Order Flow Imbalance (OBI): (Buy - Sell) / (Buy + Sell)
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
    <div className="space-y-2.5 sm:space-y-3">
      {/* Minimal Üst Başlık & Parite Göstergesi */}
      <div className="flex items-center justify-between px-1 py-0.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-rose-500 shrink-0" />
          <h2 className="text-xs sm:text-sm font-black tracking-tight text-stone-900 dark:text-stone-100">
            Multi-Timeframe Akıllı Para Matrisi ({activeSymbol || 'BTCUSDT'})
          </h2>
        </div>
        <span className="text-[10px] font-mono text-stone-400">
          1m • 5m • 15m Mikro-Akış & OBI
        </span>
      </div>

      {/* Multi-Timeframe Minimalist Kartlar (3'lü Yan Yana, Sıfır Kaydırma) */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
        {divergenceReports.map(({ tf, coverage, div }) => {
          const isAcc = div.signal === 'ACCUMULATION';
          const isDist = div.signal === 'DISTRIBUTION';
          const isBull = div.signal === 'BULL_MOMENTUM';
          const isBear = div.signal === 'BEAR_MOMENTUM';
          const sig = getSignalLabel(div.signal);

          return (
            <div
              key={tf}
              className={`p-2 sm:p-3 rounded-xl border transition-all shadow-2xs flex flex-col justify-between ${
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
              {/* Başlık & Durum */}
              <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-stone-200/60 dark:border-stone-800/80">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] sm:text-xs font-black px-1.5 py-0.5 rounded bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                    {tf.toUpperCase()}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${
                      coverage.isReady
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                    }`}
                  >
                    {coverage.isReady ? 'Canlı' : `%${coverage.percent}`}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-stone-400">
                  %{div.confidence}
                </span>
              </div>

              {/* Sinyal Rozeti */}
              <div className="py-1.5 flex items-center gap-1 font-black text-[11px] sm:text-xs truncate text-stone-900 dark:text-stone-100">
                {isAcc || isBull ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                )}
                <span className="truncate sm:hidden">{sig.short}</span>
                <span className="truncate hidden sm:inline">{sig.label}</span>
              </div>

              {/* Delta Satırları (Sıkışık & Okunabilir) */}
              <div className="pt-1 border-t border-stone-200/60 dark:border-stone-800/80 font-mono text-[10px] sm:text-xs space-y-0.5">
                <div
                  className="flex justify-between items-center"
                  title={`Smart Delta: ${formatSignedUsd(div.smartDelta)}`}
                >
                  <span className="text-stone-500 dark:text-stone-400">Smart:</span>
                  <span
                    className={`font-bold text-right ${
                      div.smartDelta >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatCompactSignedUsd(div.smartDelta)}
                  </span>
                </div>
                <div
                  className="flex justify-between items-center"
                  title={`Retail Delta: ${formatSignedUsd(div.retailDelta)}`}
                >
                  <span className="text-stone-500 dark:text-stone-400">Retail:</span>
                  <span
                    className={`font-bold text-right ${
                      div.retailDelta >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatCompactSignedUsd(div.retailDelta)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* OBI (Order Flow Imbalance) Bipolar Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Smart Money OBI */}
        <div className="p-3 sm:p-3.5 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Smart Money OBI</span>
            <span className={`text-xs font-mono font-black ${smartOBI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {smartOBI >= 0 ? '+' : ''}{smartOBI}%
            </span>
          </div>
          {/* Bipolar Gauge */}
          <div className="relative w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex items-center">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-400/80 dark:bg-stone-500 z-10" />
            <div className="w-1/2 h-full flex justify-end">
              {smartOBI < 0 && (
                <div
                  className="h-full bg-rose-500 transition-all duration-300 rounded-l-xs"
                  style={{ width: `${Math.min(100, Math.abs(smartOBI))}%` }}
                />
              )}
            </div>
            <div className="w-1/2 h-full flex justify-start">
              {smartOBI > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-r-xs"
                  style={{ width: `${Math.min(100, smartOBI)}%` }}
                />
              )}
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-stone-400">
            <span>Satıcı Baskısı</span>
            <span>Alıcı Baskısı</span>
          </div>
          <p className="text-[10px] text-stone-500 font-mono">
            Balina & Leviathan net emir dengesizliği (5m)
          </p>
        </div>

        {/* Retail OBI */}
        <div className="p-3 sm:p-3.5 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Retail OBI</span>
            <span className={`text-xs font-mono font-black ${retailOBI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {retailOBI >= 0 ? '+' : ''}{retailOBI}%
            </span>
          </div>
          {/* Bipolar Gauge */}
          <div className="relative w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex items-center">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-400/80 dark:bg-stone-500 z-10" />
            <div className="w-1/2 h-full flex justify-end">
              {retailOBI < 0 && (
                <div
                  className="h-full bg-rose-500 transition-all duration-300 rounded-l-xs"
                  style={{ width: `${Math.min(100, Math.abs(retailOBI))}%` }}
                />
              )}
            </div>
            <div className="w-1/2 h-full flex justify-start">
              {retailOBI > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-r-xs"
                  style={{ width: `${Math.min(100, retailOBI)}%` }}
                />
              )}
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-stone-400">
            <span>Satıcı Baskısı</span>
            <span>Alıcı Baskısı</span>
          </div>
          <p className="text-[10px] text-stone-500 font-mono">
            Karides ve küçük yatırımcı net emir dengesizliği (5m)
          </p>
        </div>

        {/* Overall Market Imbalance */}
        <div className="p-3 sm:p-3.5 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200">Piyasa Emir Dengesizliği (Imbalance)</span>
            <span className={`text-xs font-mono font-black ${overallOBI >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {overallOBI >= 0 ? '+' : ''}{overallOBI}%
            </span>
          </div>
          {/* Bipolar Gauge */}
          <div className="relative w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex items-center">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-400/80 dark:bg-stone-500 z-10" />
            <div className="w-1/2 h-full flex justify-end">
              {overallOBI < 0 && (
                <div
                  className="h-full bg-rose-500 transition-all duration-300 rounded-l-xs"
                  style={{ width: `${Math.min(100, Math.abs(overallOBI))}%` }}
                />
              )}
            </div>
            <div className="w-1/2 h-full flex justify-start">
              {overallOBI > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-r-xs"
                  style={{ width: `${Math.min(100, overallOBI)}%` }}
                />
              )}
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-stone-400">
            <span>Satıcı Baskısı</span>
            <span>Alıcı Baskısı</span>
          </div>
          <p className="text-[10px] text-stone-500 font-mono">
            Tahtadaki tüm hacim üzerinde alıcı / satıcı net baskısı
          </p>
        </div>
      </div>

      {/* Dominance Ratio & Net Delta Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
        {/* Smart Money vs Retail Hacim Oranı */}
        <div className="p-3 sm:p-3.5 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
              Hacim Hakimiyeti (Smart vs Retail)
            </h3>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono font-bold">
              <span className="text-amber-600 dark:text-amber-400">Smart Money: %{smartRatio}</span>
              <span className="text-stone-500 dark:text-stone-400">Retail: %{retailRatio}</span>
            </div>

            <div className="w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden flex">
              <div
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${smartRatio}%` }}
              />
              <div
                className="bg-stone-400 h-full transition-all duration-300"
                style={{ width: `${retailRatio}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-stone-400 pt-0.5">
              <span>Toplam Smart: {formatUsd(totalSmartVol)}</span>
              <span>Toplam Retail: {formatUsd(totalRetailVol)}</span>
            </div>
          </div>
        </div>

        {/* Net Delta Dengesi */}
        <div className="p-3 sm:p-3.5 bg-white/95 dark:bg-stone-900 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
              Kümülatif Net Delta Karşılaştırması
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono">
            <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
              <div className="text-[10px] uppercase font-sans text-amber-800 dark:text-amber-300 font-bold">
                Smart Money Net Delta
              </div>
              <div className={`text-sm sm:text-base font-black mt-0.5 ${totalSmartDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatSignedUsd(totalSmartDelta)}
              </div>
            </div>

            <div className="p-2.5 bg-stone-50 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700">
              <div className="text-[10px] uppercase font-sans text-stone-600 dark:text-stone-400 font-bold">
                Retail Net Delta
              </div>
              <div className={`text-sm sm:text-base font-black mt-0.5 ${totalRetailDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatSignedUsd(totalRetailDelta)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Timeframe Kova Matrisi Tablosu */}
      <div className="bg-white/95 dark:bg-stone-900 p-3.5 sm:p-4 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-500 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
              Kova Bazında Multi-Timeframe Delta & Hacim Matrisi
            </h3>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-md">
              {allBuckets5m.length} Aktif Kova
            </span>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-2.5 py-1 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-[11px] font-bold flex items-center gap-1.5 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3 h-3 text-rose-400 dark:text-rose-600" />
              <span>{exportNotice ? 'İndirildi!' : 'CSV İndir'}</span>
            </button>
          </div>
        </div>

        {/* Mobil Uyumlu Yatay Kaydırma Zırhı - Sticky Freeze İlk Sütun */}
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl relative">
          <table className="w-full min-w-[590px] text-left text-xs font-mono border-collapse">
            <thead className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 sticky top-0 z-30">
              <tr>
                <th className="p-2.5 whitespace-nowrap sticky left-0 bg-stone-100 dark:bg-stone-800 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] min-w-[160px]">
                  Kova Adı & Tür
                </th>
                <th className="p-2.5 whitespace-nowrap text-right min-w-[105px]">1m Delta</th>
                <th className="p-2.5 whitespace-nowrap text-right min-w-[110px]">5m Delta</th>
                <th className="p-2.5 whitespace-nowrap text-right min-w-[115px]">15m Delta</th>
                <th className="p-2.5 whitespace-nowrap text-right min-w-[100px]">5m Hacim</th>
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
                  <tr key={b5.id} className="hover:bg-rose-50/40 dark:hover:bg-stone-800/40 transition-colors group">
                    <td className="p-2.5 whitespace-nowrap sticky left-0 bg-white dark:bg-stone-900 group-hover:bg-rose-50/70 dark:group-hover:bg-stone-800/80 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">{b5.icon}</span>
                        <div className="flex flex-col">
                          <span className="font-bold text-stone-900 dark:text-stone-100">{b5.name}</span>
                          <span className={`inline-block w-fit px-1.5 py-0.2 rounded text-[9px] font-bold mt-0.5 ${
                            b5.isSmartMoney
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                          }`}>
                            {b5.isSmartMoney ? 'Smart Money' : 'Retail'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={`p-2.5 font-bold text-right whitespace-nowrap min-w-[105px] ${d1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatSignedUsd(d1)}
                    </td>
                    <td className={`p-2.5 font-bold text-right whitespace-nowrap min-w-[110px] ${d5 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatSignedUsd(d5)}
                    </td>
                    <td className={`p-2.5 font-bold text-right whitespace-nowrap min-w-[115px] ${d15 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatSignedUsd(d15)}
                    </td>
                    <td className="p-2.5 text-right font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap min-w-[100px]">
                      {formatUsd(vol5)}
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

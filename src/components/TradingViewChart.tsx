import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  HistogramSeries, 
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  Time
} from 'lightweight-charts';
import { WSManager } from '../engine';
import { ArrowLeft, RefreshCw, ZoomIn, ZoomOut, RotateCcw, Maximize } from 'lucide-react';

interface TradingViewChartProps {
  symbol: string;
  wsManager: WSManager;
  onBackToDashboard: () => void;
  isDark?: boolean;
  isActive?: boolean;
}

type ChartTimeframe = '1m' | '3m' | '5m' | '15m' | '1h' | '4h';

const STORAGE_TF_KEY = 'orderflow_chart_timeframe';
const STORAGE_BAR_SPACING_KEY = 'orderflow_bar_spacing';
const DEFAULT_BAR_SPACING = 18; // Dolgun, okunaklı, tok mum genişliği

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  wsManager,
  onBackToDashboard,
  isDark = true,
  isActive = true,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null);

  // Timeframe: Kalıcı LocalStorage
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TF_KEY) as ChartTimeframe;
      if (saved && ['1m', '3m', '5m', '15m', '1h', '4h'].includes(saved)) {
        return saved;
      }
    } catch (e) {}
    return '1m';
  });

  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [candleCount, setCandleCount] = useState<number>(0);
  const [isTickPulsing, setIsTickPulsing] = useState<boolean>(false);

  // Aktif son mumu hafızada tutuyoruz (tic tic güncellemesi için)
  const currentBarRef = useRef<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const saveTimeoutRef = useRef<any>(null);

  const timeframeSecondsMap: Record<ChartTimeframe, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
  };

  // Timeframe değiştirme ve kalıcı kaydetme
  const handleTimeframeChange = (newTf: ChartTimeframe) => {
    setTimeframe(newTf);
    try {
      localStorage.setItem(STORAGE_TF_KEY, newTf);
    } catch (e) {}
  };

  // 1. Chart Instance Başlatma ve Resize Yönetimi
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    container.innerHTML = '';

    // Kayıtlı barSpacing oku
    let initialBarSpacing = DEFAULT_BAR_SPACING;
    try {
      const savedSpacing = parseFloat(localStorage.getItem(STORAGE_BAR_SPACING_KEY) || '');
      if (!isNaN(savedSpacing) && savedSpacing >= 6 && savedSpacing <= 60) {
        initialBarSpacing = savedSpacing;
      }
    } catch (e) {}

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#090a0f' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1, // Magnet crosshair
        vertLine: {
          color: '#f43f5e',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#f43f5e',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        visible: true,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.20,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: initialBarSpacing,
        minBarSpacing: 5,
        rightOffset: 12,
        lockVisibleTimeRangeOnResize: true,
      },
      autoSize: true,
    });

    chartRef.current = chart;

    // Kullanıcı zoom/pan yaptıkça barSpacing'i kaydet (Debounce)
    const onRangeChanged = () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const currentOptions = chart.timeScale().options();
          if (currentOptions && typeof currentOptions.barSpacing === 'number') {
            localStorage.setItem(STORAGE_BAR_SPACING_KEY, currentOptions.barSpacing.toString());
          }
        } catch (e) {}
      }, 300);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChanged);

    // 1. Mum Serisi (Candlestick - Ana Sağ Skala)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: true,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      priceScaleId: 'right',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });
    candleSeriesRef.current = candleSeries;

    // 2. Hacim Histogramı (Altta Bağımsız Overlay Skala - Fiyat Skalasına Karışmaz)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // Bağımsız skala ID
      lastValueVisible: false, // Sağ eksende hacim değeri etiketi gösterme
      priceLineVisible: false, // Hacim yatay çizgisini gizle
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChanged);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Aktif tab durumunda chart boyutunu tazele
  useEffect(() => {
    if (isActive && chartRef.current && chartContainerRef.current) {
      const { clientWidth, clientHeight } = chartContainerRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        chartRef.current.applyOptions({ width: clientWidth, height: clientHeight });
      }
    }
  }, [isActive]);

  // 2. Geçmiş 600 Mum Çekimi (REST API)
  const fetchHistoricalCandles = async () => {
    setIsLoading(true);
    const sym = symbol.toUpperCase().trim();
    const interval = timeframe;

    try {
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=600`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();

      if (!Array.isArray(raw) || raw.length === 0) {
        setIsLoading(false);
        return;
      }

      const candleData: CandlestickData<Time>[] = [];
      const volumeData: HistogramData<Time>[] = [];

      for (const c of raw) {
        const timeSec = Math.floor(c[0] / 1000) as Time;
        const open = parseFloat(c[1]);
        const high = parseFloat(c[2]);
        const low = parseFloat(c[3]);
        const close = parseFloat(c[4]);
        const volume = parseFloat(c[5]);

        candleData.push({ time: timeSec, open, high, low, close });
        volumeData.push({
          time: timeSec,
          value: volume,
          color: close >= open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
        });
      }

      if (candleSeriesRef.current && volumeSeriesRef.current && chartRef.current) {
        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        // KULLANICI İSTEĞİ: Mumlar küçük olmasın, fitContent yapılmasın!
        // Kaydedilmiş barSpacing veya tok 18px ile son 70 muma odaklan
        let userBarSpacing = DEFAULT_BAR_SPACING;
        try {
          const savedSpacing = parseFloat(localStorage.getItem(STORAGE_BAR_SPACING_KEY) || '');
          if (!isNaN(savedSpacing) && savedSpacing >= 6 && savedSpacing <= 60) {
            userBarSpacing = savedSpacing;
          }
        } catch (e) {}

        chartRef.current.timeScale().applyOptions({
          barSpacing: userBarSpacing,
          rightOffset: 12,
        });

        const total = candleData.length;
        if (total > 0) {
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - 75),
            to: total + 12,
          });
        }

        // En son mumu hafızaya al
        const last = raw[raw.length - 1];
        const lastTime = Math.floor(last[0] / 1000);
        const lastClose = parseFloat(last[4]);
        currentBarRef.current = {
          time: lastTime,
          open: parseFloat(last[1]),
          high: parseFloat(last[2]),
          low: parseFloat(last[3]),
          close: lastClose,
          volume: parseFloat(last[5]),
        };
        setCurrentPrice(lastClose);
        setCandleCount(candleData.length);
      }
    } catch (err: any) {
      console.error('Klines yükleme hatası:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Timeframe veya symbol değişince 600 mumu çek
  useEffect(() => {
    fetchHistoricalCandles();
  }, [symbol, timeframe]);

  // 3. 24 Saatlik Değişim Verisi
  useEffect(() => {
    const sym = symbol.toUpperCase().trim();
    fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.priceChangePercent) {
          setPriceChange24h(parseFloat(d.priceChangePercent));
        }
      })
      .catch(() => {});
  }, [symbol]);

  // 4. CANLI TİC TİC GÜNCELLEME (Trade ve Kline Stream Dinleyicisi)
  useEffect(() => {
    const tfSec = timeframeSecondsMap[timeframe];

    // Gelen her işlemde anlık barı güncelle (Saf Canlı Tic Tic)
    const originalOnTrade = wsManager.onTrade;
    wsManager.onTrade = (trade) => {
      if (originalOnTrade) originalOnTrade(trade);

      const price = trade.price;
      const qty = trade.qty;
      if (!price || isNaN(price) || price <= 0 || !isFinite(price)) return;
      if (qty === undefined || isNaN(qty) || qty < 0) return;

      const current = currentBarRef.current;
      // Anormal fiyat zıplaması koruması (bad tick / volume / outlier filtresi)
      if (current && current.close > 0) {
        if (price < current.close * 0.5 || price > current.close * 1.8) {
          return;
        }
      }

      const tradeTimeSec = Math.floor(trade.time / 1000);
      const barTimeSec = Math.floor(tradeTimeSec / tfSec) * tfSec;

      setCurrentPrice(price);
      setIsTickPulsing(true);
      setTimeout(() => setIsTickPulsing(false), 80);

      if (!current || barTimeSec > current.time) {
        // Yeni mum başlangıcı
        const newBar = {
          time: barTimeSec,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: qty,
        };
        currentBarRef.current = newBar;
        candleSeriesRef.current?.update({
          time: barTimeSec as Time,
          open: price,
          high: price,
          low: price,
          close: price,
        });
        volumeSeriesRef.current?.update({
          time: barTimeSec as Time,
          value: qty,
          color: 'rgba(16, 185, 129, 0.4)',
        });
      } else if (barTimeSec === current.time) {
        // Mevcut mumu tic tic güncelle
        current.high = Math.max(current.high, price);
        current.low = Math.min(current.low, price);
        current.close = price;
        current.volume += qty;

        candleSeriesRef.current?.update({
          time: current.time as Time,
          open: current.open,
          high: current.high,
          low: current.low,
          close: current.close,
        });
        volumeSeriesRef.current?.update({
          time: current.time as Time,
          value: current.volume,
          color: current.close >= current.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
        });
      }
    };

    // Market soketinden resmi kline geldiğinde senkronize et
    const originalOnKline = wsManager.onKline;
    wsManager.onKline = (kline) => {
      if (originalOnKline) originalOnKline(kline);

      if (timeframe === '1m') {
        if (!kline.open || !kline.high || !kline.low || !kline.close) return;
        if (isNaN(kline.low) || kline.low <= 0) return;
        if (currentBarRef.current && currentBarRef.current.close > 0) {
          if (kline.low < currentBarRef.current.close * 0.5) return;
        }

        const timeSec = kline.time;
        const current = currentBarRef.current;
        if (current && timeSec === current.time) {
          current.open = kline.open;
          current.high = Math.max(current.high, kline.high);
          current.low = Math.min(current.low, kline.low);
          current.close = kline.close;
          current.volume = kline.volume;
        } else if (!current || timeSec > current.time) {
          currentBarRef.current = {
            time: timeSec,
            open: kline.open,
            high: kline.high,
            low: kline.low,
            close: kline.close,
            volume: kline.volume,
          };
        }

        candleSeriesRef.current?.update({
          time: timeSec as Time,
          open: kline.open,
          high: kline.high,
          low: kline.low,
          close: kline.close,
        });
        volumeSeriesRef.current?.update({
          time: timeSec as Time,
          value: kline.volume,
          color: kline.close >= kline.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
        });
        setCurrentPrice(kline.close);
      }
    };

    return () => {
      wsManager.onTrade = originalOnTrade;
      wsManager.onKline = originalOnKline;
    };
  }, [timeframe, wsManager]);

  const handleZoomIn = () => {
    if (!chartRef.current) return;
    const currentOptions = chartRef.current.timeScale().options();
    const currentSpacing = currentOptions?.barSpacing || DEFAULT_BAR_SPACING;
    const next = Math.min(50, currentSpacing + 4);
    chartRef.current.timeScale().applyOptions({ barSpacing: next });
    try {
      localStorage.setItem(STORAGE_BAR_SPACING_KEY, next.toString());
    } catch (e) {}
  };

  const handleZoomOut = () => {
    if (!chartRef.current) return;
    const currentOptions = chartRef.current.timeScale().options();
    const currentSpacing = currentOptions?.barSpacing || DEFAULT_BAR_SPACING;
    const next = Math.max(6, currentSpacing - 4);
    chartRef.current.timeScale().applyOptions({ barSpacing: next });
    try {
      localStorage.setItem(STORAGE_BAR_SPACING_KEY, next.toString());
    } catch (e) {}
  };

  const handleResetZoom = () => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      barSpacing: DEFAULT_BAR_SPACING,
      rightOffset: 12,
    });
    chartRef.current.timeScale().scrollToRealTime();
    try {
      localStorage.setItem(STORAGE_BAR_SPACING_KEY, DEFAULT_BAR_SPACING.toString());
    } catch (e) {}
  };

  const handleFitAll = () => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().fitContent();
  };

  return (
    <div className="relative w-full h-[calc(100vh-56px)] bg-[#090a0f] overflow-hidden select-none">
      {/* 
        KULLANICI İSTEĞİ:
        "tam ekran yalnızca grafik olsun. sağında solunda üstünde hiçbirşey olmasın. saf grafik. geçmiş 600 mum otomatik çekilsin canlı tic tic olsun"
      */}

      {/* SAF GRAFİK KAPSAYICISI (TÜM EKRANI KAPLAR) */}
      <div 
        id="tradingview-lightweight-chart-container" 
        ref={chartContainerRef} 
        className="w-full h-full"
      />

      {/* MİNİMALİST YÜZEN KONTROL PANELEÇİK (Grafiği örtmez, şeffaf ve şık) */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2 bg-stone-900/85 backdrop-blur-md border border-stone-800/80 rounded-xl px-2.5 py-1.5 shadow-2xl">
        <button
          type="button"
          onClick={onBackToDashboard}
          title="Dashboard'a Dön"
          className="flex items-center gap-1 text-xs font-bold text-stone-300 hover:text-white bg-stone-800/80 hover:bg-rose-600/80 px-2 py-1 rounded-lg transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Dön</span>
        </button>

        <div className="h-4 w-[1px] bg-stone-700/60" />

        {/* Parite & Fiyat */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-white tracking-wider font-mono">
            {symbol.toUpperCase()}
          </span>

          <span
            className={`text-xs font-mono font-black transition-colors ${
              isTickPulsing
                ? 'text-emerald-300 scale-105'
                : currentPrice !== null
                ? 'text-emerald-400'
                : 'text-stone-400'
            }`}
          >
            {currentPrice !== null
              ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
              : 'Yükleniyor...'}
          </span>

          <span
            className={`text-[10px] font-mono font-bold px-1 rounded ${
              priceChange24h >= 0 ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'
            }`}
          >
            {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
          </span>
        </div>

        <div className="h-4 w-[1px] bg-stone-700/60" />

        {/* Timeframe Seçimi (Kalıcı) */}
        <div className="flex items-center gap-1">
          {(['1m', '3m', '5m', '15m', '1h', '4h'] as ChartTimeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeChange(tf)}
              className={`text-[11px] font-mono px-1.5 py-0.5 rounded transition-all ${
                timeframe === tf
                  ? 'bg-rose-600 text-white font-black shadow-sm'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="h-4 w-[1px] bg-stone-700/60 hidden sm:block" />

        {/* Zoom Hızlı Kontrolleri (Mum Boyutlandırma & Odak) */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Mumları Büyüt (+)"
            className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-all"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Mumları Küçült (-)"
            className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-all"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            title="Canlıya ve İdeal Boyuta Odakla"
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold text-stone-300 hover:text-emerald-400 hover:bg-stone-800 rounded transition-all"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Odak</span>
          </button>
        </div>

        {/* Canlı Yayın Nabzı */}
        <div className="flex items-center gap-1 pl-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase hidden md:inline">
            TİC TİC CANLI
          </span>
        </div>
      </div>

      {/* SAĞ ALT HIZLI ZOOM PANELEÇİĞİ (Mobilde de tek parmakla mum boyutlandırma) */}
      <div className="absolute bottom-4 right-4 z-30 flex sm:hidden items-center gap-1 bg-stone-900/80 backdrop-blur-md border border-stone-800/80 rounded-xl p-1 shadow-2xl">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Büyüt"
          className="p-1.5 text-stone-300 hover:text-white bg-stone-800/60 rounded-lg"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Küçült"
          className="p-1.5 text-stone-300 hover:text-white bg-stone-800/60 rounded-lg"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          title="Odakla"
          className="p-1.5 text-emerald-400 hover:text-emerald-300 bg-stone-800/60 rounded-lg"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Yükleniyor Durumu */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 px-4 py-2 rounded-xl text-stone-200 font-mono text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
            <span>{symbol.toUpperCase()} 600 Mum Çekiliyor...</span>
          </div>
        </div>
      )}
    </div>
  );
};

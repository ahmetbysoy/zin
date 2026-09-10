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
import { soundEngine } from '../audio';
import { ArrowLeft, RefreshCw, ZoomIn, ZoomOut, RotateCcw, Maximize, ChevronDown, Search, X, Check, Volume2, VolumeX } from 'lucide-react';

interface TradingViewChartProps {
  symbol: string;
  wsManager: WSManager;
  onBackToDashboard: () => void;
  isDark?: boolean;
  isActive?: boolean;
  onSelectSymbol?: (sym: string) => void;
  quickCoins?: string[];
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
  onSelectSymbol,
  quickCoins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT', 'PEPEUSDT'],
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
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [priceChange24h, setPriceChange24h] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [candleCount, setCandleCount] = useState<number>(0);
  const [isTickPulsing, setIsTickPulsing] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [tickCount, setTickCount] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Hızlı Parite Değiştirme Popover
  const [showCoinSelector, setShowCoinSelector] = useState<boolean>(false);
  const [coinSearchInput, setCoinSearchInput] = useState<string>('');

  // Aktif son mumu hafızada tutuyoruz (tic tic güncellemesi için)
  const currentBarRef = useRef<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const prevPriceRef = useRef<number | null>(null);
  const pulseTimeoutRef = useRef<any>(null);
  const chartWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
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

      // Parite fetch sırasında değiştiyse eski yanıtı atla
      if (symbol.toUpperCase().trim() !== sym) {
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
        // En son mumu hafızaya al
        const last = raw[raw.length - 1];
        const lastTime = Math.floor(last[0] / 1000);
        const lastClose = parseFloat(last[4]);

        // Fiyat hassasiyetini sembole ve fiyata göre tam hesapla
        let precision = 2;
        if (lastClose >= 1000) precision = 2;
        else if (lastClose >= 10) precision = 2;
        else if (lastClose >= 1) precision = 4;
        else if (lastClose >= 0.01) precision = 5;
        else if (lastClose >= 0.0001) precision = 6;
        else precision = 8;
        const minMove = 1 / Math.pow(10, precision);

        // KRİTİK ADIM 1: Önce formatı ayarla
        candleSeriesRef.current.applyOptions({
          priceFormat: {
            type: 'price',
            precision,
            minMove,
          },
        });

        // KRİTİK ADIM 2: Kullanıcı sürüklemiş olsa bile yeni coinde sağ fiyat skalasını ZORLA autoScale yap!
        chartRef.current.priceScale('right').applyOptions({
          autoScale: true,
        });
        chartRef.current.priceScale('volume').applyOptions({
          autoScale: true,
        });

        // KRİTİK ADIM 3: Veriyi bas
        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        // KULLANICI İSTEĞİ: Mumlar küçük olmasın, fitContent yapılmasın!
        // Kaydedilmiş barSpacing veya tok 18px ile son 75 muma odaklan
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

        currentBarRef.current = {
          time: lastTime,
          open: parseFloat(last[1]),
          high: parseFloat(last[2]),
          low: parseFloat(last[3]),
          close: lastClose,
          volume: parseFloat(last[5]),
        };
        prevPriceRef.current = lastClose;
        setCurrentPrice(lastClose);
        setCandleCount(candleData.length);
      }
    } catch (err: any) {
      console.error('Klines yükleme hatası:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Timeframe veya symbol değişince eski verileri anında temizle ve 600 mumu çek
  useEffect(() => {
    // Önceki paritenin hafıza referanslarını derhal sıfırla (glitch filtresine takılmasın)
    currentBarRef.current = null;
    prevPriceRef.current = null;
    setCurrentPrice(null);
    setTickCount(0);

    // Eski mumları anında temizle ve sağ ekseni aç
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData([]);
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData([]);
    }
    if (chartRef.current) {
      try {
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        chartRef.current.priceScale('volume').applyOptions({ autoScale: true });
      } catch {}
    }

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

  // 4. CANLI DOĞRUDAN @TRADE VE @KLINE DEDİKE WEBSOCKET AKIŞI (Sıfır Gecikme, Anlık Tic Tic)
  useEffect(() => {
    const cleanSym = symbol.toLowerCase().trim();
    if (!cleanSym) return;

    let isDisposed = false;
    const tfSec = timeframeSecondsMap[timeframe];

    // Eski bağlantıyı kapat
    if (chartWsRef.current) {
      try {
        chartWsRef.current.onclose = null;
        chartWsRef.current.onerror = null;
        chartWsRef.current.close();
      } catch {}
      chartWsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const connectChartStream = () => {
      if (isDisposed) return;

      // Binance Futures: Hem her tekil işlem için @trade hem de resmi mum kontrolü için @kline
      const streamUrl = `wss://fstream.binance.com/stream?streams=${cleanSym}@trade/${cleanSym}@kline_${timeframe}`;
      
      try {
        const ws = new WebSocket(streamUrl);
        chartWsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) return;
          setWsConnected(true);
        };

        ws.onmessage = (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const raw = JSON.parse(event.data);
            const data = raw.data || raw;

            // A) @TRADE AKIŞI: MİLİSANİYE SEVİYESİNDE HER İŞLEMDE ANLIK FİYAT VE MUM HAREKETİ
            const isTrade = data.e === 'trade' || (typeof raw.stream === 'string' && raw.stream.endsWith('@trade'));
            if (isTrade && data.p && data.q) {
              const price = parseFloat(data.p);
              const qty = parseFloat(data.q);
              if (isNaN(price) || price <= 0 || isNaN(qty) || qty < 0) return;

              const current = currentBarRef.current;
              // Anormal glitch filtresi (parite değiştiğinde current sıfırlandığı için yeni pariteyi engellemez)
              if (current && current.close > 0) {
                if (price < current.close * 0.25 || price > current.close * 4.0) {
                  return;
                }
              }

              // Fiyat hareket yönü tespiti (Dopamin Yeşil / Kırmızı Yanıp Sönme)
              const prev = prevPriceRef.current;
              if (prev !== null && prev !== price) {
                setPriceDirection(price > prev ? 'up' : 'down');
              }
              prevPriceRef.current = price;

              // Anlık canlı fiyatı state'e bas
              setCurrentPrice(price);
              setTickCount((prevCount) => prevCount + 1);
              setIsTickPulsing(true);
              if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
              pulseTimeoutRef.current = setTimeout(() => setIsTickPulsing(false), 90);

              // Balina Emri Sinyali ($50,000+ sert piyasa emrinde dopamin sesi)
              const notional = price * qty;
              if (notional >= 50000 && !isMuted) {
                soundEngine.playSignalChime(!data.m ? 'bull' : 'bear');
              }

              // Mum güncellemesi
              const tradeTimeMs = data.T || Date.now();
              const tradeTimeSec = Math.floor(tradeTimeMs / 1000);
              const barTimeSec = Math.floor(tradeTimeSec / tfSec) * tfSec;

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
              } else if (barTimeSec === current.time || (barTimeSec < current.time && current.time - barTimeSec <= tfSec)) {
                // Mevcut mumu anlık tic tic güncelle
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
            }

            // B) @KLINE AKIŞI: RESMİ BİNANCE MUM VERİSİ İLE SENKRONİZASYON
            const isKline = data.e === 'kline' || (typeof raw.stream === 'string' && raw.stream.includes('@kline'));
            if (isKline && data.k) {
              const k = data.k;
              const kTimeSec = Math.floor(k.t / 1000);
              const kOpen = parseFloat(k.o);
              const kHigh = parseFloat(k.h);
              const kLow = parseFloat(k.l);
              const kClose = parseFloat(k.c);
              const kVol = parseFloat(k.v);

              if (currentBarRef.current && kTimeSec === currentBarRef.current.time) {
                currentBarRef.current.open = kOpen;
                currentBarRef.current.high = Math.max(currentBarRef.current.high, kHigh);
                currentBarRef.current.low = Math.min(currentBarRef.current.low, kLow);
                currentBarRef.current.close = kClose;
                currentBarRef.current.volume = kVol;
              } else if (!currentBarRef.current || kTimeSec > currentBarRef.current.time) {
                currentBarRef.current = {
                  time: kTimeSec,
                  open: kOpen,
                  high: kHigh,
                  low: kLow,
                  close: kClose,
                  volume: kVol,
                };
              }

              candleSeriesRef.current?.update({
                time: kTimeSec as Time,
                open: currentBarRef.current?.open ?? kOpen,
                high: currentBarRef.current?.high ?? kHigh,
                low: currentBarRef.current?.low ?? kLow,
                close: kClose,
              });
              volumeSeriesRef.current?.update({
                time: kTimeSec as Time,
                value: kVol,
                color: kClose >= kOpen ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
              });
            }
          } catch (err) {
            console.error('Doğrudan grafik WS parse hatası:', err);
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!isDisposed) {
            reconnectTimeoutRef.current = setTimeout(connectChartStream, 1500);
          }
        };
      } catch (err) {
        console.error('Chart WS bağlantı hatası:', err);
        if (!isDisposed) {
          reconnectTimeoutRef.current = setTimeout(connectChartStream, 2000);
        }
      }
    };

    connectChartStream();

    return () => {
      isDisposed = true;
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (chartWsRef.current) {
        try {
          chartWsRef.current.onclose = null;
          chartWsRef.current.onerror = null;
          chartWsRef.current.close();
        } catch {}
        chartWsRef.current = null;
      }
    };
  }, [symbol, timeframe, wsManager]);

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
    try {
      chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      chartRef.current.priceScale('volume').applyOptions({ autoScale: true });
    } catch {}
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
    <div className="relative w-full h-[calc(100dvh-56px)] sm:h-[calc(100vh-56px)] bg-[#090a0f] overflow-hidden select-none">
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
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 sm:gap-2 bg-stone-900/90 backdrop-blur-md border border-stone-800/80 rounded-xl px-2 py-1.5 sm:px-2.5 sm:py-1.5 shadow-2xl max-w-[calc(100vw-24px)] overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={onBackToDashboard}
          title="Dashboard'a Dön"
          className="flex items-center gap-1 text-xs font-bold text-stone-300 hover:text-white bg-stone-800/80 hover:bg-rose-600/80 px-2 py-1 rounded-lg transition-all cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Dön</span>
        </button>

        <div className="h-4 w-[1px] bg-stone-700/60 shrink-0" />

        {/* Parite Seçici Buton & Canlı Fiyat */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCoinSelector(!showCoinSelector)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-800/90 hover:bg-stone-700 text-xs font-black text-white hover:text-rose-400 tracking-wider font-mono transition-all border border-stone-700/60 cursor-pointer"
            title="Parite Değiştir"
          >
            <span>{symbol.toUpperCase()}</span>
            <ChevronDown className="w-3 h-3 text-stone-400" />
          </button>

          <span
            className={`text-xs sm:text-sm font-mono font-black px-1.5 py-0.5 rounded transition-all duration-75 ${
              isTickPulsing
                ? priceDirection === 'up'
                  ? 'bg-emerald-500/30 text-emerald-300 scale-105 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                  : 'bg-rose-500/30 text-rose-300 scale-105 shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                : priceDirection === 'up'
                ? 'text-emerald-400'
                : priceDirection === 'down'
                ? 'text-rose-400'
                : 'text-stone-200'
            }`}
          >
            {currentPrice !== null
              ? `$${currentPrice.toLocaleString('en-US', {
                  minimumFractionDigits: currentPrice >= 1000 ? 2 : currentPrice >= 1 ? 4 : currentPrice >= 0.01 ? 5 : 6,
                  maximumFractionDigits: currentPrice >= 1000 ? 2 : currentPrice >= 1 ? 4 : currentPrice >= 0.01 ? 5 : 6,
                })}`
              : 'Yükleniyor...'}
          </span>

          <span
            className={`text-[10px] font-mono font-bold px-1 rounded hidden xs:inline ${
              priceChange24h >= 0 ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'
            }`}
          >
            {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
          </span>

          {/* @trade Canlı Akış Göstergesi */}
          <div className="flex items-center gap-1.5 bg-black/50 border border-stone-800 px-1.5 py-0.5 rounded-lg shrink-0">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${wsConnected ? 'bg-emerald-400' : 'bg-rose-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-[10px] font-mono font-bold text-emerald-400">
              @trade
            </span>
            {tickCount > 0 && (
              <span className="text-[9px] font-mono text-stone-400 hidden lg:inline">
                {tickCount}
              </span>
            )}
          </div>
        </div>

        <div className="h-4 w-[1px] bg-stone-700/60 shrink-0" />

        {/* Timeframe Seçimi (Kalıcı) */}
        <div className="flex items-center gap-1 shrink-0">
          {(['1m', '3m', '5m', '15m', '1h', '4h'] as ChartTimeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeChange(tf)}
              className={`text-[11px] font-mono px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                timeframe === tf
                  ? 'bg-rose-600 text-white font-black shadow-sm'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="h-4 w-[1px] bg-stone-700/60 hidden sm:block shrink-0" />

        {/* Zoom Hızlı Kontrolleri (Mum Boyutlandırma & Odak) */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Mumları Büyüt (+)"
            className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-all cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Mumları Küçült (-)"
            className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded transition-all cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            title="Canlıya ve İdeal Boyuta Odakla"
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold text-stone-300 hover:text-emerald-400 hover:bg-stone-800 rounded transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Odak</span>
          </button>
        </div>

        <div className="h-4 w-[1px] bg-stone-700/60 shrink-0" />

        {/* Ses Aç / Kapat Dopamin Butonu */}
        <button
          type="button"
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            soundEngine.setMuted(nextMuted);
            if (!nextMuted) soundEngine.playSignalChime('bull');
          }}
          title={isMuted ? 'Balina Seslerini Aç' : 'Sesi Kapat'}
          className={`p-1 rounded-lg transition-all cursor-pointer shrink-0 ${
            isMuted ? 'text-stone-500 hover:text-stone-300' : 'text-emerald-400 hover:text-emerald-300 bg-emerald-950/40'
          }`}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
        </button>

        {/* Canlı Yayın Nabzı */}
        <div className="flex items-center gap-1 pl-1 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase hidden md:inline">
            TİC TİC CANLI
          </span>
        </div>
      </div>

      {/* HIZLI PARİTE DEĞİŞTİRME MODALI (Şık, karanlık, tek tıkla geçiş) */}
      {showCoinSelector && (
        <div className="absolute top-14 left-3 z-50 w-72 max-w-[calc(100vw-24px)] bg-stone-900/95 backdrop-blur-xl border border-stone-700/80 rounded-2xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-stone-800">
            <span className="text-xs font-bold text-stone-200 font-mono flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-rose-500" />
              Parite Değiştir
            </span>
            <button
              type="button"
              onClick={() => setShowCoinSelector(false)}
              className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Manuel Arama / Giriş Formu */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              let clean = coinSearchInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (!clean) return;
              if (!clean.endsWith('USDT')) clean += 'USDT';
              if (onSelectSymbol) {
                onSelectSymbol(clean);
              }
              setShowCoinSelector(false);
              setCoinSearchInput('');
            }}
            className="mt-2.5 flex items-center gap-1.5"
          >
            <input
              type="text"
              value={coinSearchInput}
              onChange={(e) => setCoinSearchInput(e.target.value.toUpperCase())}
              placeholder="Örn: DOGE, SOL, PEPE..."
              autoFocus
              className="flex-1 px-2.5 py-1.5 bg-stone-800/90 border border-stone-700 rounded-xl text-xs font-mono text-white placeholder-stone-500 focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold font-mono transition-all cursor-pointer"
            >
              Seç
            </button>
          </form>

          {/* Hızlı Pariteler */}
          <div className="mt-3">
            <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block mb-1.5 font-bold">
              Popüler Pariteler
            </span>
            <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
              {quickCoins.map((c) => {
                const isCurrent = c.toUpperCase() === symbol.toUpperCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      if (onSelectSymbol) {
                        onSelectSymbol(c);
                      }
                      setShowCoinSelector(false);
                    }}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-stone-800/70 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700/50'
                    }`}
                  >
                    <span>{c.replace('USDT', '')}</span>
                    {isCurrent && <Check className="w-3 h-3 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SAĞ ALT HIZLI ZOOM PANELEÇİĞİ (Mobilde alt navbar ile çakışmaması için bottom-16 yapıldı) */}
      <div className="absolute bottom-16 right-3 z-30 flex sm:hidden items-center gap-1 bg-stone-900/90 backdrop-blur-md border border-stone-700/80 rounded-xl p-1 shadow-2xl">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Büyüt"
          className="p-2 text-stone-200 hover:text-white active:bg-stone-700 bg-stone-800/80 rounded-lg cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Küçült"
          className="p-2 text-stone-200 hover:text-white active:bg-stone-700 bg-stone-800/80 rounded-lg cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          title="Odakla"
          className="p-2 text-emerald-400 hover:text-emerald-300 active:bg-stone-700 bg-stone-800/80 rounded-lg cursor-pointer"
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

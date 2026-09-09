import { BucketKey, BucketStats, BucketThresholds, EngineStatsState, RecentTrade } from './types';

// ========================================================================
// 🧠 KARA PARA ÇEKİRDEK MOTORU (FAZA 1: DİNAMİK BUCKET & RING BUFFER)
// ========================================================================

// 1. RING BUFFER (Bellek Sızıntısını Önleyen Sabit Boyutlu Dizi)
export class RingBuffer {
  maxSize: number;
  buffer: Float64Array;
  head: number;
  count: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Float64Array(maxSize); // Sadece USDT değerlerini tutar, hafif ve hızlı
    this.head = 0;
    this.count = 0;
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) this.count++;
  }

  // Tüm dolu elemanları döndür (Persentil hesaplamak için)
  getValues(): number[] {
    if (this.count < this.maxSize) {
      return Array.from(this.buffer.slice(0, this.count));
    }
    return Array.from(this.buffer);
  }
}

// 2. DİNAMİK / STATİK BUCKET YÖNETİCİSİ (QUANTILE MOTOR)
export class BucketManager {
  mode: 'dynamic' | 'static';
  ringBuffer: RingBuffer;
  staticThresholds: BucketThresholds;
  dynamicThresholds: BucketThresholds;
  stats: EngineStatsState;
  lastBootstrapVolume: number = 0;
  lastMultiplier: number = 1.0;
  onThresholdUpdate?: (thresholds: BucketThresholds, mode: string) => void;

  // 1-minute rolling trades for trend & aggression analysis
  rollingTrades: Array<{ time: number; notional: number; isBuyerMaker: boolean; bucket: BucketKey }> = [];
  lastPruneTime: number = 0;

  constructor() {
    this.mode = 'dynamic'; // 'dynamic' veya 'static'
    this.ringBuffer = new RingBuffer(500); // Son 500 işlemin USDT değeri
    this.rollingTrades = [];

    // Varsayılan Statik Eşikler (Fallback)
    this.staticThresholds = {
      shrimpMax: 1000,
      crabMax: 10000,
      whaleMax: 100000,
      // Leviathan: > 100000
    };

    // Dinamik Eşikler (Canlı hesaplanacak)
    this.dynamicThresholds = {
      shrimpMax: 1000,
      crabMax: 10000,
      whaleMax: 100000,
    };

    // Cüzdan İstatistikleri (Sıfırlanabilir)
    this.stats = {
      shrimp: { buyVol: 0, sellVol: 0, count: 0 },
      crab: { buyVol: 0, sellVol: 0, count: 0 },
      whale: { buyVol: 0, sellVol: 0, count: 0 },
      leviathan: { buyVol: 0, sellVol: 0, count: 0 },
    };
    this.resetStats();
  }

  resetStats(): void {
    this.stats = {
      shrimp: { buyVol: 0, sellVol: 0, count: 0 },
      crab: { buyVol: 0, sellVol: 0, count: 0 },
      whale: { buyVol: 0, sellVol: 0, count: 0 },
      leviathan: { buyVol: 0, sellVol: 0, count: 0 },
    };
    this.ringBuffer = new RingBuffer(500); // Buffer'ı da sıfırla
    this.rollingTrades = [];
  }

  setMode(newMode: 'dynamic' | 'static'): void {
    this.mode = newMode;
    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(
        this.mode === 'dynamic' ? this.dynamicThresholds : this.staticThresholds,
        this.mode
      );
    }
  }

  // 24s Hacim Bootstrap (İlk açılışta kör kalmamak için)
  applyBootstrap(dailyQuoteVolume: number): void {
    this.lastBootstrapVolume = dailyQuoteVolume;
    if (this.mode !== 'dynamic') return;

    let multiplier = 1.0;
    if (dailyQuoteVolume > 1000000000) multiplier = 5.0; // > $1B (BTC, ETH)
    else if (dailyQuoteVolume > 100000000) multiplier = 1.0; // $100M - $1B (SOL, BNB)
    else multiplier = 0.2; // < $100M (Altcoinler, Meme'ler)

    this.lastMultiplier = multiplier;
    this.dynamicThresholds.shrimpMax = 1000 * multiplier;
    this.dynamicThresholds.crabMax = 10000 * multiplier;
    this.dynamicThresholds.whaleMax = 100000 * multiplier;

    console.log(
      `📊 BOOTSTRAP: Günlük Hacim $${(dailyQuoteVolume / 1000000).toFixed(1)}M | Çarpan: ${multiplier}x`
    );

    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.dynamicThresholds, this.mode);
    }
  }

  // Canlı Persentil Hesaplama (Her X işlemde bir veya belirli bir tetikleme ile)
  recalculatePercentiles(): void {
    if (this.mode !== 'dynamic') return;

    const values = this.ringBuffer.getValues();
    if (values.length < 50) return; // En az 50 işlem topla, saçma sapan hesaplama yapma

    // Hızlı sıralama (Ascending)
    values.sort((a, b) => a - b);

    const len = values.length;
    // P70, P90, P98 indislerini bul
    const idx70 = Math.floor(len * 0.7);
    const idx90 = Math.floor(len * 0.9);
    const idx98 = Math.floor(len * 0.98);

    this.dynamicThresholds.shrimpMax = Math.max(1, Math.round(values[idx70]));
    this.dynamicThresholds.crabMax = Math.max(this.dynamicThresholds.shrimpMax + 1, Math.round(values[idx90]));
    this.dynamicThresholds.whaleMax = Math.max(this.dynamicThresholds.crabMax + 1, Math.round(values[idx98]));

    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.dynamicThresholds, this.mode);
    }
  }

  // Gelen işlemi sınıflandır ve istatistiği güncelle
  processTrade(price: number, quantity: number, isBuyerMaker: boolean, tradeTime: number = Date.now()): { bucket: BucketKey; notionalValue: number } {
    const notionalValue = price * quantity; // USDT cinsinden değer

    // 1. Ring Buffer'a ekle (Sadece dinamik modda)
    if (this.mode === 'dynamic') {
      this.ringBuffer.push(notionalValue);
      // Her 50 işlemde bir persentilleri güncelle (Performans optimizasyonu)
      if (this.ringBuffer.count % 50 === 0) {
        this.recalculatePercentiles();
      }
    }

    // 2. Hangi kovaya düştüğünü belirle
    const thresholds = this.mode === 'dynamic' ? this.dynamicThresholds : this.staticThresholds;
    let bucket: BucketKey = 'shrimp';

    if (notionalValue > thresholds.whaleMax) bucket = 'leviathan';
    else if (notionalValue > thresholds.crabMax) bucket = 'whale';
    else if (notionalValue > thresholds.shrimpMax) bucket = 'crab';

    // 3. İstatistiği işle (isBuyerMaker: true ise SATICI baskısı, false ise ALICI baskısı)
    // NOT: Binance'te isBuyerMaker=true, işlemin limit defterindeki bir ALICI emri tarafından eşleştiği (yani agresif SATICI) anlamına gelir.
    if (isBuyerMaker) {
      this.stats[bucket].sellVol += notionalValue;
    } else {
      this.stats[bucket].buyVol += notionalValue;
    }
    this.stats[bucket].count += 1;

    // 4. 1-Dakikalık Kayan Pencereye ekle
    this.rollingTrades.push({
      time: tradeTime,
      notional: notionalValue,
      isBuyerMaker,
      bucket,
    });

    // Her saniye ya da 50 işlemde bir 60s üzeri eski trade'leri temizle (O(1) amortized)
    if (tradeTime - this.lastPruneTime > 1000) {
      this.pruneRollingTrades(tradeTime);
      this.lastPruneTime = tradeTime;
    }

    return { bucket, notionalValue };
  }

  pruneRollingTrades(currentTime: number): void {
    const cutoff = currentTime - 60_000;
    // Fast binary-style search or slice
    let dropCount = 0;
    for (let i = 0; i < this.rollingTrades.length; i++) {
      if (this.rollingTrades[i].time < cutoff) {
        dropCount++;
      } else {
        break;
      }
    }
    if (dropCount > 0) {
      this.rollingTrades.splice(0, dropCount);
    }
  }

  // 1 Dakikalık penceredeki istatistikleri ve Yön/Agresyon bias'ını hesapla
  getRollingStats(bucketKey: BucketKey): {
    rolling1mBuyVol: number;
    rolling1mSellVol: number;
    rolling1mDelta: number;
    rolling1mCount: number;
    directionalBias: number;
    aggressionScore: number;
  } {
    let buyVol = 0;
    let sellVol = 0;
    let count = 0;

    for (let i = 0; i < this.rollingTrades.length; i++) {
      const t = this.rollingTrades[i];
      if (t.bucket === bucketKey) {
        count++;
        if (t.isBuyerMaker) {
          sellVol += t.notional;
        } else {
          buyVol += t.notional;
        }
      }
    }

    const totalVol = buyVol + sellVol;
    const directionalBias = totalVol === 0 ? 50 : Math.round((buyVol / totalVol) * 100);
    const aggressionScore = directionalBias; // Market taker alıcı baskısı %

    return {
      rolling1mBuyVol: Math.round(buyVol),
      rolling1mSellVol: Math.round(sellVol),
      rolling1mDelta: Math.round(buyVol - sellVol),
      rolling1mCount: count,
      directionalBias,
      aggressionScore,
    };
  }

  getAllRollingStats(): Record<BucketKey, BucketStats> {
    const buckets: BucketKey[] = ['shrimp', 'crab', 'whale', 'leviathan'];
    const result = {} as Record<BucketKey, BucketStats>;

    for (const b of buckets) {
      const rolling = this.getRollingStats(b);
      result[b] = {
        buyVol: this.stats[b].buyVol,
        sellVol: this.stats[b].sellVol,
        count: this.stats[b].count,
        ...rolling,
      };
    }
    return result;
  }

  // Akıllı Para (Balina + Leviathan) vs Aptal Para (Karides) Uyumsuzluğu
  getSmartMoneyDivergence(): {
    retailDelta1m: number;
    smartDelta1m: number;
    signal: 'ACCUMULATION' | 'DISTRIBUTION' | 'BULL_MOMENTUM' | 'BEAR_MOMENTUM' | 'NEUTRAL';
    signalTitle: string;
    signalDesc: string;
    confidence: number;
  } {
    const shrimpRolling = this.getRollingStats('shrimp');
    const whaleRolling = this.getRollingStats('whale');
    const leviRolling = this.getRollingStats('leviathan');

    const retailDelta1m = shrimpRolling.rolling1mDelta;
    const smartDelta1m = whaleRolling.rolling1mDelta + leviRolling.rolling1mDelta;

    // Uyuşmazlık analizi:
    // 1. Bullish Absorption (Boğa Emilimi): Retail satıyor (korku), Balina topluyor (akıllı para)
    if (retailDelta1m < -500 && smartDelta1m > 1000) {
      const conf = Math.min(99, Math.round(65 + Math.abs(smartDelta1m) / 10000 * 20));
      return {
        retailDelta1m,
        smartDelta1m,
        signal: 'ACCUMULATION',
        signalTitle: '🟢 BOĞA EMİLİMİ (SMART ACCUMULATION)',
        signalDesc: 'Karidesler panikle satıyor, Balina ve Leviathan tüm satışı marketten emiyor! Yukarı patlama ihtimali yüksek.',
        confidence: conf,
      };
    }

    // 2. Bearish Distribution (Mal Boşaltma / Boğa Tuzağı): Retail FOMO alıyor, Balina basıyor
    if (retailDelta1m > 500 && smartDelta1m < -1000) {
      const conf = Math.min(99, Math.round(65 + Math.abs(smartDelta1m) / 10000 * 20));
      return {
        retailDelta1m,
        smartDelta1m,
        signal: 'DISTRIBUTION',
        signalTitle: '🔴 DAĞITIM & TUZAK (SMART DISTRIBUTION)',
        signalDesc: 'Karidesler fomo ile alım kovalıyor, Akıllı Para tepeden boşaltıyor! Tuzak kapısı kapanmak üzere.',
        confidence: conf,
      };
    }

    // 3. Güçlü Konsensüs Boğa (Bull Momentum)
    if (smartDelta1m > 2000 && retailDelta1m > 0) {
      return {
        retailDelta1m,
        smartDelta1m,
        signal: 'BULL_MOMENTUM',
        signalTitle: '⚡ GÜÇLÜ BOĞA AKIŞI (LONG MOMENTUM)',
        signalDesc: 'Hem Akıllı Para hem piyasa tek yöne agresif alım pompalıyor. Trend yukarı yönlü ezici.',
        confidence: 85,
      };
    }

    // 4. Güçlü Konsensüs Ayı (Bear Momentum)
    if (smartDelta1m < -2000 && retailDelta1m < 0) {
      return {
        retailDelta1m,
        smartDelta1m,
        signal: 'BEAR_MOMENTUM',
        signalTitle: '⚡ GÜÇLÜ AYI BASKISI (SHORT MOMENTUM)',
        signalDesc: 'Tahtada acımasız blok satışlar akıyor. Likidite alt kademelere süpürülüyor.',
        confidence: 85,
      };
    }

    return {
      retailDelta1m,
      smartDelta1m,
      signal: 'NEUTRAL',
      signalTitle: '⚖️ DENGELİ / NÖTR PİYASA',
      signalDesc: 'Akıllı para ve retail arasında net bir yön uyuşmazlığı yok, kademeler test ediliyor.',
      confidence: 50,
    };
  }

  // Belirli bir kovanın Yön Bias'ını hesapla (0-100)
  // 50: Nötr, >50: Long Bias (Alıcı baskın), <50: Short Bias (Satıcı baskın)
  getDirectionalBias(bucketName: BucketKey): number {
    const s = this.stats[bucketName];
    const totalVol = s.buyVol + s.sellVol;
    if (totalVol === 0) return 50;

    const buyRatio = (s.buyVol / totalVol) * 100;
    return Math.round(buyRatio);
  }
}

// 3. WEBSOCKET YÖNETİCİSİ
export class WSManager {
  bucketManager: BucketManager;
  ws: WebSocket | null = null;
  tickerWs: WebSocket | null = null;
  currentSymbol: string = '';
  onTrade?: (trade: RecentTrade) => void;
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'error', message: string) => void;
  onLog?: (msg: string, type: 'info' | 'warn' | 'success' | 'error') => void;

  constructor(bucketManager: BucketManager) {
    this.bucketManager = bucketManager;
    this.currentSymbol = '';
  }

  connect(symbol: string): void {
    this.currentSymbol = symbol.toLowerCase().trim();
    this.bucketManager.resetStats(); // Yeni coin, temiz sayfa

    if (this.onStatusChange) {
      this.onStatusChange('connecting', `Bağlanıyor: ${symbol.toUpperCase()}...`);
    }
    this.log(`🚀 BAŞLATILIYOR: ${symbol.toUpperCase()} stream ve bootstrap`, 'info');

    // Önce 24s hacmi çekmek için REST API çağrısı
    this.fetchBootstrapVolume();

    // Ana Trade Stream'i aç
    const tradeUrl = `wss://fstream.binance.com/ws/${this.currentSymbol}@trade`;
    try {
      this.ws = new WebSocket(tradeUrl);
    } catch (e: any) {
      this.log(`❌ WS Bağlantı Hatası: ${e.message}`, 'error');
      if (this.onStatusChange) {
        this.onStatusChange('error', 'WebSocket açılamadı');
      }
      return;
    }

    this.ws.onopen = () => {
      console.log(`✅ WS BAĞLANDI: ${symbol.toUpperCase()}`);
      this.log(`✅ WS BAĞLANDI: ${symbol.toUpperCase()} Binance Futures stream canlı!`, 'success');
      
      const statusElem = document.getElementById('ws-status');
      if (statusElem) {
        statusElem.innerText = `Status: Bağlı (${symbol.toUpperCase()})`;
        statusElem.className = 'p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-mono font-bold text-sm shadow-xs flex items-center gap-2';
      }

      if (this.onStatusChange) {
        this.onStatusChange('connected', `Bağlı (${symbol.toUpperCase()})`);
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.p);
        const qty = parseFloat(data.q);
        const isBuyerMaker = Boolean(data.m);
        const tradeTime = data.T || Date.now();
        const tradeId = data.t || Date.now();

        // Çekirdek motoru besle
        const { bucket, notionalValue } = this.bucketManager.processTrade(price, qty, isBuyerMaker, tradeTime);

        // UI Güncelleme Tetikleyicisi
        this.updateUI(price);

        if (this.onTrade) {
          this.onTrade({
            id: tradeId,
            price,
            qty,
            notional: notionalValue,
            isBuyerMaker,
            time: tradeTime,
            bucket,
          });
        }
      } catch (err: any) {
        console.error('Veri ayrıştırma hatası:', err);
      }
    };

    this.ws.onerror = (err: Event) => {
      console.error('❌ WS HATA:', err);
      this.log(`❌ WS HATA: ${symbol.toUpperCase()} akışında kopma oldu!`, 'error');
      
      const statusElem = document.getElementById('ws-status');
      if (statusElem) {
        statusElem.innerText = 'Status: Bağlantı Hatası!';
        statusElem.className = 'p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-mono font-bold text-sm shadow-xs flex items-center gap-2';
      }

      if (this.onStatusChange) {
        this.onStatusChange('error', 'Bağlantı Hatası!');
      }
    };

    this.ws.onclose = () => {
      this.log(`ℹ️ WS KAPANDI: ${symbol.toUpperCase()}`, 'info');
      const statusElem = document.getElementById('ws-status');
      if (statusElem && !statusElem.innerText.includes('Bağlı')) {
        statusElem.innerText = 'Status: Bağlantı Kapalı';
        statusElem.className = 'p-3 bg-stone-100 text-stone-600 border border-stone-200 rounded-xl font-mono text-sm';
      }
    };
  }

  fetchBootstrapVolume(): void {
    const sym = this.currentSymbol.toUpperCase();
    fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const quoteVol = parseFloat(data.quoteVolume || '0');
        this.bucketManager.applyBootstrap(quoteVol);
        this.log(
          `📊 BOOTSTRAP: ${sym} 24s Hacim $${(quoteVol / 1000000).toFixed(1)}M | Çarpan: ${this.bucketManager.lastMultiplier}x`,
          'info'
        );
      })
      .catch((err) => {
        console.warn('⚠️ Bootstrap hacim alınamadı, varsayılan kullanılıyor:', err);
        this.log(`⚠️ Bootstrap uyarısı: 24s hacim alınamadı (${err.message}), varsayılan eşiklerle devam ediliyor.`, 'warn');
      });
  }

  updateUI(currentPrice: number): void {
    const priceElem = document.getElementById('price-val');
    if (priceElem) {
      priceElem.innerText = `$${currentPrice.toLocaleString(undefined, {
        minimumFractionDigits: currentPrice < 1 ? 4 : 2,
        maximumFractionDigits: currentPrice < 1 ? 6 : 2,
      })}`;
    }
  }

  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    if (this.tickerWs) {
      try {
        this.tickerWs.close();
      } catch (e) {
        // ignore
      }
      this.tickerWs = null;
    }
    if (this.onStatusChange) {
      this.onStatusChange('disconnected', 'Bağlantı Kesildi');
    }
  }

  private log(msg: string, type: 'info' | 'warn' | 'success' | 'error'): void {
    if (this.onLog) {
      this.onLog(msg, type);
    }
  }
}

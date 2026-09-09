import { 
  BucketConfig, 
  BucketStats, 
  RecentTrade, 
  SmartMoneyDivergence, 
  SortOption, 
  TimedTradeItem 
} from './types';

// ========================================================================
// 🧠 KARA PARA ÇEKİRDEK MOTORU (FAZA 3: DİNAMİK BUCKET, LOCALSTORAGE & SORTING)
// ========================================================================

export const DEFAULT_BUCKETS: BucketConfig[] = [
  {
    id: 'shrimp',
    name: 'Karides (Noise)',
    minUsdt: 0,
    maxUsdt: 1000,
    color: 'text-stone-700',
    bgColor: 'bg-white/90',
    borderColor: 'border-pink-200',
    icon: '🦐',
    isSmartMoney: false,
  },
  {
    id: 'crab',
    name: 'Yengeç (Mid-Tier)',
    minUsdt: 1000,
    maxUsdt: 10000,
    color: 'text-rose-700',
    bgColor: 'bg-rose-50/80',
    borderColor: 'border-rose-200',
    icon: '🦀',
    isSmartMoney: false,
  },
  {
    id: 'whale',
    name: 'Balina (Smart Money)',
    minUsdt: 10000,
    maxUsdt: 100000,
    color: 'text-pink-800',
    bgColor: 'bg-pink-100/70',
    borderColor: 'border-pink-300',
    icon: '🐋',
    isSmartMoney: true,
  },
  {
    id: 'leviathan',
    name: 'Leviathan (MM / Kurumsal)',
    minUsdt: 100000,
    maxUsdt: 1000000000,
    color: 'text-purple-900',
    bgColor: 'bg-purple-100/70',
    borderColor: 'border-purple-300',
    icon: '🦑',
    isSmartMoney: true,
  },
];

// 1. RING BUFFER (Bellek Sızıntısını Önleyen Sabit Boyutlu Dizi)
export class RingBuffer {
  maxSize: number;
  buffer: Float64Array;
  head: number;
  count: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Float64Array(maxSize);
    this.head = 0;
    this.count = 0;
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) this.count++;
  }

  getValues(): number[] {
    if (this.count < this.maxSize) {
      return Array.from(this.buffer.slice(0, this.count));
    }
    return Array.from(this.buffer);
  }
}

// 2. DİNAMİK / STATİK BUCKET YÖNETİCİSİ (LOCALSTORAGE KALICI HAFIZA)
export class BucketManager {
  mode: 'dynamic' | 'static';
  ringBuffer: RingBuffer;
  buckets: BucketConfig[] = [];
  stats: Map<string, { buyVol: number; sellVol: number; count: number }> = new Map();
  lastBootstrapVolume: number = 0;
  lastMultiplier: number = 1.0;
  
  // 1-dakikalık kayan pencere
  rollingTrades: TimedTradeItem[] = [];
  lastPruneTime: number = 0;

  onBucketsChange?: (buckets: BucketConfig[]) => void;
  onThresholdUpdate?: (buckets: BucketConfig[], mode: string) => void;

  constructor() {
    this.mode = 'dynamic';
    this.ringBuffer = new RingBuffer(500);
    this.loadBucketsFromStorage();
    this.resetStats();
  }

  // --- LOCAL STORAGE ENTEGRASYONU ---
  loadBucketsFromStorage(): void {
    try {
      const stored = localStorage.getItem('kara_para_buckets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.buckets = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('⚠️ LocalStorage okunamadı, varsayılanlar yükleniyor:', e);
    }
    this.buckets = JSON.parse(JSON.stringify(DEFAULT_BUCKETS));
  }

  saveBucketsToStorage(): void {
    try {
      localStorage.setItem('kara_para_buckets', JSON.stringify(this.buckets));
    } catch (e) {
      console.error('❌ LocalStorage yazılamadı:', e);
    }
    if (this.onBucketsChange) {
      this.onBucketsChange(this.getBuckets());
    }
  }

  getBuckets(): BucketConfig[] {
    return [...this.buckets];
  }

  addBucket(newBucket: BucketConfig): void {
    // Unique ID garanti et
    const id = newBucket.id || `b_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const bucket: BucketConfig = {
      ...newBucket,
      id,
    };
    this.buckets.push(bucket);
    this.sortBuckets();
    this.saveBucketsToStorage();
    this.resetStats();
  }

  removeBucket(id: string): void {
    if (this.buckets.length <= 1) {
      alert('En az 1 adet kova kalmalıdır!');
      return;
    }
    this.buckets = this.buckets.filter((b) => b.id !== id);
    this.saveBucketsToStorage();
    this.resetStats();
  }

  resetToDefaults(): void {
    this.buckets = JSON.parse(JSON.stringify(DEFAULT_BUCKETS));
    this.saveBucketsToStorage();
    this.resetStats();
  }

  sortBuckets(): void {
    this.buckets.sort((a, b) => a.minUsdt - b.minUsdt);
  }

  resetStats(): void {
    this.stats.clear();
    for (const b of this.buckets) {
      this.stats.set(b.id, { buyVol: 0, sellVol: 0, count: 0 });
    }
    this.ringBuffer = new RingBuffer(500);
    this.rollingTrades = [];
  }

  setMode(newMode: 'dynamic' | 'static'): void {
    this.mode = newMode;
    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.getBuckets(), this.mode);
    }
  }

  // 24s Hacim Bootstrap (İlk açılışta ölçekleme)
  applyBootstrap(dailyQuoteVolume: number): void {
    this.lastBootstrapVolume = dailyQuoteVolume;
    if (this.mode !== 'dynamic') return;

    let multiplier = 1.0;
    if (dailyQuoteVolume > 1000000000) multiplier = 5.0; // > $1B (BTC, ETH)
    else if (dailyQuoteVolume > 100000000) multiplier = 1.0; // $100M - $1B (SOL, BNB)
    else multiplier = 0.2; // < $100M (Küçük altcoinler)

    this.lastMultiplier = multiplier;

    // Eğer 4 standart kova varsa bootstrap'a göre aralıkları ayarla
    if (this.buckets.length === 4) {
      this.buckets[0].maxUsdt = Math.round(1000 * multiplier);
      this.buckets[1].minUsdt = this.buckets[0].maxUsdt;
      this.buckets[1].maxUsdt = Math.round(10000 * multiplier);
      this.buckets[2].minUsdt = this.buckets[1].maxUsdt;
      this.buckets[2].maxUsdt = Math.round(100000 * multiplier);
      this.buckets[3].minUsdt = this.buckets[2].maxUsdt;
    }

    console.log(
      `📊 BOOTSTRAP: Günlük Hacim $${(dailyQuoteVolume / 1000000).toFixed(1)}M | Çarpan: ${multiplier}x`
    );

    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.getBuckets(), this.mode);
    }
  }

  // Dinamik Mod: Canlı Persentil Hesaplama
  recalculatePercentiles(): void {
    if (this.mode !== 'dynamic') return;

    const values = this.ringBuffer.getValues();
    if (values.length < 50) return;

    values.sort((a, b) => a - b);
    const len = values.length;

    // Eğer standart 4 kova ise P70, P90, P98 hesapla
    if (this.buckets.length === 4) {
      const p70 = Math.max(1, Math.round(values[Math.floor(len * 0.7)]));
      const p90 = Math.max(p70 + 1, Math.round(values[Math.floor(len * 0.9)]));
      const p98 = Math.max(p90 + 1, Math.round(values[Math.floor(len * 0.98)]));

      this.buckets[0].maxUsdt = p70;
      this.buckets[1].minUsdt = p70;
      this.buckets[1].maxUsdt = p90;
      this.buckets[2].minUsdt = p90;
      this.buckets[2].maxUsdt = p98;
      this.buckets[3].minUsdt = p98;
    } else if (this.buckets.length > 1) {
      // Dinamik N kova varsa: Eşit aralıklı kuantiller
      for (let i = 0; i < this.buckets.length - 1; i++) {
        const pct = (i + 1) / this.buckets.length;
        const qVal = Math.max(1, Math.round(values[Math.min(len - 1, Math.floor(len * pct))]));
        this.buckets[i].maxUsdt = qVal;
        this.buckets[i + 1].minUsdt = qVal;
      }
    }

    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.getBuckets(), this.mode);
    }
  }

  // İşlem Sınıflandırma (Dinamik Aralık Taraması)
  processTrade(
    price: number,
    quantity: number,
    isBuyerMaker: boolean,
    tradeTime: number = Date.now()
  ): { bucketId: string; bucketName: string; bucketIcon: string; notionalValue: number } {
    const notionalValue = price * quantity;

    if (this.mode === 'dynamic') {
      this.ringBuffer.push(notionalValue);
      if (this.ringBuffer.count % 50 === 0) {
        this.recalculatePercentiles();
      }
    }

    // Doğru kovayı bul
    let matchedBucket: BucketConfig = this.buckets[0];
    for (let i = 0; i < this.buckets.length; i++) {
      const b = this.buckets[i];
      if (notionalValue >= b.minUsdt && (notionalValue < b.maxUsdt || i === this.buckets.length - 1)) {
        matchedBucket = b;
        break;
      }
    }

    // İstatistiği güncelle
    let curStat = this.stats.get(matchedBucket.id);
    if (!curStat) {
      curStat = { buyVol: 0, sellVol: 0, count: 0 };
      this.stats.set(matchedBucket.id, curStat);
    }

    if (isBuyerMaker) {
      curStat.sellVol += notionalValue;
    } else {
      curStat.buyVol += notionalValue;
    }
    curStat.count += 1;

    // 1-dakikalık kayan pencereye ekle
    this.rollingTrades.push({
      time: tradeTime,
      notional: notionalValue,
      isBuyerMaker,
      bucketId: matchedBucket.id,
    });

    if (tradeTime - this.lastPruneTime > 1000) {
      this.pruneRollingTrades(tradeTime);
      this.lastPruneTime = tradeTime;
    }

    return {
      bucketId: matchedBucket.id,
      bucketName: matchedBucket.name,
      bucketIcon: matchedBucket.icon,
      notionalValue,
    };
  }

  pruneRollingTrades(currentTime: number): void {
    const cutoff = currentTime - 60_000;
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

  // 1 Dakikalık penceredeki istatistikler
  getRollingStats(bucketId: string): {
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
      if (t.bucketId === bucketId) {
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

    return {
      rolling1mBuyVol: Math.round(buyVol),
      rolling1mSellVol: Math.round(sellVol),
      rolling1mDelta: Math.round(buyVol - sellVol),
      rolling1mCount: count,
      directionalBias,
      aggressionScore: directionalBias,
    };
  }

  // Akıllı Sıralamalı Tüm Kova İstatistikleri (Smart Sorting)
  getAllRollingStats(sortBy: SortOption = 'activity'): BucketStats[] {
    const list: BucketStats[] = [];

    for (const b of this.buckets) {
      const s = this.stats.get(b.id) || { buyVol: 0, sellVol: 0, count: 0 };
      const rolling = this.getRollingStats(b.id);

      list.push({
        id: b.id,
        name: b.name,
        buyVol: s.buyVol,
        sellVol: s.sellVol,
        count: s.count,
        rolling1mBuyVol: rolling.rolling1mBuyVol,
        rolling1mSellVol: rolling.rolling1mSellVol,
        rolling1mDelta: rolling.rolling1mDelta,
        rolling1mCount: rolling.rolling1mCount,
        directionalBias: rolling.directionalBias,
        aggressionScore: rolling.aggressionScore,
        config: b,
      });
    }

    // Akıllı Sıralama Mantığı
    switch (sortBy) {
      case 'activity': // En çok işlem görenler (Canlı aktivite)
        list.sort((a, b) => b.rolling1mCount - a.rolling1mCount || b.count - a.count);
        break;
      case 'delta_desc': // En yüksek pozitif alıcı deltası
        list.sort((a, b) => b.rolling1mDelta - a.rolling1mDelta);
        break;
      case 'delta_asc': // En yüksek negatif satıcı deltası (Satış baskısı)
        list.sort((a, b) => a.rolling1mDelta - b.rolling1mDelta);
        break;
      case 'volume': // 1m Hacim toplamı
        list.sort((a, b) => (b.rolling1mBuyVol + b.rolling1mSellVol) - (a.rolling1mBuyVol + a.rolling1mSellVol));
        break;
      case 'hierarchy': // Küçükten büyüğe USDT sırası
      default:
        list.sort((a, b) => a.config.minUsdt - b.config.minUsdt);
        break;
    }

    return list;
  }

  // Akıllı Para vs Aptal Para Uyumsuzluk Radarı (Divergence)
  getSmartMoneyDivergence(): SmartMoneyDivergence {
    let retailDelta1m = 0;
    let smartDelta1m = 0;

    for (const b of this.buckets) {
      const rolling = this.getRollingStats(b.id);
      if (b.isSmartMoney || b.minUsdt >= 10000) {
        smartDelta1m += rolling.rolling1mDelta;
      } else {
        retailDelta1m += rolling.rolling1mDelta;
      }
    }

    if (retailDelta1m < -500 && smartDelta1m > 1000) {
      const conf = Math.min(99, Math.round(65 + (Math.abs(smartDelta1m) / 10000) * 20));
      return {
        retailDelta1m,
        smartDelta1m,
        signal: 'ACCUMULATION',
        signalTitle: '🟢 BOĞA EMİLİMİ (SMART ACCUMULATION)',
        signalDesc: 'Karidesler panikle satıyor, Balina ve Leviathan tüm satışı marketten emiyor! Yukarı patlama ihtimali yüksek.',
        confidence: conf,
      };
    }

    if (retailDelta1m > 500 && smartDelta1m < -1000) {
      const conf = Math.min(99, Math.round(65 + (Math.abs(smartDelta1m) / 10000) * 20));
      return {
        retailDelta1m,
        smartDelta1m,
        signal: 'DISTRIBUTION',
        signalTitle: '🔴 DAĞITIM & TUZAK (SMART DISTRIBUTION)',
        signalDesc: 'Karidesler fomo ile alım kovalıyor, Akıllı Para tepeden boşaltıyor! Tuzak kapısı kapanmak üzere.',
        confidence: conf,
      };
    }

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
}

// 3. WEBSOCKET YÖNETİCİSİ
export class WSManager {
  bucketManager: BucketManager;
  ws: WebSocket | null = null;
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
    this.bucketManager.resetStats();

    if (this.onStatusChange) {
      this.onStatusChange('connecting', `Bağlanıyor: ${symbol.toUpperCase()}...`);
    }
    this.log(`🚀 BAŞLATILIYOR: ${symbol.toUpperCase()} stream ve bootstrap`, 'info');

    this.fetchBootstrapVolume();

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

        const { bucketId, bucketName, bucketIcon, notionalValue } = this.bucketManager.processTrade(
          price,
          qty,
          isBuyerMaker,
          tradeTime
        );

        this.updateUI(price);

        if (this.onTrade) {
          this.onTrade({
            id: tradeId,
            price,
            qty,
            notional: notionalValue,
            isBuyerMaker,
            time: tradeTime,
            bucketId,
            bucketName,
            bucketIcon,
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

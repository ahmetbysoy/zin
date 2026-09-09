import { 
  AllBucketTypes, 
  BucketKey, 
  BucketStats, 
  BucketThresholds, 
  CustomBucket, 
  EngineStatsState, 
  RecentTrade, 
  SmartMoneyDivergence, 
  SortOption, 
  TimedTradeItem,
  TimeframeOption
} from './types';

// ========================================================================
// 🧠 ZIN PROJESİ - QUANT MOTORU & RECONNECT STREAM KERNEL (FAZA 3+)
// ========================================================================

// 1. RING BUFFER - Dinamik Boyutlandırma ve Float64Array Bellek Koruması
export class RingBuffer {
  maxSize: number;
  buffer: Float64Array;
  head: number;
  count: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = Math.max(100, Math.min(maxSize, 5000));
    this.buffer = new Float64Array(this.maxSize);
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

  // Dinamik Boyut Ayarı (500 - 2000 Arası)
  resize(newSize: number): void {
    const validSize = Math.max(100, Math.min(newSize, 5000));
    if (validSize === this.maxSize) return;

    const currentValues = this.getValues();
    this.maxSize = validSize;
    this.buffer = new Float64Array(validSize);
    this.head = 0;
    this.count = 0;

    // En son değerleri yeni buffera aktar
    const startIdx = Math.max(0, currentValues.length - validSize);
    for (let i = startIdx; i < currentValues.length; i++) {
      this.push(currentValues[i]);
    }
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(0);
  }
}

// 2. BUCKET MANAGER - Dinamik Eşikler, 100 Kova & Multi-Timeframe Divergence
export class BucketManager {
  mode: 'dynamic' | 'static';
  ringBuffer: RingBuffer;
  staticThresholds: BucketThresholds;
  dynamicThresholds: BucketThresholds;
  stats: EngineStatsState;
  lastBootstrapVolume: number = 0;
  lastMultiplier: number = 1.0;

  // 100 Custom Bucket Mimarisi
  customBuckets: CustomBucket[] = [];
  readonly maxCustomBuckets: number = 100;

  // Kayan Pencere (Maksimum 15 dakika = 900,000ms saklar)
  rollingTrades: TimedTradeItem[] = [];
  lastPruneTime: number = 0;

  // Debounce mekanizması (recalculatePercentiles)
  private lastPercentileCalcTime: number = 0;
  private readonly percentileDebounceMs: number = 250;

  onThresholdUpdate?: (thresholds: BucketThresholds, mode: string) => void;
  onCustomBucketsUpdate?: (buckets: CustomBucket[]) => void;

  constructor(initialBufferSize: number = 1000) {
    this.mode = 'dynamic';
    this.ringBuffer = new RingBuffer(initialBufferSize);

    this.staticThresholds = {
      shrimpMax: 1000,
      crabMax: 10000,
      whaleMax: 100000,
    };
    this.dynamicThresholds = { ...this.staticThresholds };

    this.stats = this.initializeStats();
    this.loadFromStorage();
  }

  private initializeStats(): EngineStatsState {
    return {
      shrimp: { id: 'shrimp', name: 'Karides', icon: '🦐', buyVol: 0, sellVol: 0, count: 0 },
      crab: { id: 'crab', name: 'Yengeç', icon: '🦀', buyVol: 0, sellVol: 0, count: 0 },
      whale: { id: 'whale', name: 'Balina', icon: '🐋', buyVol: 0, sellVol: 0, count: 0 },
      leviathan: { id: 'leviathan', name: 'Leviathan', icon: '🦑', buyVol: 0, sellVol: 0, count: 0 },
    };
  }

  loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('kara_para_custom_100_buckets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.customBuckets = parsed;
          this.ensureStatsKeys();
          return;
        }
      }
    } catch (e) {
      console.warn('⚠️ LocalStorage okunamadı:', e);
    }
    this.initializeDefaultCustomBuckets();
  }

  saveToStorage(): void {
    try {
      localStorage.setItem('kara_para_custom_100_buckets', JSON.stringify(this.customBuckets));
    } catch (e) {
      console.error('❌ LocalStorage yazılamadı:', e);
    }
    if (this.onCustomBucketsUpdate) {
      this.onCustomBucketsUpdate([...this.customBuckets]);
    }
  }

  private ensureStatsKeys(): void {
    for (const b of this.customBuckets) {
      if (!this.stats[b.id]) {
        this.stats[b.id] = { id: b.id, name: b.name, icon: b.icon, buyVol: 0, sellVol: 0, count: 0 };
      }
    }
  }

  getBucketColor(index: number): string {
    const colors = [
      '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
      '#DC2626', '#EA580C', '#D97706', '#059669', '#0891B2', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777', '#E11D48',
      '#B91C1C', '#C2410C', '#B45309', '#047857', '#0E7490', '#1D4ED8', '#4338CA', '#6D28D9', '#BE185D', '#BE123C',
      '#F87171', '#FB923C', '#FBBF24', '#34D399', '#22D3EE', '#60A5FA', '#818CF8', '#A78BFA', '#F472B6', '#FB7185',
      '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
    ];
    return colors[index % colors.length];
  }

  getBucketIcon(index: number): string {
    const icons = [
      '🦐', '🦀', '🐋', '🦑', '🐟', '🐠', '🐡', '🦈', '🐙', '🦞',
      '🎯', '⭐', '✨', '💎', '🔥', '⚡', '🌪️', '💥', '🌟', '🚀',
      '💰', '🪙', '💵', '💴', '💶', '💷', '💸', '💳', '💲', '💱',
      '📈', '📉', '📊', '🛡️', '⚔️', '👑', '🏆', '🥇', '🦁', '🐯',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚪', '⚫', '🟥',
    ];
    return icons[index % icons.length];
  }

  private initializeDefaultCustomBuckets(): void {
    const sampleValues = this.generateSampleValues(1000);
    const logRanges = this.generateLogarithmicBuckets(sampleValues, 4);

    this.customBuckets = logRanges.map((range, i) => ({
      id: `custom_${i}`,
      name: `B${i + 1} Log-Dilim`,
      minValue: Math.round(range.min),
      maxValue: Math.round(range.max),
      color: this.getBucketColor(i),
      icon: this.getBucketIcon(i),
      isActive: true,
      tradeCount: 0,
      volume: 0,
      isSmartMoney: i >= 2,
    }));

    this.ensureStatsKeys();
    this.saveToStorage();
  }

  private generateSampleValues(count: number): number[] {
    return Array.from({ length: count }, (_, i) => 10 * Math.pow(10, (i / count) * 4));
  }

  generateLogarithmicBuckets(values: number[], count: number): { min: number; max: number }[] {
    if (values.length === 0) {
      return this.generateSampleValues(count).map((_, i) => ({
        min: Math.max(1, Math.round(10 * Math.pow(10, (i / count) * 4))),
        max: Math.max(2, Math.round(10 * Math.pow(10, ((i + 1) / count) * 4))),
      }));
    }

    const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) {
      return this.generateSampleValues(count).map((_, i) => ({
        min: 10 * (i + 1),
        max: 100 * (i + 1),
      }));
    }

    const minVal = sorted[0] > 0.1 ? sorted[0] : 0.1;
    const maxVal = Math.max(minVal + 10, sorted[sorted.length - 1]);

    const logMin = Math.log(minVal);
    const logMax = Math.log(maxVal);
    const logRange = logMax - logMin;

    const buckets: { min: number; max: number }[] = [];
    for (let i = 0; i < count; i++) {
      const startLog = logMin + (i / count) * logRange;
      const endLog = logMin + ((i + 1) / count) * logRange;

      buckets.push({
        min: Math.max(1, Math.round(Math.exp(startLog))),
        max: Math.max(2, Math.round(Math.exp(endLog))),
      });
    }

    return buckets;
  }

  // Otomatik 100 Bucket Ekleme
  addCustomBucket(): boolean {
    if (this.customBuckets.length >= this.maxCustomBuckets) {
      return false;
    }

    const rawValues = this.ringBuffer.getValues().filter((v) => v > 0);
    const values = rawValues.length >= 10 ? rawValues : this.generateSampleValues(500);

    let targetCount = Math.min(this.customBuckets.length * 2, this.maxCustomBuckets);
    if (targetCount === this.customBuckets.length) {
      targetCount = Math.min(this.customBuckets.length + 10, this.maxCustomBuckets);
    }

    const newLogRanges = this.generateLogarithmicBuckets(values, targetCount);

    this.customBuckets = newLogRanges.map((range, i) => {
      const existing = this.customBuckets[i];
      return {
        id: existing?.id || `custom_${i}`,
        name: existing?.name || `B${i + 1} (${range.min < 1000 ? '$' + range.min : '$' + Math.round(range.min / 1000) + 'k'}+)`,
        minValue: range.min,
        maxValue: range.max,
        color: existing?.color || this.getBucketColor(i),
        icon: existing?.icon || this.getBucketIcon(i),
        isActive: existing?.isActive ?? true,
        tradeCount: existing?.tradeCount || 0,
        volume: existing?.volume || 0,
        isSmartMoney: i >= Math.floor(targetCount * 0.6),
      };
    });

    this.customBuckets.sort((a, b) => a.minValue - b.minValue);
    this.ensureStatsKeys();
    this.saveToStorage();
    return true;
  }

  // Manuel Özel Bucket Ekleme
  createManualBucket(bucket: Omit<CustomBucket, 'id' | 'tradeCount' | 'volume'>): boolean {
    if (this.customBuckets.length >= this.maxCustomBuckets) return false;
    if (bucket.minValue >= bucket.maxValue) return false;

    const newBucket: CustomBucket = {
      ...bucket,
      id: `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tradeCount: 0,
      volume: 0,
    };

    this.customBuckets.push(newBucket);
    this.customBuckets.sort((a, b) => a.minValue - b.minValue);
    this.ensureStatsKeys();
    this.saveToStorage();
    return true;
  }

  removeCustomBucket(id: string): void {
    this.customBuckets = this.customBuckets.filter((b) => b.id !== id);
    this.saveToStorage();
  }

  updateCustomBucket(id: string, updates: Partial<CustomBucket>): void {
    this.customBuckets = this.customBuckets.map((b) => (b.id === id ? { ...b, ...updates } : b));
    this.customBuckets.sort((a, b) => a.minValue - b.minValue);
    this.saveToStorage();
  }

  toggleBucketActive(id: string): void {
    this.customBuckets = this.customBuckets.map((b) => (b.id === id ? { ...b, isActive: !b.isActive } : b));
    this.saveToStorage();
  }

  resetCustomBuckets(): void {
    this.customBuckets = [];
    this.initializeDefaultCustomBuckets();
  }

  exportCustomBuckets(): string {
    return JSON.stringify(this.customBuckets, null, 2);
  }

  importCustomBuckets(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.customBuckets = parsed.slice(0, this.maxCustomBuckets);
        this.ensureStatsKeys();
        this.saveToStorage();
        return true;
      }
    } catch (e) {
      console.error('❌ Geçersiz JSON:', e);
    }
    return false;
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

  applyBootstrap(dailyQuoteVolume: number): void {
    this.lastBootstrapVolume = dailyQuoteVolume;
    if (this.mode !== 'dynamic') return;

    let multiplier = 1.0;
    if (dailyQuoteVolume > 1_000_000_000) multiplier = 5.0;
    else if (dailyQuoteVolume > 100_000_000) multiplier = 1.0;
    else multiplier = 0.2;

    this.lastMultiplier = multiplier;

    this.dynamicThresholds.shrimpMax = Math.round(1000 * multiplier);
    this.dynamicThresholds.crabMax = Math.round(10000 * multiplier);
    this.dynamicThresholds.whaleMax = Math.round(100000 * multiplier);

    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.dynamicThresholds, this.mode);
    }
  }

  // Debounce korumalı persentil hesaplama (Teknik Eleştiri #3 Çözümü)
  recalculatePercentiles(now: number): void {
    if (this.mode !== 'dynamic') return;
    if (now - this.lastPercentileCalcTime < this.percentileDebounceMs) return;
    this.lastPercentileCalcTime = now;

    const values = this.ringBuffer.getValues();
    if (values.length < 50) return;

    values.sort((a, b) => a - b);
    const len = values.length;

    const p70 = Math.max(1, Math.round(values[Math.floor(len * 0.7)]));
    const p90 = Math.max(p70 + 1, Math.round(values[Math.floor(len * 0.9)]));
    const p98 = Math.max(p90 + 1, Math.round(values[Math.floor(len * 0.98)]));

    this.dynamicThresholds.shrimpMax = p70;
    this.dynamicThresholds.crabMax = p90;
    this.dynamicThresholds.whaleMax = p98;

    if (this.onThresholdUpdate) {
      this.onThresholdUpdate(this.dynamicThresholds, this.mode);
    }
  }

  private updateCustomBucketsWithLiveBuffer(): void {
    const values = this.ringBuffer.getValues().filter((v) => v > 0);
    if (values.length < 50 || this.customBuckets.length === 0) return;

    const logRanges = this.generateLogarithmicBuckets(values, this.customBuckets.length);
    for (let i = 0; i < this.customBuckets.length; i++) {
      this.customBuckets[i].minValue = logRanges[i].min;
      this.customBuckets[i].maxValue = logRanges[i].max;
    }
  }

  // Binary Search O(log N) Custom Bucket Sınıflandırma
  classifyCustomBucket(notionalValue: number): CustomBucket | null {
    if (this.customBuckets.length === 0) return null;

    let left = 0;
    let right = this.customBuckets.length - 1;

    while (left <= right) {
      const mid = (left + right) >> 1;
      const b = this.customBuckets[mid];

      if (notionalValue >= b.minValue && notionalValue < b.maxValue) {
        return b;
      } else if (notionalValue < b.minValue) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    if (notionalValue <= this.customBuckets[0].minValue) return this.customBuckets[0];
    return this.customBuckets[this.customBuckets.length - 1];
  }

  // ÇEKİRDEK İŞLEM İŞLEYİCİSİ - tradeTime ZORUNLU (Teknik Eleştiri #1 Çözümü)
  processTrade(
    price: number,
    quantity: number,
    isBuyerMaker: boolean,
    tradeTime: number
  ): {
    bucket: AllBucketTypes;
    bucketName: string;
    bucketIcon: string;
    notionalValue: number;
    customBucketId?: string;
  } {
    const notionalValue = price * quantity;

    // 1. Ring Buffer'a push et ve debounce ile persentilleri güncelle
    if (this.mode === 'dynamic') {
      this.ringBuffer.push(notionalValue);
      if (this.ringBuffer.count % 50 === 0) {
        this.recalculatePercentiles(tradeTime);
        this.updateCustomBucketsWithLiveBuffer();
      }
    }

    // 2. Varsayılan kova sınıflandırması
    const thresholds = this.mode === 'dynamic' ? this.dynamicThresholds : this.staticThresholds;
    let defaultBucket: BucketKey = 'shrimp';
    if (notionalValue > thresholds.whaleMax) defaultBucket = 'leviathan';
    else if (notionalValue > thresholds.crabMax) defaultBucket = 'whale';
    else if (notionalValue > thresholds.shrimpMax) defaultBucket = 'crab';

    // Varsayılan kova istatistik güncelle
    if (!this.stats[defaultBucket]) {
      this.stats[defaultBucket] = { id: defaultBucket, name: defaultBucket, icon: '🦐', buyVol: 0, sellVol: 0, count: 0 };
    }
    if (isBuyerMaker) {
      this.stats[defaultBucket].sellVol += notionalValue;
    } else {
      this.stats[defaultBucket].buyVol += notionalValue;
    }
    this.stats[defaultBucket].count += 1;

    // 3. Custom Bucket Binary Search Sınıflandırması
    const matchedCustom = this.classifyCustomBucket(notionalValue);
    if (matchedCustom) {
      matchedCustom.volume += notionalValue;
      matchedCustom.tradeCount += 1;

      if (!this.stats[matchedCustom.id]) {
        this.stats[matchedCustom.id] = { id: matchedCustom.id, name: matchedCustom.name, icon: matchedCustom.icon, buyVol: 0, sellVol: 0, count: 0 };
      }
      if (isBuyerMaker) {
        this.stats[matchedCustom.id].sellVol += notionalValue;
      } else {
        this.stats[matchedCustom.id].buyVol += notionalValue;
      }
      this.stats[matchedCustom.id].count += 1;
    }

    // 4. Kayan Pencereye ekle
    this.rollingTrades.push({
      time: tradeTime,
      notional: notionalValue,
      isBuyerMaker,
      bucket: matchedCustom ? matchedCustom.id : defaultBucket,
    });

    // 5. Binary Search ile O(log N) Prune (Teknik Eleştiri #2 Çözümü)
    if (tradeTime - this.lastPruneTime > 1000) {
      this.pruneRollingTrades(tradeTime);
      this.lastPruneTime = tradeTime;
    }

    const defaultNames: Record<BucketKey, { name: string; icon: string }> = {
      shrimp: { name: 'Karides', icon: '🦐' },
      crab: { name: 'Yengeç', icon: '🦀' },
      whale: { name: 'Balina', icon: '🐋' },
      leviathan: { name: 'Leviathan', icon: '🦑' },
    };

    return {
      bucket: matchedCustom ? matchedCustom.id : defaultBucket,
      bucketName: matchedCustom ? matchedCustom.name : defaultNames[defaultBucket].name,
      bucketIcon: matchedCustom ? matchedCustom.icon : defaultNames[defaultBucket].icon,
      notionalValue,
      customBucketId: matchedCustom?.id,
    };
  }

  // BINARY SEARCH İLE O(log N) BUDAMA (Teknik Eleştiri #2)
  pruneRollingTrades(currentTime: number): void {
    // En uzun timeframe olan 15 dakikadan (900,000ms) eski kayıtları temizle
    const cutoff = currentTime - 900_000;
    const len = this.rollingTrades.length;
    if (len === 0 || this.rollingTrades[0].time >= cutoff) return;

    let low = 0;
    let high = len - 1;
    let pruneIndex = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.rollingTrades[mid].time < cutoff) {
        pruneIndex = mid + 1;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (pruneIndex > 0) {
      this.rollingTrades.splice(0, pruneIndex);
    }
  }

  // Multi-Timeframe Kayan İstatistik Motoru (1m, 5m, 15m)
  getBucketRollingStats(
    bucketKey: AllBucketTypes,
    tf: TimeframeOption = '1m',
    currentTime: number = Date.now()
  ): {
    rollingBuyVol: number;
    rollingSellVol: number;
    rollingDelta: number;
    rollingCount: number;
    directionalBias: number;
    aggressionScore: number;
  } {
    const windowMs = tf === '15m' ? 900_000 : tf === '5m' ? 300_000 : 60_000;
    const cutoff = currentTime - windowMs;

    let buyVol = 0;
    let sellVol = 0;
    let count = 0;

    for (let i = this.rollingTrades.length - 1; i >= 0; i--) {
      const t = this.rollingTrades[i];
      if (t.time < cutoff) break; // Kronolojik olduğundan geriye doğru hızlıca durur!

      if (t.bucket === bucketKey) {
        count++;
        if (t.isBuyerMaker) sellVol += t.notional;
        else buyVol += t.notional;
      }
    }

    const total = buyVol + sellVol;
    const directionalBias = total === 0 ? 50 : Math.round((buyVol / total) * 100);

    return {
      rollingBuyVol: Math.round(buyVol),
      rollingSellVol: Math.round(sellVol),
      rollingDelta: Math.round(buyVol - sellVol),
      rollingCount: count,
      directionalBias,
      aggressionScore: directionalBias,
    };
  }

  // Akıllı Sıralama ile Tüm Kovaları Getir
  getAllBucketsSorted(
    sortBy: SortOption = 'activity',
    tf: TimeframeOption = '1m',
    currentTime: number = Date.now()
  ): BucketStats[] {
    const list: BucketStats[] = [];

    const defaults: Array<{ key: BucketKey; name: string; icon: string; min: number; max: number; smart: boolean }> = [
      { key: 'shrimp', name: 'Karides (Noise)', icon: '🦐', min: 0, max: this.dynamicThresholds.shrimpMax, smart: false },
      { key: 'crab', name: 'Yengeç (Mid-Tier)', icon: '🦀', min: this.dynamicThresholds.shrimpMax, max: this.dynamicThresholds.crabMax, smart: false },
      { key: 'whale', name: 'Balina (Smart Money)', icon: '🐋', min: this.dynamicThresholds.crabMax, max: this.dynamicThresholds.whaleMax, smart: true },
      { key: 'leviathan', name: 'Leviathan (MM/Avcı)', icon: '🦑', min: this.dynamicThresholds.whaleMax, max: 999_999_999, smart: true },
    ];

    for (const d of defaults) {
      const s = this.stats[d.key] || { buyVol: 0, sellVol: 0, count: 0 };
      const r = this.getBucketRollingStats(d.key, tf, currentTime);
      list.push({
        id: d.key,
        name: d.name,
        icon: d.icon,
        buyVol: s.buyVol,
        sellVol: s.sellVol,
        count: s.count,
        rollingBuyVol: r.rollingBuyVol,
        rollingSellVol: r.rollingSellVol,
        rollingDelta: r.rollingDelta,
        rollingCount: r.rollingCount,
        directionalBias: r.directionalBias,
        aggressionScore: r.aggressionScore,
        minValue: d.min,
        maxValue: d.max,
        color: '#F43F5E',
        isSmartMoney: d.smart,
      });
    }

    for (const b of this.customBuckets) {
      if (!b.isActive) continue;
      const s = this.stats[b.id] || { buyVol: 0, sellVol: 0, count: 0 };
      const r = this.getBucketRollingStats(b.id, tf, currentTime);
      list.push({
        id: b.id,
        name: b.name,
        icon: b.icon,
        buyVol: s.buyVol,
        sellVol: s.sellVol,
        count: s.count,
        rollingBuyVol: r.rollingBuyVol,
        rollingSellVol: r.rollingSellVol,
        rollingDelta: r.rollingDelta,
        rollingCount: r.rollingCount,
        directionalBias: r.directionalBias,
        aggressionScore: r.aggressionScore,
        minValue: b.minValue,
        maxValue: b.maxValue,
        color: b.color,
        isSmartMoney: b.isSmartMoney,
      });
    }

    switch (sortBy) {
      case 'activity':
        list.sort((a, b) => (b.rollingCount ?? 0) - (a.rollingCount ?? 0) || b.count - a.count);
        break;
      case 'delta_desc':
        list.sort((a, b) => (b.rollingDelta ?? 0) - (a.rollingDelta ?? 0));
        break;
      case 'delta_asc':
        list.sort((a, b) => (a.rollingDelta ?? 0) - (b.rollingDelta ?? 0));
        break;
      case 'volume':
        list.sort((a, b) => ((b.rollingBuyVol ?? 0) + (b.rollingSellVol ?? 0)) - ((a.rollingBuyVol ?? 0) + (a.rollingSellVol ?? 0)));
        break;
      case 'hierarchy':
      default:
        list.sort((a, b) => (a.minValue ?? 0) - (b.minValue ?? 0));
        break;
    }

    return list;
  }

  // Multi-Timeframe Smart Money Uyumsuzluk Radarı (1m, 5m, 15m)
  getSmartMoneyDivergence(
    tf: TimeframeOption = '1m',
    currentTime: number = Date.now()
  ): SmartMoneyDivergence {
    const shrimpStats = this.getBucketRollingStats('shrimp', tf, currentTime);
    const whaleStats = this.getBucketRollingStats('whale', tf, currentTime);
    const leviathanStats = this.getBucketRollingStats('leviathan', tf, currentTime);

    let retailDelta = shrimpStats.rollingDelta;
    let smartDelta = whaleStats.rollingDelta + leviathanStats.rollingDelta;

    for (const b of this.customBuckets) {
      const stats = this.getBucketRollingStats(b.id, tf, currentTime);
      if (b.isSmartMoney) smartDelta += stats.rollingDelta;
      else if (b.maxValue <= 2000) retailDelta += stats.rollingDelta;
    }

    // Timeframe katsayısı (5m ve 15m'de eşikler ölçeklenir)
    const tfMultiplier = tf === '15m' ? 3.5 : tf === '5m' ? 2.0 : 1.0;
    const retailThresh = 500 * tfMultiplier;
    const smartThresh = 1000 * tfMultiplier;

    if (retailDelta < -retailThresh && smartDelta > smartThresh) {
      const conf = Math.min(99, Math.round(68 + (Math.abs(smartDelta) / (10_000 * tfMultiplier)) * 20));
      return {
        timeframe: tf,
        retailDelta,
        smartDelta,
        signal: 'ACCUMULATION',
        signalTitle: `🟢 BOĞA EMİLİMİ (${tf.toUpperCase()} SMART ACCUMULATION)`,
        signalDesc: 'Karidesler panikle satıyor, Balina ve Leviathan tüm satışı marketten emiyor! Yukarı patlama ihtimali yüksek.',
        confidence: conf,
        timestamp: currentTime,
      };
    }

    if (retailDelta > retailThresh && smartDelta < -smartThresh) {
      const conf = Math.min(99, Math.round(68 + (Math.abs(smartDelta) / (10_000 * tfMultiplier)) * 20));
      return {
        timeframe: tf,
        retailDelta,
        smartDelta,
        signal: 'DISTRIBUTION',
        signalTitle: `🔴 DAĞITIM & TUZAK (${tf.toUpperCase()} SMART DISTRIBUTION)`,
        signalDesc: 'Karidesler FOMO ile alıyor, Akıllı Para tepeden boşaltıyor! Tuzak kapısı kapanmak üzere.',
        confidence: conf,
        timestamp: currentTime,
      };
    }

    if (smartDelta > 2000 * tfMultiplier && retailDelta > 0) {
      return {
        timeframe: tf,
        retailDelta,
        smartDelta,
        signal: 'BULL_MOMENTUM',
        signalTitle: `⚡ GÜÇLÜ BOĞA AKIŞI (${tf.toUpperCase()} LONG MOMENTUM)`,
        signalDesc: 'Hem Akıllı Para hem piyasa tek yöne agresif alım pompalıyor. Trend yukarı yönlü ezici.',
        confidence: 85,
        timestamp: currentTime,
      };
    }

    if (smartDelta < -2000 * tfMultiplier && retailDelta < 0) {
      return {
        timeframe: tf,
        retailDelta,
        smartDelta,
        signal: 'BEAR_MOMENTUM',
        signalTitle: `⚡ GÜÇLÜ AYI BASKISI (${tf.toUpperCase()} SHORT MOMENTUM)`,
        signalDesc: 'Tahtada acımasız blok satışlar akıyor. Likidite alt kademelere süpürülüyor.',
        confidence: 85,
        timestamp: currentTime,
      };
    }

    return {
      timeframe: tf,
      retailDelta,
      smartDelta,
      signal: 'NEUTRAL',
      signalTitle: `⚖️ DENGELİ / NÖTR PİYASA (${tf.toUpperCase()})`,
      signalDesc: 'Akıllı para ve retail arasında net bir yön uyuşmazlığı yok, kademeler test ediliyor.',
      confidence: 50,
      timestamp: currentTime,
    };
  }
}

// 3. WEBSOCKET YÖNETİCİSİ - Otomatik Reconnect & Heartbeat (Teknik Eleştiri #5 Çözümü)
export class WSManager {
  bucketManager: BucketManager;
  ws: WebSocket | null = null;
  currentSymbol: string = '';
  isExplicitDisconnect: boolean = false;

  // Reconnect parametreleri
  reconnectAttempts: number = 0;
  maxReconnectDelayMs: number = 15_000;
  reconnectTimeoutId: any = null;
  autoReconnectEnabled: boolean = true;

  // Heartbeat / Sessizlik Takibi
  private lastMessageTime: number = 0;
  private heartbeatIntervalId: any = null;

  onTrade?: (trade: RecentTrade) => void;
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'error', message: string) => void;
  onLog?: (msg: string, type: 'info' | 'warn' | 'success' | 'error') => void;

  constructor(bucketManager: BucketManager) {
    this.bucketManager = bucketManager;
    this.currentSymbol = '';
  }

  connect(symbol: string): void {
    this.isExplicitDisconnect = false;
    this.currentSymbol = symbol.toLowerCase().trim();

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.onStatusChange) {
      this.onStatusChange('connecting', `Bağlanıyor: ${symbol.toUpperCase()}...`);
    }
    this.log(`🚀 BAŞLATILIYOR: ${symbol.toUpperCase()} stream ve bootstrap`, 'info');

    this.fetchBootstrapVolume();
    this.startSocket();
    this.startHeartbeatCheck();
  }

  private startSocket(): void {
    if (!this.currentSymbol) return;

    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const tradeUrl = `wss://fstream.binance.com/ws/${this.currentSymbol}@trade`;
    try {
      this.ws = new WebSocket(tradeUrl);
    } catch (e: any) {
      this.log(`❌ WS Başlatma Hatası: ${e.message}`, 'error');
      this.handleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastMessageTime = Date.now();
      this.log(`✅ WS BAĞLANDI: ${this.currentSymbol.toUpperCase()} Binance Futures stream canlı!`, 'success');

      this.updateStatusDOM(
        `Status: Bağlı (${this.currentSymbol.toUpperCase()})`,
        'p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-mono font-bold text-sm shadow-xs flex items-center gap-2'
      );

      if (this.onStatusChange) {
        this.onStatusChange('connected', `Bağlı (${this.currentSymbol.toUpperCase()})`);
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.lastMessageTime = Date.now();
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.p);
        const qty = parseFloat(data.q);
        const isBuyerMaker = Boolean(data.m);
        const tradeTime = data.T || Date.now();
        const tradeId = data.t || Date.now();

        // tradeTime zorunlu parametre olarak verilir!
        const { bucket, bucketName, bucketIcon, notionalValue } = this.bucketManager.processTrade(
          price,
          qty,
          isBuyerMaker,
          tradeTime
        );

        this.updatePriceDOM(price);

        if (this.onTrade) {
          this.onTrade({
            id: tradeId,
            price,
            qty,
            notional: notionalValue,
            isBuyerMaker,
            time: tradeTime,
            bucket,
            bucketName,
            bucketIcon,
          });
        }
      } catch (err: any) {
        console.error('Veri ayrıştırma hatası:', err);
      }
    };

    this.ws.onerror = () => {
      this.log(`❌ WS HATA: ${this.currentSymbol.toUpperCase()} akışında kopma oldu!`, 'error');
      this.updateStatusDOM(
        'Status: Bağlantı Hatası!',
        'p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-mono font-bold text-sm shadow-xs flex items-center gap-2'
      );
      if (this.onStatusChange) {
        this.onStatusChange('error', 'Bağlantı Hatası!');
      }
    };

    this.ws.onclose = () => {
      if (!this.isExplicitDisconnect) {
        this.log(`⚠️ WS KOPTU: Yeniden bağlanılıyor...`, 'warn');
        this.handleReconnect();
      } else {
        this.log(`ℹ️ WS KAPANDI: ${this.currentSymbol.toUpperCase()}`, 'info');
        this.updateStatusDOM(
          'Status: Bağlantı Kapalı',
          'p-3 bg-stone-100 text-stone-600 border border-stone-200 rounded-xl font-mono text-sm'
        );
      }
    };
  }

  // Exponential Backoff ile Otomatik Yeniden Bağlanma (Teknik Eleştiri #5)
  private handleReconnect(): void {
    if (this.isExplicitDisconnect || !this.autoReconnectEnabled || !this.currentSymbol) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelayMs);
    this.log(`🔄 Yeniden bağlantı deneniyor (${this.reconnectAttempts}. deneme, ${delay / 1000}s sonra)...`, 'warn');

    if (this.onStatusChange) {
      this.onStatusChange('connecting', `Yeniden bağlanılıyor (${this.reconnectAttempts})...`);
    }

    this.reconnectTimeoutId = setTimeout(() => {
      if (!this.isExplicitDisconnect) {
        this.startSocket();
      }
    }, delay);
  }

  // Heartbeat kontrolü - 12 saniye sessizlik olursa soket tıkalı demektir
  private startHeartbeatCheck(): void {
    if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
    this.heartbeatIntervalId = setInterval(() => {
      if (this.isExplicitDisconnect || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const silenceDuration = Date.now() - this.lastMessageTime;
      if (silenceDuration > 12_000) {
        this.log(`⏱️ Heartbeat Uyarısı: 12sn veri gelmedi, soket yenileniyor.`, 'warn');
        this.startSocket();
      }
    }, 4000);
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
          `📊 BOOTSTRAP: ${sym} 24s Hacim $${(quoteVol / 1_000_000).toFixed(1)}M | Çarpan: ${this.bucketManager.lastMultiplier}x`,
          'info'
        );
      })
      .catch((err) => {
        this.log(`⚠️ Bootstrap uyarısı: 24s hacim alınamadı (${err.message}), varsayılan eşiklerle devam ediliyor.`, 'warn');
      });
  }

  private updatePriceDOM(currentPrice: number): void {
    const priceElem = document.getElementById('price-val');
    if (priceElem) {
      priceElem.innerText = `$${currentPrice.toLocaleString(undefined, {
        minimumFractionDigits: currentPrice < 1 ? 4 : 2,
        maximumFractionDigits: currentPrice < 1 ? 6 : 2,
      })}`;
    }
  }

  private updateStatusDOM(text: string, className: string): void {
    const statusElem = document.getElementById('ws-status');
    if (statusElem) {
      statusElem.innerText = text;
      statusElem.className = className;
    }
  }

  disconnect(): void {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.onStatusChange) {
      this.onStatusChange('disconnected', 'Bağlantı Kesildi');
    }
    this.updateStatusDOM(
      'Status: Bağlantı Kesildi',
      'p-3 bg-stone-100 text-stone-600 border border-stone-200 rounded-xl font-mono text-sm'
    );
  }

  private log(msg: string, type: 'info' | 'warn' | 'success' | 'error'): void {
    if (this.onLog) {
      this.onLog(msg, type);
    }
  }
}

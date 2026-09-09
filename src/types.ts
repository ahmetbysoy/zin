export type BucketKey = 'shrimp' | 'crab' | 'whale' | 'leviathan';

export interface BucketStats {
  buyVol: number;
  sellVol: number;
  count: number;
  // 1-minute rolling window stats
  rolling1mBuyVol?: number;
  rolling1mSellVol?: number;
  rolling1mCount?: number;
  rolling1mDelta?: number;
  directionalBias?: number; // 0-100
  aggressionScore?: number; // 0-100
}

export interface BucketThresholds {
  shrimpMax: number;
  crabMax: number;
  whaleMax: number;
}

export interface TimedTradeItem {
  time: number;
  notional: number;
  isBuyerMaker: boolean;
  bucket: BucketKey;
}

export interface SmartMoneyDivergence {
  retailDelta1m: number;
  smartDelta1m: number;
  signal: 'ACCUMULATION' | 'DISTRIBUTION' | 'BULL_MOMENTUM' | 'BEAR_MOMENTUM' | 'NEUTRAL';
  signalTitle: string;
  signalDesc: string;
  confidence: number;
}

export interface RecentTrade {
  id: number;
  price: number;
  qty: number;
  notional: number;
  isBuyerMaker: boolean;
  time: number;
  bucket: BucketKey;
}

export interface EngineStatsState {
  shrimp: BucketStats;
  crab: BucketStats;
  whale: BucketStats;
  leviathan: BucketStats;
}

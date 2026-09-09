export interface BucketConfig {
  id: string;
  name: string;
  minUsdt: number;
  maxUsdt: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  isSmartMoney?: boolean;
}

export interface BucketStats {
  id: string;
  name: string;
  buyVol: number;
  sellVol: number;
  count: number;
  rolling1mBuyVol: number;
  rolling1mSellVol: number;
  rolling1mCount: number;
  rolling1mDelta: number;
  directionalBias: number; // 0-100
  aggressionScore: number; // 0-100
  config: BucketConfig;
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
  bucketId: string;
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
  bucketId: string;
  bucketName: string;
  bucketIcon: string;
}

export type ActiveTab = 'analysis' | 'wallets' | 'settings';
export type SortOption = 'activity' | 'delta_desc' | 'delta_asc' | 'volume' | 'hierarchy';

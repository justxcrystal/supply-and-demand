export type MarketKind = "index" | "crypto" | "fx" | "metal" | "future";
export type Book = "forex" | "futures";
export type Signal = "BUY" | "SELL" | "WAIT";
export type ZoneType = "DEMAND" | "SUPPLY";
export type Bias = "bull" | "bear" | "neutral";
export type AmdPhase = "accumulation" | "manipulation" | "distribution" | "none";
export type TpKey = "off" | "tp1" | "tp2" | "tp3" | "tp4" | "tp5" | "tp6";

export type Market = {
  id: string;
  yahoo: string;
  name: string;
  kind: MarketKind;
  book: Book;
  pip: number;
  digits: number;
  wb?: string;
};

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Zone = {
  type: ZoneType;
  a: number;
  b: number;
  top: number;
  bot: number;
  distal: number;
  proximal: number;
  fresh: boolean;
  touches: number;
  score: number;
};

export type Setup = Zone & {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tps?: number[];
  atr: number;
  rr: number;
  signal: Signal;
  reason: string;
};

export type AmdModel = {
  phase: AmdPhase;
  side: "BUY" | "SELL" | null;
  mss: boolean;
  acc?: { a: number; b: number; top: number; bot: number };
  zone?: Zone;
  manip?: { i: number; extreme: number };
  dist?: { i: number };
};

export type Issue = {
  level: "block" | "warn" | "info";
  title: string;
  detail: string;
};

export type Analysis = {
  zones: Zone[];
  signal: Signal;
  setup: Setup | null;
  bias: Bias;
  atr?: number;
  last?: Candle;
  amd?: AmdModel;
  issues?: Issue[];
  executable?: boolean;
};

export type PaperFill = {
  id: string;
  sym: string;
  side: "BUY" | "SELL";
  entry: string;
  r: string;
  t: string;
};

export type ClosedTrade = PaperFill & {
  exit: number;
  pnl: number;
  rMult: number;
  reason: string;
};

export type Position = {
  id: string;
  sym: string;
  side: "BUY" | "SELL";
  entry: number;
  sl: number;
  initSl: number;
  tp1: number;
  tp2: number;
  tps: number[];
  riskPct: number;
  riskAmt: number;
  openedAt: string;
  trailLabel: string;
  hitTp: number;
  account: string;
};

export type BacktestStats = {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  netR: number;
  winRate: number;
  expectancy: number;
  maxDd: number;
  curve: number[];
};

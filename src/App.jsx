/* global BigInt */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { ethers } from 'ethers';
import { Wallet, ArrowDownRight, ArrowUpRight, Coins, TrendingUp, ShieldCheck, Zap, BarChart3, History, CheckCircle2, Lock, BrainCircuit, Network, Cpu, Clock, ArrowRight, Shield, ExternalLink, ChevronDown, Sparkles, Eye, Copy, X, AlertTriangle, Settings, ArrowLeftRight, Loader2, RefreshCw, Share2, Users, Star, Trophy, Target, UserPlus, Crown, Menu, BookOpen, FileText, Code, GitBranch, Play } from 'lucide-react';
import { LiFiWidget } from '@lifi/widget';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import CONTRACT_ABI from './contractABI.json';
import MARKETPLACE_ABI from './marketplaceABI.json';
import './index.css';

// ===== SUPABASE =====
const supabase = createClient(
  'https://iqrdexbrkhhmuzidlwni.supabase.co',
  'sb_publishable_wj2j8y7-HVbaqx2CvEuDhQ_C3Oa09C9'
);

const queryClient = new QueryClient();

// ===== PYTH PRICE FEED (same source as gTrade) =====
const PYTH_XAU_USD_FEED = "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const PYTH_HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";

// ===== ARBITRUM CONFIG =====
const CONTRACT_ADDRESS = "0xbE1E770670a0186772594ED381F573B3161029a2";
const MARKETPLACE_ADDRESS = "0x63E44E8319187115C1802D40750D69773d5B1468";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Native USDC on Arbitrum
const ARBITRUM_CHAIN_ID = "0xa4b1"; // 42161

// ===== MULTI-CHAIN: BSC CONFIG =====
const BSC_CHAIN_ID = "0x38"; // 56
const BSC_TOKENS = {
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18 },
  USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18 },
};
const LIFI_API = "https://li.quest/v1";

// BSC USDT/USDC addresses for receiving on BSC
const BSC_USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

// Fetch bridge quote from Li.Fi API (supports both directions)
async function getBridgeQuote(fromToken, fromAmount, fromAddress, direction = "toBridge") {
  const params = new URLSearchParams({
    fromChain: direction === "toBridge" ? "56" : "42161",
    toChain: direction === "toBridge" ? "42161" : "56",
    fromToken: fromToken,
    toToken: direction === "toBridge" ? USDC_ADDRESS : BSC_USDT_ADDRESS,
    fromAmount: fromAmount,
    fromAddress: fromAddress,
    slippage: "0.05",
  });
  const res = await fetch(`${LIFI_API}/quote?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to get bridge quote");
  }
  return res.json();
}

// Check bridge transaction status
async function getBridgeStatus(txHash, bridge, fromChain, toChain) {
  const params = new URLSearchParams({ txHash, bridge, fromChain: String(fromChain), toChain: String(toChain) });
  const res = await fetch(`${LIFI_API}/status?${params}`);
  return res.json();
}

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const USDC_DECIMALS = 6;
const PRICE_PRECISION = 1e10; // gTrade uses 1e10 for prices
const LEVERAGE_PRECISION = 1000; // gTrade uses 1e3 for leverage

// Animation variants
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.7, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] }
  })
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }
  })
};

const slideInLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] } }
};

const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] } }
};

// Particle config
const particlesOptions = {
  fullScreen: false,
  particles: {
    number: { value: 60, density: { enable: true, area: 1000 } },
    color: { value: ["#D4A843", "#F0D078", "#9A7B2E", "#ffffff"] },
    shape: { type: "circle" },
    opacity: { value: { min: 0.1, max: 0.5 }, animation: { enable: true, speed: 0.5, minimumValue: 0.1 } },
    size: { value: { min: 1, max: 3 }, animation: { enable: true, speed: 1, minimumValue: 0.5 } },
    move: { enable: true, speed: 0.6, direction: "none", outModes: { default: "out" } },
    links: { enable: true, distance: 120, color: "#D4A843", opacity: 0.08, width: 1 },
  },
  detectRetina: true,
};

// Animated gradient border component
function GlowCard({ children, className = "", delay = 0, gold = false }) {
  return (
    <motion.div
      className={`glow-card-wrapper ${gold ? 'glow-card-gold' : ''}`}
      variants={fadeUp}
      custom={delay}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      whileHover={{ y: -6, transition: { duration: 0.3 } }}
    >
      <div className={`glow-card ${className}`}>
        {children}
      </div>
    </motion.div>
  );
}

// Floating badge component
function FloatingBadge({ icon, text, className = "" }) {
  return (
    <motion.div
      className={`floating-badge ${className}`}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      {icon}
      <span>{text}</span>
    </motion.div>
  );
}

// Helper: format gTrade price (1e10 precision) to readable
function formatGTradePrice(price) {
  return (Number(price) / PRICE_PRECISION).toFixed(2);
}

// Pro progress bar for SL → Entry → TP
function TradeProgressBar({ entry, tp, sl, currentPrice, isLong, showPrices }) {
  if (!currentPrice) return null;
  const range = Math.abs(tp - sl);
  const progress = isLong
    ? Math.max(0, Math.min(100, ((currentPrice - sl) / range) * 100))
    : Math.max(0, Math.min(100, ((sl - currentPrice) / range) * 100));
  const entryPos = isLong
    ? ((entry - sl) / range) * 100
    : ((sl - entry) / range) * 100;
  const pnlPct = isLong
    ? ((currentPrice - entry) / entry) * 100
    : ((entry - currentPrice) / entry) * 100;
  const isProfit = pnlPct >= 0;
  const distToTP = isLong ? ((tp - currentPrice) / (tp - entry)) * 100 : ((currentPrice - tp) / (entry - tp)) * 100;
  const pctToTP = Math.max(0, Math.min(100, 100 - distToTP));
  const nearSL = progress < 20;
  const nearTP = progress > 80;
  const pulseSpeed = nearSL || nearTP ? '0.8s' : '2s';

  return (
    <div style={{ marginBottom: '2px' }}>
      <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        {/* Gradient fill from SL to current price */}
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${progress}%`, borderRadius: '3px',
          background: nearSL
            ? 'linear-gradient(90deg, rgba(248,113,113,0.8), rgba(248,113,113,0.4))'
            : nearTP
              ? 'linear-gradient(90deg, rgba(52,211,153,0.3), rgba(52,211,153,0.8))'
              : `linear-gradient(90deg, rgba(248,113,113,0.4) 0%, rgba(212,168,67,0.4) ${entryPos}%, rgba(52,211,153,0.5) 100%)`,
          transition: 'width 0.5s ease',
          boxShadow: nearSL ? '0 0 8px rgba(248,113,113,0.3)' : nearTP ? '0 0 8px rgba(52,211,153,0.3)' : 'none',
        }} />
        {/* Entry marker */}
        <div style={{
          position: 'absolute', left: `${entryPos}%`, top: 0,
          width: '1px', height: '100%', background: 'rgba(255,255,255,0.25)',
        }} />
        {/* Current price dot */}
        <div style={{
          position: 'absolute', top: '-3px', left: `${progress}%`, transform: 'translateX(-50%)',
          width: '12px', height: '12px', borderRadius: '50%',
          background: isProfit ? '#34D399' : '#F87171',
          border: '2px solid rgba(0,0,0,0.3)',
          boxShadow: `0 0 ${nearSL || nearTP ? '12px' : '6px'} ${isProfit ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)'}`,
          transition: 'left 0.5s ease',
          animation: `pulse ${pulseSpeed} ease-in-out infinite`,
        }} />
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <span style={{ fontSize: '0.55rem', color: 'var(--danger)', fontFamily: "'Space Grotesk', sans-serif" }}>
          SL {showPrices ? `$${sl.toFixed(0)}` : `${String(sl.toFixed(0)).slice(0, 2)}••`}
        </span>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
          color: isProfit ? 'var(--success)' : 'var(--danger)',
        }}>
          {Math.round(pctToTP)}% to TP
        </span>
        <span style={{ fontSize: '0.55rem', color: 'var(--success)', fontFamily: "'Space Grotesk', sans-serif" }}>
          TP {showPrices ? `$${tp.toFixed(0)}` : `${String(tp.toFixed(0)).slice(0, 2)}••`}
        </span>
      </div>
    </div>
  );
}

// Helper: format leverage (1e3 precision)
// Provider level badges
function getProviderLevel(totalTrades, winRate) {
  if (totalTrades >= 50 && winRate >= 80) return { label: 'Diamond', color: '#B9F2FF', bg: 'rgba(185,242,255,0.12)', border: 'rgba(185,242,255,0.25)' };
  if (totalTrades >= 30 && winRate >= 70) return { label: 'Gold', color: '#D4A843', bg: 'rgba(212,168,67,0.12)', border: 'rgba(212,168,67,0.25)' };
  if (totalTrades >= 15 && winRate >= 60) return { label: 'Silver', color: '#C0C0C0', bg: 'rgba(192,192,192,0.12)', border: 'rgba(192,192,192,0.25)' };
  if (totalTrades >= 5) return { label: 'Bronze', color: '#CD7F32', bg: 'rgba(205,127,50,0.12)', border: 'rgba(205,127,50,0.25)' };
  return null;
}

function formatLeverage(lev) {
  return (Number(lev) / LEVERAGE_PRECISION).toFixed(0);
}

// Helper: time ago
function timeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Helper: check if gold (XAU/USD) market is open
// Gold trades Sun 23:00 UTC – Fri 22:00 UTC, with daily break 22:00–23:00 UTC
function getGoldMarketStatus() {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcTime = utcHour + utcMin / 60;

  // Weekend: closed from Fri 22:00 UTC until Sun 23:00 UTC
  if (utcDay === 6) return { open: false, reason: 'Weekend — market closed' };
  if (utcDay === 0 && utcTime < 23) return { open: false, reason: 'Weekend — market opens Sunday 23:00 UTC' };
  if (utcDay === 5 && utcTime >= 22) return { open: false, reason: 'Weekend — market closed until Sunday 23:00 UTC' };

  // Daily maintenance break: 22:00–23:00 UTC (Mon–Thu)
  if (utcTime >= 22 && utcTime < 23) return { open: false, reason: 'Daily break — reopens at 23:00 UTC' };

  return { open: true, reason: '' };
}

function friendlyError(err) {
  const msg = (err.reason || err.message || "").toLowerCase();
  if (msg.includes("not accepting deposits") || msg.includes("not collecting")) return "This trade is already live. Turn on Auto-Copy to join the next one automatically.";
  if (msg.includes("already deposited") || msg.includes("already copied")) return "You already joined this trade.";
  if (msg.includes("min 5")) return "Minimum deposit is 5 USDC.";
  if (msg.includes("max 50000")) return "Maximum deposit is 50,000 USDC.";
  if (msg.includes("pool full")) return "The pool is full for this trade.";
  if (msg.includes("no active signal")) return "No active trade right now. Wait for the next signal.";
  if (msg.includes("not settled")) return "This trade is still open. You can claim after it closes.";
  if (msg.includes("already claimed")) return "You already claimed this trade.";
  if (msg.includes("no position")) return "You don't have a position in this trade.";
  if (msg.includes("insufficient") || msg.includes("exceeds balance")) return "Not enough USDC in your wallet.";
  if (msg.includes("user rejected") || msg.includes("user denied")) return "Transaction cancelled.";
  if (msg.includes("transfer failed")) return "USDC transfer failed. Make sure you have enough USDC and have approved the contract.";
  return "Something went wrong. Please try again.";
}

function App() {
  const [account, setAccount] = useState("");
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "invest";
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [particlesReady, setParticlesReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [legacyClaimed, setLegacyClaimed] = useState(false);
  const [marketStatus, setMarketStatus] = useState(getGoldMarketStatus);

  // Gold AI analysis State
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [liveGoldPrice, setLiveGoldPrice] = useState(null);
  const [priceFlash, setPriceFlash] = useState(null); // 'up' | 'down' | null

  // Blockchain State
  const [walletUSDC, setWalletUSDC] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [autoCopyConfig, setAutoCopyConfig] = useState({ enabled: false, amount: 0 });
  const [autoCopyAmount, setAutoCopyAmount] = useState('');
  const [autoCopyLoading, setAutoCopyLoading] = useState(false);

  // Referral State
  const [referrer, setReferrer] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [referralStats, setReferralStats] = useState({ count: 0, volume: 0, referrals: [] });
  const [referralCopied, setReferralCopied] = useState(false);

  // Signal State
  const [activeSignal, setActiveSignal] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [userPositions, setUserPositions] = useState({});
  const [signalCount, setSignalCount] = useState(0);
  const [uniqueCopiers, setUniqueCopiers] = useState(0);
  const [feePercent, setFeePercent] = useState(2000); // 20% default (contract uses basis points: 2000 = 20%)
  const [totalVolume, setTotalVolume] = useState(0); // Sum of totalCopied across ALL signals (not just last 20)
  const [livePrice, setLivePrice] = useState(null); // Live XAU/USD from Pyth
  const [contractBalance, setContractBalance] = useState(null); // USDC balance in contract
  const prevActiveSignalRef = useRef(null);

  // Marketplace state
  const [marketplaceProviders, setMarketplaceProviders] = useState([]);
  const [userFollows, setUserFollows] = useState({}); // { providerAddr: { amount, enabled } }
  const [followLoading, setFollowLoading] = useState(false);

  // Performance stats computed from signal history + user positions
  const performanceStats = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const utcNow = new Date(); const todayCutoff = Math.floor(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate()) / 1000);
    const WEEK = 7 * 86400;
    const MONTH = 30 * 86400;

    // Filter out cancels (totalReturned === totalCopied means full refund / cancel)
    const closedSignals = signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0);
    const mySignals = closedSignals.filter(s => userPositions[Number(s.id)]);

    const calcPnl = (signals, since) => {
      const filtered = since
        ? signals.filter(s => Number(s.closedAt) >= since)
        : signals;
      let totalPnl = 0;
      let wins = 0;
      let losses = 0;
      let totalCollateral = 0;

      for (const s of filtered) {
        const pos = userPositions[Number(s.id)];
        const col = pos ? parseFloat(ethers.formatUnits(pos.deposit, 6)) : 0;
        const resultPct = Number(s.resultPct) / 100; // V2: already total PnL %
        const pnl = col * (resultPct / 100);
        totalPnl += pnl;
        totalCollateral += col;
        if (Number(s.resultPct) > 0) wins++;
        else if (Number(s.resultPct) < 0) losses++;
      }

      return { pnl: totalPnl, wins, losses, trades: filtered.length, totalCollateral };
    };

    // Platform-wide stats (all signals, not just user's)
    const calcPlatformPnl = (signals, since) => {
      const filtered = since
        ? signals.filter(s => Number(s.closedAt) >= since)
        : signals;
      let wins = 0;
      let losses = 0;
      let totalCopied = 0;
      let avgPnl = 0;

      for (const s of filtered) {
        if (s.tradePct > 0) wins++;
        else if (s.tradePct < 0) losses++;
        totalCopied += parseFloat(ethers.formatUnits(s.totalCopied || 0n, 6));
        avgPnl += s.tradePct;
      }

      return { wins, losses, trades: filtered.length, winRate: filtered.length > 0 ? (wins / filtered.length * 100) : 0, totalCopied, avgPnl: filtered.length > 0 ? avgPnl / filtered.length : 0 };
    };

    return {
      my: {
        today: calcPnl(mySignals, todayCutoff),
        week: calcPnl(mySignals, now - WEEK),
        month: calcPnl(mySignals, now - MONTH),
        all: calcPnl(mySignals, null),
      },
      platform: {
        today: calcPlatformPnl(closedSignals, todayCutoff),
        week: calcPlatformPnl(closedSignals, now - WEEK),
        month: calcPlatformPnl(closedSignals, now - MONTH),
        all: calcPlatformPnl(closedSignals, null),
      },
    };
  }, [signalHistory, userPositions]);

  // Copy Trade Form
  const [copyAmount, setCopyAmount] = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);

  // Admin Signal Form
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [signalGen, setSignalGen] = useState({ tpDistance: '20', slDistance: '30', leverage: '28' });
  const [signalForm, setSignalForm] = useState({
    long: true,
    entryPrice: '',
    tp: '',
    sl: '',
    leverage: '28'
  });
  const [closeSignalId, setCloseSignalId] = useState('');
  const [closeResultPct, setCloseResultPct] = useState('');
  const [settleTotalReturned, setSettleTotalReturned] = useState('');

  // Transaction history
  const [transactions, setTransactions] = useState([]);

  // Bridge modal state
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [currentChainId, setCurrentChainId] = useState(null);
  const [bridgeDirection, setBridgeDirection] = useState("toArbitrum"); // "toArbitrum" or "toBSC"
  const [bridgeToken, setBridgeToken] = useState("USDT");
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [bridgeQuote, setBridgeQuote] = useState(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState(""); // "", "quoting", "approving", "bridging", "waiting", "done", "error"
  const [bridgeError, setBridgeError] = useState("");
  const [bscBalance, setBscBalance] = useState({ USDT: 0, USDC: 0 });
  const [arbUsdcBalance, setArbUsdcBalance] = useState(0);

  // Contract refs
  const providerRef = useRef(null);
  const signerRef = useRef(null);
  const contractRef = useRef(null);
  const usdcRef = useRef(null);

  // Init particles
  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setParticlesReady(true));

    // Hide SEO content once React mounts
    const seo = document.getElementById('seo-content');
    if (seo) seo.style.display = 'none';
  }, []);

  // Update canonical, title, meta per tab
  useEffect(() => {
    const base = 'https://www.smarttradingclub.io';
    const meta = {
      invest: { url: base + '/', title: 'Smart Trading Club — Best On-Chain Gold Copy Trading Platform 2026', desc: 'Copy live gold (XAU/USD) trades on Arbitrum. Best crypto copy trading platform. Auto-copy, 50% referral rewards, USDC profits.' },
      dashboard: { url: base + '/?tab=dashboard', title: 'Copy Gold Trades Dashboard — Smart Trading Club', desc: 'Copy live gold signals on Arbitrum. Auto-copy mode, manage positions, track profits. On-chain copy trading with USDC.' },
      results: { url: base + '/?tab=results', title: 'Gold Trading Results & Performance — Smart Trading Club', desc: 'Verified on-chain gold trading results. Win rate, profit history, and trade performance on Arbitrum.' },
      referral: { url: base + '/?tab=referral', title: 'Earn 50% Referral Rewards — Smart Trading Club', desc: 'Earn 50% of platform fees by referring friends to Smart Trading Club. Share your link, earn USDC automatically.' },
      docs: { url: base + '/?tab=docs', title: 'Smart Contract Documentation — Smart Trading Club', desc: 'GoldCopyTraderV3 smart contract documentation. Audited, 323 tests, fully transparent on-chain copy trading.' },
    };
    const m = meta[activeTab] || meta.invest;
    document.title = m.title;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', m.url);
    document.querySelector('meta[name="description"]')?.setAttribute('content', m.desc);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', m.url);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', m.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', m.desc);
  }, [activeTab]);

  // Read referrer from URL (?ref=0x...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.startsWith('0x') && ref.length === 42) {
      setReferrer(ref.toLowerCase());
      localStorage.setItem('stc_referrer', ref.toLowerCase());
    } else {
      const stored = localStorage.getItem('stc_referrer');
      if (stored) setReferrer(stored);
    }
  }, []);

  // Gold AI analysis loader — fires when wallet connects and tab is analysis
  const loadAnalysis = async (force = false) => {
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const url = force ? '/api/analyze-gold?refresh=1' : '/api/analyze-gold';
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setAnalysisData(data);
    } catch (e) {
      setAnalysisError(e.message || 'Failed to load analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    if (!account || activeTab !== 'analysis') return;
    if (!analysisData) loadAnalysis(false);
    const id = setInterval(() => loadAnalysis(false), 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, activeTab]);

  // Live Pyth price ticker — polls every 4s while on the analysis tab so the
  // chart and the verdict card always show what the market is doing now,
  // not what the analysis cached 5 minutes ago.
  useEffect(() => {
    if (activeTab !== 'analysis') {
      setLiveGoldPrice(null);
      setPriceFlash(null);
      return;
    }
    let cancelled = false;
    let prev = null;
    let flashTimeout;
    const tick = async () => {
      try {
        const r = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2', { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return;
        const d = await r.json();
        const p = d.parsed?.[0]?.price;
        if (!p) return;
        const next = Number(p.price) * Math.pow(10, Number(p.expo));
        if (cancelled) return;
        if (prev != null) {
          const diff = next - prev;
          if (diff > 0.01) setPriceFlash('up');
          else if (diff < -0.01) setPriceFlash('down');
          if (flashTimeout) clearTimeout(flashTimeout);
          flashTimeout = setTimeout(() => !cancelled && setPriceFlash(null), 600);
        }
        prev = next;
        setLiveGoldPrice(next);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); if (flashTimeout) clearTimeout(flashTimeout); };
  }, [activeTab]);

  // Generate referral link + load stats when wallet connects
  useEffect(() => {
    if (!account) return;
    setReferralLink(`https://www.smarttradingclub.io/?ref=${account}`);

    const loadReferralStats = async () => {
      try {
        const { data } = await supabase
          .from('referrals')
          .select('*')
          .eq('referrer', account.toLowerCase());
        if (data) {
          setReferralStats({
            count: data.length,
            volume: data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
            referrals: data,
          });
        }
      } catch (err) {
        console.error('Referral stats error:', err);
      }
    };
    loadReferralStats();
  }, [account]);

  // Scroll detection for navbar
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Update gold market status every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      try { setMarketStatus(getGoldMarketStatus()); } catch (e) { console.error('marketStatus poll', e); }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  // Detect current chain
  useEffect(() => {
    if (!window.ethereum) return;
    const checkChain = async () => {
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        setCurrentChainId(chainId);
      } catch {}
    };
    checkChain();
    const handleChainChanged = (chainId) => setCurrentChainId(chainId);
    window.ethereum.on('chainChanged', handleChainChanged);
    return () => window.ethereum.removeListener('chainChanged', handleChainChanged);
  }, []);

  const isOnBSC = currentChainId === BSC_CHAIN_ID;
  const isOnArbitrum = currentChainId === ARBITRUM_CHAIN_ID;

  // Load BSC token balances when on BSC
  useEffect(() => {
    if (!isOnBSC || !account || !window.ethereum) return;
    const loadBscBalances = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const usdtContract = new ethers.Contract(BSC_TOKENS.USDT.address, ERC20_ABI, provider);
        const usdcContract = new ethers.Contract(BSC_TOKENS.USDC.address, ERC20_ABI, provider);
        const [usdtBal, usdcBal] = await Promise.all([
          usdtContract.balanceOf(account),
          usdcContract.balanceOf(account),
        ]);
        setBscBalance({
          USDT: parseFloat(ethers.formatUnits(usdtBal, 18)),
          USDC: parseFloat(ethers.formatUnits(usdcBal, 18)),
        });
      } catch (err) {
        console.error("BSC balance error:", err);
      }
    };
    loadBscBalances();
  }, [isOnBSC, account]);

  // Load Arbitrum USDC balance for bridge-back
  useEffect(() => {
    if (!isOnArbitrum || !account || !window.ethereum) return;
    const loadArbBalance = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
        const bal = await usdcContract.balanceOf(account);
        setArbUsdcBalance(parseFloat(ethers.formatUnits(bal, 6)));
      } catch (err) {
        console.error("Arbitrum balance error:", err);
      }
    };
    loadArbBalance();
  }, [isOnArbitrum, account]);

  // Get bridge quote
  const handleGetQuote = async () => {
    if (!bridgeAmount || !account || Number(bridgeAmount) <= 0) return;
    setBridgeLoading(true);
    setBridgeStatus("quoting");
    setBridgeError("");
    setBridgeQuote(null);
    try {
      let fromTokenAddr, amountWei, direction;
      if (bridgeDirection === "toArbitrum") {
        const token = BSC_TOKENS[bridgeToken];
        fromTokenAddr = token.address;
        amountWei = ethers.parseUnits(bridgeAmount, token.decimals).toString();
        direction = "toBridge";
      } else {
        fromTokenAddr = USDC_ADDRESS;
        amountWei = ethers.parseUnits(bridgeAmount, 6).toString();
        direction = "fromBridge";
      }
      const quote = await getBridgeQuote(fromTokenAddr, amountWei, account, direction);
      setBridgeQuote(quote);
      setBridgeStatus("");
    } catch (err) {
      setBridgeError(err.message || "Failed to get quote");
      setBridgeStatus("error");
    } finally {
      setBridgeLoading(false);
    }
  };

  // Execute bridge transaction
  const handleBridge = async () => {
    if (!bridgeQuote || !account) return;
    setBridgeLoading(true);
    setBridgeError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Step 1: Get a FRESH quote (old quotes expire quickly)
      setBridgeStatus("quoting");
      console.log("[Bridge] Getting fresh quote...", { bridgeDirection, bridgeToken, bridgeAmount });
      let freshQuote;
      if (bridgeDirection === "toArbitrum") {
        const token = BSC_TOKENS[bridgeToken];
        const amountWei = ethers.parseUnits(bridgeAmount, token.decimals).toString();
        freshQuote = await getBridgeQuote(token.address, amountWei, account, "toBridge");
      } else {
        const amountWei = ethers.parseUnits(bridgeAmount, 6).toString();
        freshQuote = await getBridgeQuote(USDC_ADDRESS, amountWei, account, "fromBridge");
      }
      console.log("[Bridge] Quote received:", {
        tool: freshQuote.tool,
        approvalAddr: freshQuote.estimate?.approvalAddress,
        toAmount: freshQuote.estimate?.toAmount,
        steps: freshQuote.includedSteps?.map(s => s.type),
        txTo: freshQuote.transactionRequest?.to,
      });

      // Step 2: Approve on the fresh quote's approval address
      const fromTokenAddr = freshQuote.action?.fromToken?.address;
      const approvalAddr = freshQuote.estimate?.approvalAddress;
      if (fromTokenAddr && fromTokenAddr !== "0x0000000000000000000000000000000000000000" && approvalAddr) {
        setBridgeStatus("approving");
        const tokenContract = new ethers.Contract(fromTokenAddr, ERC20_ABI, signer);
        const allowance = await tokenContract.allowance(account, approvalAddr);
        const requiredAmount = BigInt(freshQuote.action.fromAmount);
        console.log("[Bridge] Allowance:", allowance.toString(), "Required:", requiredAmount.toString());
        if (BigInt(allowance) < requiredAmount) {
          if (BigInt(allowance) > 0n) {
            console.log("[Bridge] Resetting allowance to 0...");
            const resetTx = await tokenContract.approve(approvalAddr, 0);
            await resetTx.wait();
          }
          console.log("[Bridge] Approving max...");
          const approveTx = await tokenContract.approve(approvalAddr, ethers.MaxUint256);
          await approveTx.wait();
          console.log("[Bridge] Approved!");
        } else {
          console.log("[Bridge] Already approved");
        }
      }

      // Step 3: Send bridge transaction via ethers signer (same method as working CLI test)
      setBridgeStatus("bridging");
      const txReq = freshQuote.transactionRequest;
      console.log("[Bridge] Sending tx:", { to: txReq.to, value: txReq.value, gasLimit: txReq.gasLimit, gasPrice: txReq.gasPrice, dataLen: txReq.data?.length });
      // Build tx based on network
      const quotedGas = txReq.gasLimit ? BigInt(txReq.gasLimit) : 500000n;
      const safeGasLimit = quotedGas * 150n / 100n;
      const txParams = {
        to: txReq.to,
        data: txReq.data,
        value: txReq.value || "0x0",
        gasLimit: safeGasLimit,
      };
      // BSC = legacy tx, Arbitrum = EIP-1559
      if (bridgeDirection === "toArbitrum") {
        txParams.type = 0;
        txParams.gasPrice = txReq.gasPrice;
      }
      const tx = await signer.sendTransaction(txParams);
      console.log("[Bridge] Tx sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("[Bridge] Tx confirmed:", receipt.status);

      // Step 3: Poll for bridge completion
      setBridgeStatus("waiting");
      const bridge = bridgeQuote.tool;
      const fromChainId = bridgeDirection === 'toArbitrum' ? 56 : 42161;
      const toChainId = bridgeDirection === 'toArbitrum' ? 42161 : 56;
      let completed = false;
      for (let i = 0; i < 60; i++) { // max 5 min polling
        await new Promise(r => setTimeout(r, 5000));
        try {
          const status = await getBridgeStatus(receipt.hash, bridge, fromChainId, toChainId);
          if (status.status === "DONE") {
            completed = true;
            break;
          }
          if (status.status === "FAILED") {
            throw new Error("Bridge transaction failed");
          }
        } catch {}
      }

      setBridgeStatus("done");
      setBridgeQuote(null);
      setBridgeAmount("");

      // Refresh BSC balances
      if (isOnBSC) {
        const usdtContract = new ethers.Contract(BSC_TOKENS.USDT.address, ERC20_ABI, provider);
        const usdcContract = new ethers.Contract(BSC_TOKENS.USDC.address, ERC20_ABI, provider);
        const [usdtBal, usdcBal] = await Promise.all([
          usdtContract.balanceOf(account),
          usdcContract.balanceOf(account),
        ]);
        setBscBalance({
          USDT: parseFloat(ethers.formatUnits(usdtBal, 18)),
          USDC: parseFloat(ethers.formatUnits(usdcBal, 18)),
        });
      }
    } catch (err) {
      console.error("Bridge error:", err);
      let errorMsg = "Bridge failed";
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        errorMsg = "Transaction rejected in wallet";
      } else if (err.code === "INSUFFICIENT_FUNDS") {
        errorMsg = "Not enough BNB for gas fees";
      } else if (err.reason) {
        errorMsg = err.reason;
      } else if (err.shortMessage) {
        errorMsg = err.shortMessage;
      } else if (err.message) {
        errorMsg = err.message.length > 100 ? err.message.slice(0, 100) + "..." : err.message;
      }
      setBridgeError(errorMsg);
      setBridgeStatus("error");
    } finally {
      setBridgeLoading(false);
    }
  };

  // Switch to Arbitrum network
  const switchToArbitrum = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARBITRUM_CHAIN_ID }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARBITRUM_CHAIN_ID,
            chainName: 'Arbitrum One',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://arb1.arbitrum.io/rpc'],
            blockExplorerUrls: ['https://arbiscan.io/'],
          }],
        });
      }
    }
  };

  // Load public data (no wallet needed) — for Results page & homepage stats
  const loadPublicData = useCallback(async () => {
    try {
      // Try multiple public RPCs — arb1.arbitrum.io is heavily rate-limited on mobile
      const RPC_ENDPOINTS = [
        "https://arbitrum-one.publicnode.com",
        "https://arb-mainnet.public.blastapi.io",
        "https://arbitrum.llamarpc.com",
        "https://arb1.arbitrum.io/rpc",
      ];
      let publicProvider = null;
      for (const rpc of RPC_ENDPOINTS) {
        try {
          const prov = new ethers.JsonRpcProvider(rpc);
          await prov.getBlockNumber(); // quick health check
          publicProvider = prov;
          break;
        } catch { /* try next */ }
      }
      if (!publicProvider) publicProvider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[RPC_ENDPOINTS.length - 1]);
      const publicContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, publicProvider);

      const count = await publicContract.signalCount();
      setSignalCount(Number(count));
      const fee = await publicContract.feePercent();
      setFeePercent(Number(fee));

      try {
        const copierCount = await publicContract.getAutoCopyUserCount();
        setUniqueCopiers(Number(copierCount));
      } catch { /* contract may not have this function */ }

      // Helper to parse signal data (V3 pool-based contract)
      // signalCore: long, phase(uint8), entryPrice, tp, sl, leverage, feeAtCreation
      // signalVault: timestamp, closedAt, totalDeposited, originalDeposited, realizedReturned, totalClaimed, copierCount, vaultBalance, gTradePending, closePending, balanceSnapshot, tradeIndex
      // Phase: 0=NONE, 1=COLLECTING, 2=TRADING, 3=SETTLED
      const parseSignal = (id, core, vault) => {
        const phase = Number(core[1]);
        const totalDeposited = vault[2];
        const totalReturned = vault[4]; // realizedReturned
        const originalDeposited = vault[3];
        // Derive active/closed/resultPct for compatibility with UI
        const active = phase === 1 || phase === 2; // COLLECTING or TRADING
        const closed = phase === 3; // SETTLED
        // Calculate resultPct from on-chain totalReturned with known bug corrections
        // Signals 7 ($0 bug) and 9 ($214 bug) use verified gTrade returns
        let resultPct = 0n;
        const fixedReturned = totalReturned;
        const effectiveDeposited = originalDeposited > 0n ? originalDeposited : totalDeposited;
        if (closed && effectiveDeposited > 0n && fixedReturned > 0n) {
          if (fixedReturned >= effectiveDeposited) {
            resultPct = BigInt(Math.round(Number((fixedReturned - effectiveDeposited) * 10000n / effectiveDeposited)));
          } else {
            resultPct = BigInt(Math.round(-Number((effectiveDeposited - fixedReturned) * 10000n / effectiveDeposited)));
          }
        }
        // tradePct = ACTUAL on-chain PnL % (realizedReturned vs originalDeposited)
        // Reflects real gTrade fees + execution slippage, not idealized TP/SL hit prices
        const tradePct = closed ? Number(resultPct) / 100 : 0;
        return {
          id: Number(id),
          long: core[0],
          active,
          closed,
          entryPrice: core[2],
          tp: core[3],
          sl: core[4],
          leverage: core[5],
          resultPct,
          tradePct,
          feeAtCreation: core[6],
          phase,
          timestamp: vault[0],
          closedAt: vault[1],
          totalCopied: totalDeposited, // map totalDeposited to totalCopied for UI compat
          totalReturned,
          originalDeposited,
          copierCount: vault[6],
        };
      };

      // Active signal
      try {
        const activeId = await publicContract.getActiveSignalId();
        if (Number(activeId) > 0) {
          const core = await publicContract.signalCore(activeId);
          const vault = await publicContract.signalVault(activeId);
          setActiveSignal(parseSignal(activeId, core, vault));
        } else {
          setActiveSignal(null);
        }
      } catch {
        setActiveSignal(null);
      }

      // Signal history — ALL signals, batched + per-call fault-tolerant
      try {
        const total = Number(count);
        const BATCH = 8;
        const histArr = [];
        for (let batchStart = total; batchStart >= 1; batchStart -= BATCH) {
          const batch = [];
          for (let i = batchStart; i > batchStart - BATCH && i >= 1; i--) batch.push(i);
          const batchResults = await Promise.all(batch.map(async (i) => {
            try {
              const [core, vault] = await Promise.all([
                publicContract.signalCore(i),
                publicContract.signalVault(i),
              ]);
              return parseSignal(i, core, vault);
            } catch {
              return null; // skip this one — don't kill the batch
            }
          }));
          for (const r of batchResults) if (r) histArr.push(r);
        }
        if (histArr.length > 0) setSignalHistory(histArr);
      } catch {
        // keep existing
      }

      // Active volume = sum of all enabled auto-copy amounts (what goes into next trade)
      try {
        const users = await publicContract.getAutoCopyUsers();
        let volSum = 0;
        for (const user of users) {
          const config = await publicContract.autoCopy(user);
          if (config.enabled) {
            volSum += parseFloat(ethers.formatUnits(config.amount, 6));
          }
        }
        setTotalVolume(volSum);
      } catch {
        // keep existing
      }

      // Contract USDC balance (for claim button state)
      try {
        const publicUsdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, publicProvider);
        const bal = await publicUsdc.balanceOf(CONTRACT_ADDRESS);
        setContractBalance(parseFloat(ethers.formatUnits(bal, 6)));
      } catch { /* keep existing */ }
    } catch (err) {
      console.error("Public data load error:", err);
    }
  }, []);

  // Load public data on mount + poll every 30s (detects trade closes)
  useEffect(() => {
    loadPublicData();
    const interval = setInterval(loadPublicData, 30000);
    return () => clearInterval(interval);
  }, [loadPublicData]);

  // ===== MARKETPLACE DATA =====
  const loadMarketplace = useCallback(async () => {
    try {
      const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
      const mp = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);

      const providerAddrs = await mp.getProviderList();
      const globalCount = Number(await mp.globalSignalCount());
      const providers = [];

      for (const addr of providerAddrs) {
        const p = await mp.providers(addr);
        const followers = await mp.getProviderFollowers(addr);
        const signalCount = Number(p.signalCount);

        let wins = 0, losses = 0, recent = [], totalPnlPct = 0;
        let activeSignalData = null;
        let totalVolume = 0;
        const tradeHistory = [];

        if (signalCount > 0) {
          const signals = await mp.getProviderSignals(addr, globalCount, Math.min(signalCount, 20));
          for (const sid of signals) {
            if (Number(sid) === 0) continue;
            const core = await mp.signalCore(sid);
            const meta = await mp.signalMeta(sid);
            const lev = Number(core.leverage) / 1000;
            const copied = parseFloat(ethers.formatUnits(meta.totalCopied, 6));
            totalVolume += copied;

            if (core.active && !core.closed) {
              activeSignalData = {
                id: Number(sid),
                long: core.long,
                entryPrice: core.entryPrice,
                tp: core.tp,
                sl: core.sl,
                leverage: core.leverage,
                copiers: Number(meta.copierCount),
                volume: copied,
                timestamp: Number(meta.timestamp),
              };
            } else if (core.closed) {
              const entry = Number(core.entryPrice) / 1e10;
              const isWin = Number(core.resultPct) > 0;
              const closePrice = isWin ? Number(core.tp) / 1e10 : Number(core.sl) / 1e10;
              const pctMove = ((closePrice - entry) / entry) * 100 * (core.long ? 1 : -1);
              const pnl = pctMove * lev;
              totalPnlPct += pnl;
              if (pnl >= 0) wins++; else losses++;
              if (recent.length < 5) recent.push(pnl);
              tradeHistory.push({
                id: Number(sid),
                long: core.long,
                pnl,
                leverage: lev,
                copiers: Number(meta.copierCount),
                volume: copied,
                closedAt: Number(meta.closedAt),
              });
            }
          }
        }

        const totalTrades = wins + losses;
        providers.push({
          address: addr,
          shortAddr: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
          signalCount,
          totalFeesEarned: parseFloat(ethers.formatUnits(p.totalFeesEarned, 6)),
          followers: followers.filter(f => f !== ethers.ZeroAddress).length,
          winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0,
          totalTrades,
          totalPnlPct,
          totalVolume,
          recent: recent.length > 0 ? recent : [0],
          activeSignal: activeSignalData,
          tradeHistory,
        });
      }

      setMarketplaceProviders(providers);

      // Fetch provider profiles from Supabase
      if (supabase && providers.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('provider_profiles')
            .select('wallet_address, display_name, avatar_url')
            .in('wallet_address', providers.map(p => p.address.toLowerCase()));
          if (profiles) {
            const profileMap = {};
            profiles.forEach(p => { profileMap[p.wallet_address] = p; });
            setProviderProfiles(profileMap);
          }
        } catch { /* table may not exist yet */ }
      }
    } catch (err) {
      console.error("Marketplace load error:", err);
    }
  }, []);

  // Load user's follow status for marketplace
  const loadUserFollows = useCallback(async () => {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const mp = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);

      const following = await mp.getFollowerProviders(account);
      const followMap = {};
      for (const provAddr of following) {
        const config = await mp.follows(account, provAddr);
        followMap[provAddr.toLowerCase()] = {
          amount: parseFloat(ethers.formatUnits(config.amountPerTrade, 6)),
          enabled: config.enabled,
        };
      }
      setUserFollows(followMap);
    } catch (err) {
      console.error("Load follows error:", err);
    }
  }, [account]);

  useEffect(() => { loadMarketplace(); }, [loadMarketplace]);
  useEffect(() => { loadUserFollows(); }, [loadUserFollows]);

  // Follow/unfollow handler
  const handleFollow = async (providerAddr, amount) => {
    if (!account) return;
    setFollowLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const mp = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
      const tx = await mp.followProvider(providerAddr, ethers.parseUnits(String(amount), 6));
      await tx.wait();
      await loadUserFollows();
      await loadMarketplace();
    } catch (err) {
      alert(friendlyError(err));
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async (providerAddr) => {
    if (!account) return;
    setFollowLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const mp = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
      const tx = await mp.unfollowProvider(providerAddr);
      await tx.wait();
      await loadUserFollows();
      await loadMarketplace();
    } catch (err) {
      alert(friendlyError(err));
    } finally {
      setFollowLoading(false);
    }
  };

  // Live XAU/USD price from Pyth Network (same source as gTrade, poll every 10s)
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`${PYTH_HERMES_URL}?ids[]=${PYTH_XAU_USD_FEED}`);
        const data = await res.json();
        const p = data.parsed[0].price;
        setLivePrice(Number(p.price) * Math.pow(10, p.expo));
      } catch { /* keep existing */ }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh when active trade closes
  useEffect(() => {
    const prev = prevActiveSignalRef.current;
    if (prev && prev.active && (!activeSignal || !activeSignal.active || activeSignal.closed)) {
      loadPublicData();
      if (account && contractRef.current && usdcRef.current) {
        loadData(contractRef.current, usdcRef.current, account);
      }
    }
    prevActiveSignalRef.current = activeSignal;
  }, [activeSignal]);

  // Load data from contract
  const loadData = useCallback(async (contract, usdcContract, userAddress) => {
    try {
      // Fast first: load critical UI data in parallel
      const [walletBal, adminAddr, config, count, fee] = await Promise.all([
        usdcContract.balanceOf(userAddress),
        contract.admin(),
        contract.autoCopy(userAddress),
        contract.signalCount(),
        contract.feePercent(),
      ]);

      setWalletUSDC(parseFloat(ethers.formatUnits(walletBal, USDC_DECIMALS)));
      setIsAdmin(adminAddr.toLowerCase() === userAddress.toLowerCase());
      setAutoCopyConfig({ enabled: config.enabled, amount: parseFloat(ethers.formatUnits(config.amount, USDC_DECIMALS)) });
      setSignalCount(Number(count));
      setFeePercent(Number(fee));

      // Helper to parse signal data from contract Result objects
      // V3 pool-based: signalCore returns [long, phase, entryPrice, tp, sl, leverage, feeAtCreation]
      // signalVault: timestamp, closedAt, totalDeposited, originalDeposited, realizedReturned, totalClaimed, copierCount, vaultBalance, gTradePending, closePending, balanceSnapshot, tradeIndex
      const parseSignal = (id, core, vault) => {
        const phase = Number(core[1]);
        const totalDeposited = vault[2];
        const totalReturned = vault[4]; // realizedReturned
        const originalDeposited = vault[3];
        const active = phase === 1 || phase === 2;
        const closed = phase === 3;
        let resultPct = 0n;
        const fixedReturned = totalReturned;
        const effectiveDeposited = originalDeposited > 0n ? originalDeposited : totalDeposited;
        if (closed && effectiveDeposited > 0n && fixedReturned > 0n) {
          if (fixedReturned >= effectiveDeposited) {
            resultPct = BigInt(Math.round(Number((fixedReturned - effectiveDeposited) * 10000n / effectiveDeposited)));
          } else {
            resultPct = BigInt(Math.round(-Number((effectiveDeposited - fixedReturned) * 10000n / effectiveDeposited)));
          }
        }
        // tradePct = ACTUAL on-chain PnL % (realizedReturned vs originalDeposited)
        // Reflects real gTrade fees + execution slippage, not idealized TP/SL hit prices
        const tradePct = closed ? Number(resultPct) / 100 : 0;
        return {
          id: Number(id),
          long: core[0],
          active,
          closed,
          entryPrice: core[2],
          tp: core[3],
          sl: core[4],
          leverage: core[5],
          resultPct,
          tradePct,
          feeAtCreation: core[6],
          phase,
          timestamp: vault[0],
          closedAt: vault[1],
          totalCopied: totalDeposited,
          totalReturned,
          originalDeposited,
          copierCount: vault[6],
        };
      };

      // Active signal
      try {
        const activeId = await contract.getActiveSignalId();
        if (Number(activeId) > 0) {
          const core = await contract.signalCore(activeId);
          const vault = await contract.signalVault(activeId);
          setActiveSignal(parseSignal(activeId, core, vault));
        } else {
          setActiveSignal(null);
        }
      } catch {
        setActiveSignal(null);
      }

      // Signal history — ALL signals, batched + per-call fault-tolerant
      try {
        const total = Number(count);
        const BATCH = 8;
        const histArr = [];
        for (let batchStart = total; batchStart >= 1; batchStart -= BATCH) {
          const batch = [];
          for (let i = batchStart; i > batchStart - BATCH && i >= 1; i--) batch.push(i);
          const batchResults = await Promise.all(batch.map(async (i) => {
            try {
              const [core, vault] = await Promise.all([
                contract.signalCore(i),
                contract.signalVault(i),
              ]);
              return parseSignal(i, core, vault);
            } catch {
              return null;
            }
          }));
          for (const r of batchResults) if (r) histArr.push(r);
        }
        if (histArr.length > 0) setSignalHistory(histArr);
      } catch {
        // Keep previous history on failure — don't wipe to 0s
      }

      // Active volume = sum of all enabled auto-copy amounts (what goes into next trade)
      try {
        const users = await contract.getAutoCopyUsers();
        let volSum = 0;
        for (const user of users) {
          const config = await contract.autoCopy(user);
          if (config.enabled) {
            volSum += parseFloat(ethers.formatUnits(config.amount, 6));
          }
        }
        setTotalVolume(volSum);
      } catch {
        // keep existing
      }

      // User positions
      try {
        const sids = await contract.getUserSignalIds(userAddress);
        const posMap = {};
        for (const sid of sids) {
          const pos = await contract.positions(userAddress, sid);
          if (Number(pos.deposit) > 0) {
            posMap[Number(sid)] = pos;
          }
        }
        setUserPositions(posMap);
      } catch {
        setUserPositions({});
      }

      // Contract USDC balance
      try {
        const bal = await usdcContract.balanceOf(CONTRACT_ADDRESS);
        setContractBalance(parseFloat(ethers.formatUnits(bal, 6)));
      } catch { /* keep existing */ }

      // Auto-copy already loaded above in parallel batch

      // Check legacy claim status for specific wallet
      if (userAddress.toLowerCase() === '0x52de1ec42554cd0867fe7d8a7eb105d09912afb3') {
        try {
          const oldContract = new ethers.Contract(
            '0xf41d121DB5841767f403a4Bc59A54B26DecF6b99',
            ['function positions(address, uint256) view returns (uint256 collateral, uint32 tradeIndex, bool claimed)'],
            new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc")
          );
          const pos = await oldContract.positions(userAddress, 17);
          setLegacyClaimed(pos.claimed);
        } catch {}
      }
    } catch (err) {
      console.error("Error loading data:", err);
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask or another Web3 wallet!");
      return;
    }
    try {
      setIsConnecting(true);

      // Request accounts first
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      setCurrentChainId(chainId);

      // If not on Arbitrum or BSC, switch to Arbitrum
      if (chainId !== ARBITRUM_CHAIN_ID && chainId !== BSC_CHAIN_ID) {
        await switchToArbitrum();
      }

      // Re-read chainId after potential switch
      const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
      setCurrentChainId(currentChain);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);

      // Only set up contract refs if on Arbitrum
      if (currentChain === ARBITRUM_CHAIN_ID) {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

        providerRef.current = provider;
        signerRef.current = signer;
        contractRef.current = contract;
        usdcRef.current = usdcContract;

        await loadData(contract, usdcContract, address);
      }
    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAccount("");
        setWalletUSDC(0);
        setIsAdmin(false);
      } else {
        setAccount(accounts[0]);
        if (contractRef.current && usdcRef.current) {
          loadData(contractRef.current, usdcRef.current, accounts[0]);
        }
      }
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', (chainId) => {
      setCurrentChainId(chainId);
      if (chainId === ARBITRUM_CHAIN_ID && contractRef.current && usdcRef.current) {
        // Reconnect on Arbitrum
        connectWallet();
      }
    });
    // Auto-reconnect on page load if previously connected
    if (!account) {
      window.ethereum.request({ method: 'eth_accounts' }).then(async (accounts) => {
        if (accounts.length > 0) {
          try {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            setCurrentChainId(chainId);
            if (chainId === ARBITRUM_CHAIN_ID) {
              const provider = new ethers.BrowserProvider(window.ethereum);
              const signer = await provider.getSigner();
              const address = await signer.getAddress();
              setAccount(address);
              const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
              const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
              providerRef.current = provider;
              signerRef.current = signer;
              contractRef.current = contract;
              usdcRef.current = usdcContract;
              loadData(contract, usdcContract, address);
            } else {
              setAccount(accounts[0]);
            }
          } catch {}
        }
      }).catch(() => {});
    }

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', () => {});
    };
  }, [loadData]);

  // Refresh data periodically
  useEffect(() => {
    if (!account || !contractRef.current || !usdcRef.current) return;
    const interval = setInterval(() => {
      if (!account || !contractRef.current || !usdcRef.current) return;
      Promise.resolve(loadData(contractRef.current, usdcRef.current, account))
        .catch(e => console.error('loadData poll', e));
    }, 15000);
    return () => clearInterval(interval);
  }, [account, loadData]);

  // ===== ADMIN: Post Signal =====
  const handlePostSignal = async (e) => {
    e.preventDefault();
    if (!isAdmin || !account) return;

    try {
      setIsLoading(true);
      const entryPrice = BigInt(Math.round(parseFloat(signalForm.entryPrice) * PRICE_PRECISION));
      const tp = BigInt(Math.round(parseFloat(signalForm.tp) * PRICE_PRECISION));
      const sl = BigInt(Math.round(parseFloat(signalForm.sl) * PRICE_PRECISION));
      const leverage = Math.round(parseFloat(signalForm.leverage) * LEVERAGE_PRECISION);

      const tx = await contractRef.current.postSignal(
        signalForm.long,
        entryPrice,
        tp,
        sl,
        leverage
      );
      await tx.wait();

      setSignalForm({ long: true, entryPrice: '', tp: '', sl: '', leverage: '50' });
      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Post signal error:", err);
      alert(friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ===== ADMIN: Close Signal =====
  const handleCloseSignal = async (e) => {
    e.preventDefault();
    if (!isAdmin || !account) return;

    try {
      setIsLoading(true);
      const totalReturnedWei = ethers.parseUnits(settleTotalReturned, 6); // USDC has 6 decimals

      const tx = await contractRef.current.settleSignal(totalReturnedWei);
      await tx.wait();

      setSettleTotalReturned('');
      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Close signal error:", err);
      alert(friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ===== USER: Auto-Copy =====
  const handleEnableAutoCopy = async () => {
    if (!account || !contractRef.current) return;
    const amount = parseFloat(autoCopyAmount);
    if (!amount || amount < 5) {
      alert('Minimum $5 USDC per trade');
      return;
    }
    try {
      setAutoCopyLoading(true);
      const contract = contractRef.current;
      const usdcContract = usdcRef.current;
      const amountWei = ethers.parseUnits(amount.toString(), USDC_DECIMALS);

      // Approve max USDC to contract for auto-copy
      const allowance = await usdcContract.allowance(account, CONTRACT_ADDRESS);
      if (allowance < amountWei * 100n) {
        const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
      }

      const tx = await contract.enableAutoCopy(amountWei);
      await tx.wait();
      setAutoCopyConfig({ enabled: true, amount });
      setAutoCopyAmount('');

      // Save referral if user came via ref link
      const ref = referrer || localStorage.getItem('stc_referrer') || '';
      console.log('Referral check:', { ref, account: account.toLowerCase(), match: ref && ref !== account.toLowerCase() });
      if (ref && ref !== account.toLowerCase()) {
        try {
          await supabase.from('referrals').upsert({
            referrer: ref,
            referred: account.toLowerCase(),
            signal_id: 0,
            amount: amount,
          }, { onConflict: 'referred,signal_id' });
        } catch (e) {
          console.error('Referral save error:', e);
        }
      }
    } catch (err) {
      console.error('Auto-copy enable error:', err);
      alert('Failed to enable auto-copy');
    } finally {
      setAutoCopyLoading(false);
    }
  };

  const handleDisableAutoCopy = async () => {
    if (!account || !contractRef.current) return;
    try {
      setAutoCopyLoading(true);
      const tx = await contractRef.current.disableAutoCopy();
      await tx.wait();
      setAutoCopyConfig({ enabled: false, amount: 0 });
    } catch (err) {
      console.error('Auto-copy disable error:', err);
      alert('Failed to disable auto-copy');
    } finally {
      setAutoCopyLoading(false);
    }
  };

  // ===== USER: Copy Trade =====
  const handleCopyTrade = async (e) => {
    e.preventDefault();
    if (!account || !activeSignal) return;
    if (!copyAmount || isNaN(copyAmount) || Number(copyAmount) <= 0) return;

    try {
      setIsLoading(true);
      const amount = ethers.parseUnits(copyAmount, USDC_DECIMALS);

      // Check allowance and approve if needed
      const allowance = await usdcRef.current.allowance(account, CONTRACT_ADDRESS);
      if (allowance < amount) {
        const approveTx = await usdcRef.current.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
      }

      const tx = await contractRef.current.deposit(amount);
      const receipt = await tx.wait();

      setTransactions(prev => [
        { id: `${receipt.hash.substring(0, 6)}...${receipt.hash.substring(62)}`, type: 'copy', amount: Number(copyAmount), signalId: Number(activeSignal.id), date: 'Nu net' },
        ...prev
      ]);
      setCopyAmount("");
      setShowCopyModal(false);

      // Save referral to Supabase
      const ref2 = referrer || localStorage.getItem('stc_referrer') || '';
      if (ref2 && ref2 !== account.toLowerCase()) {
        try {
          await supabase.from('referrals').upsert({
            referrer: ref2,
            referred: account.toLowerCase(),
            signal_id: Number(activeSignal.id),
            amount: Number(copyAmount),
          }, { onConflict: 'referred,signal_id' });
        } catch (e) {
          console.error('Referral save error:', e);
        }
      }

      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Copy trade error:", err);
      alert(friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ===== USER: Claim Proceeds =====
  const handleClaimProceeds = async (signalId) => {
    if (!account) return;

    try {
      setIsLoading(true);
      const tx = await contractRef.current.claim(BigInt(signalId));
      const receipt = await tx.wait();

      setTransactions(prev => [
        { id: `${receipt.hash.substring(0, 6)}...${receipt.hash.substring(62)}`, type: 'claim', amount: 0, signalId, date: 'Nu net' },
        ...prev
      ]);
      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Claim error:", err);
      alert(friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Yield calculator state
  const [calcAmount, setCalcAmount] = useState(1000);

  const particlesLoaded = useCallback(async (container) => {}, []);

  const renderInvest = () => (
    <>
      {/* ===== PARTICLES ===== */}
      {particlesReady && (
        <div className="particles-container">
          <Particles id="tsparticles" options={particlesOptions} particlesLoaded={particlesLoaded} />
        </div>
      )}

      {/* ===== HERO ===== */}
      <motion.section className="hero-section" style={{ opacity: heroOpacity }}>
        <div className="hero-content">
          <motion.div className="hero-left" variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div className="hero-tag" variants={fadeUp} custom={0}>
              <span className="pulse-dot" />
              <span>Live on Arbitrum</span>
              <span className="hero-tag-badge">v3.0</span>
            </motion.div>

            <motion.h1 className="hero-title" variants={fadeUp} custom={1}>
              <span className="hero-title-line">Gold Trading.</span>
              <span className="hero-title-accent">
                <span className="text-gold-gradient">Copy & Earn.</span>
                <Sparkles className="hero-sparkle" size={28} />
              </span>
            </motion.h1>

            <motion.p className="hero-subtitle" variants={fadeUp} custom={2}>
              Copy our live gold trades with one click. Just connect your wallet,
              wait for a signal, and click Copy Now. Your profit is paid directly to your wallet.
            </motion.p>

            {/* Live stats — daysLive, trades, volume, copiers */}
            {(() => {
              const LAUNCH_DATE = new Date('2026-03-31T00:00:00Z');
              const daysLive = Math.max(1, Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000));
              const closedSignals = signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0);
              const tradesCount = closedSignals.length;
              const cumulativeVolume = closedSignals.reduce((sum, s) => sum + parseFloat(ethers.formatUnits(s.totalCopied || 0n, 6)), 0);
              const formatVol = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;
              const formatLaunch = LAUNCH_DATE.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
              const stats = [
                { value: daysLive, label: 'days live' },
                { value: tradesCount, label: 'trades' },
                { value: formatVol(cumulativeVolume), label: 'volume' },
                { value: uniqueCopiers, label: 'copiers' },
              ];
              return (
                <motion.div variants={fadeUp} custom={3} style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  margin: '20px 0 18px', padding: '12px 16px',
                  background: 'rgba(212,168,67,0.06)',
                  border: '1px solid rgba(212,168,67,0.2)',
                  borderRadius: 12,
                  backdropFilter: 'blur(10px)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 14, borderRight: '1px solid rgba(212,168,67,0.2)' }}>
                    <span className="pulse-dot" style={{ width: 8, height: 8, background: '#22c55e' }} />
                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                      Live since {formatLaunch}
                    </span>
                  </div>
                  {stats.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#D4A843' }}>{s.value}</span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
                    </div>
                  ))}
                </motion.div>
              );
            })()}

            {/* Trust indicators */}
            <motion.div className="hero-trust-row" variants={fadeUp} custom={4}>
              <div className="trust-item">
                <ShieldCheck size={14} />
                <span>Verified Contract</span>
              </div>
              <div className="trust-item">
                <Network size={14} />
                <span>Arbitrum L2</span>
              </div>
              <div className="trust-item">
                <Copy size={14} />
                <span>Copy Trading</span>
              </div>
            </motion.div>

            <motion.div className="hero-cta-row" variants={fadeUp} custom={4}>
              <button className="btn btn-primary btn-lg btn-glow" onClick={() => setActiveTab('dashboard')}>
                <Zap size={18} />
                Start Copy Trading
                <ArrowRight size={18} />
              </button>
              <button className="btn btn-glass btn-lg" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                How does it work?
                <ChevronDown size={16} />
              </button>
            </motion.div>
          </motion.div>

          <motion.div className="hero-right" variants={slideInRight} initial="hidden" animate="visible">
            {/* Main stats card */}
            <div className="hero-card">
              <div className="hero-card-glow" />
              <div className="hero-card-inner">
                {/* Header */}
                <div className="hero-card-header">
                  <div className="hero-card-header-left">
                    <span className={marketStatus.open ? "pulse-dot" : "pulse-dot pulse-dot-red"} />
                    <span className="hero-card-label">Live Trading Terminal</span>
                  </div>
                  <span className={marketStatus.open ? "hero-card-live" : "hero-card-live hero-card-closed"}>
                    {marketStatus.open ? 'LIVE' : 'CLOSED'}
                  </span>
                </div>

                {/* Market closed banner */}
                {!marketStatus.open && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 12px', margin: '12px 0 0',
                    borderRadius: '10px',
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.2)',
                  }}>
                    <Clock size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>
                      {marketStatus.reason}
                    </span>
                  </div>
                )}

                {/* Active trade preview */}
                <div style={{ padding: '16px 0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ marginBottom: '10px' }}>
                    {/* Row 1: Pair name + signal meta */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.3rem', fontWeight: 700 }}>XAU/USD</span>
                      {activeSignal && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>
                          #{Number(activeSignal.id)} &middot; {timeAgo(activeSignal.timestamp)}
                        </span>
                      )}
                    </div>
                    {/* Row 2: Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
                        background: !marketStatus.open
                          ? 'rgba(248,113,113,0.1)'
                          : activeSignal ? (activeSignal.long ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)') : 'rgba(255,255,255,0.06)',
                        color: !marketStatus.open
                          ? 'var(--danger)'
                          : activeSignal ? (activeSignal.long ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)',
                        border: `1px solid ${!marketStatus.open ? 'rgba(248,113,113,0.2)' : activeSignal ? (activeSignal.long ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)') : 'rgba(255,255,255,0.06)'}`,
                      }}>
                        {!marketStatus.open ? 'CLOSED' : activeSignal ? (activeSignal.long ? 'LONG' : 'SHORT') : 'WAITING'}
                      </span>
                      {activeSignal && marketStatus.open && (
                        <span style={{
                          padding: '4px 12px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 600,
                          background: 'rgba(212, 168, 67, 0.1)', color: 'var(--accent)',
                          border: '1px solid rgba(212, 168, 67, 0.2)',
                        }}>
                          {formatLeverage(activeSignal.leverage)}x
                        </span>
                      )}
                      {activeSignal && marketStatus.open && livePrice && (() => {
                        const entry = Number(activeSignal.entryPrice) / 1e10;
                        const pctMove = ((livePrice - entry) / entry) * 100 * (activeSignal.long ? 1 : -1);
                        const livePnl = pctMove * (Number(activeSignal.leverage) / 1000);
                        return (
                          <span style={{
                            padding: '4px 12px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 700,
                            fontFamily: "'Space Grotesk', sans-serif",
                            background: livePnl >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                            color: livePnl >= 0 ? 'var(--success)' : 'var(--danger)',
                            border: `1px solid ${livePnl >= 0 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                          }}>
                            {livePnl >= 0 ? '+' : ''}{livePnl.toFixed(2)}%
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  {activeSignal && marketStatus.open ? (
                    <div>
                      {/* Live price + progress bar */}
                      {livePrice && (() => {
                        const entry = Number(activeSignal.entryPrice) / 1e10;
                        const tp = Number(activeSignal.tp) / 1e10;
                        const sl = Number(activeSignal.sl) / 1e10;
                        const pctMove = ((livePrice - entry) / entry) * 100 * (activeSignal.long ? 1 : -1);
                        const livePnl = pctMove * (Number(activeSignal.leverage) / 1000);
                        const isProfit = livePnl >= 0;
                        return (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.1rem' }}>
                                ${livePrice.toFixed(2)}
                              </span>
                              <span style={{
                                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.9rem',
                                color: isProfit ? 'var(--success)' : 'var(--danger)',
                              }}>
                                {isProfit ? '+' : ''}{livePnl.toFixed(2)}%
                              </span>
                            </div>
                            <TradeProgressBar entry={entry} tp={tp} sl={sl} currentPrice={livePrice} isLong={activeSignal.long} showPrices={isAdmin || !!userPositions[Number(activeSignal.id)]} />
                          </div>
                        );
                      })()}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        {[
                          { label: 'ENTRY', rawValue: formatGTradePrice(activeSignal.entryPrice), color: 'var(--text-primary)' },
                          { label: 'TP', rawValue: formatGTradePrice(activeSignal.tp), color: 'var(--success)' },
                          { label: 'SL', rawValue: formatGTradePrice(activeSignal.sl), color: 'var(--danger)' },
                        ].map(item => (
                          <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '2px' }}>{item.label}</div>
                            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.85rem', color: item.color }}>
                              {(isAdmin || (activeSignal && userPositions[Number(activeSignal.id)])) ? `$${item.rawValue}` : `${item.rawValue.replace(/,/g, '').slice(0, 2)}••`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <Clock size={14} />
                      <span>{!marketStatus.open ? 'Market is closed — no trading possible' : 'No active trade — waiting for next signal'}</span>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', padding: '14px 0 12px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>
                      $<CountUp end={totalVolume} duration={2} decimals={0} separator="," />
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Volume</div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 700 }}>
                      <CountUp end={uniqueCopiers} duration={2} />
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Copiers</div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>
                      <CountUp end={signalCount} duration={2} />
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Signals</div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 700 }}>
                      {(feePercent / 100).toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Profit Fee</div>
                  </div>
                </div>

                {/* Performance bars */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Recent Performance</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>Gold Trading</span>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '48px' }}>
                    {(() => {
                      const closed = signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0).slice(0, 12);
                      if (closed.length === 0) return [{ h: 20, win: true }];
                      const maxPct = Math.max(...closed.map(s => Math.abs(s.tradePct)), 1);
                      return closed.map(s => {
                        const pct = Math.abs(s.tradePct);
                        return { h: Math.max(15, (pct / maxPct) * 100), win: s.tradePct >= 0 };
                      });
                    })().map((bar, i) => (
                      <motion.div
                        key={i}
                        style={{
                          flex: 1, borderRadius: '3px 3px 0 0',
                          background: bar.win
                            ? 'linear-gradient(to top, rgba(52,211,153,0.3), rgba(52,211,153,0.7))'
                            : 'linear-gradient(to top, rgba(248,113,113,0.2), rgba(248,113,113,0.5))',
                        }}
                        initial={{ height: 0 }}
                        animate={{ height: `${bar.h}%` }}
                        transition={{ duration: 0.6, delay: 0.6 + i * 0.06, ease: "easeOut" }}
                      />
                    ))}
                  </div>
                </div>

              </div>
            </div>

          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="scroll-indicator"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <ChevronDown size={20} />
        </motion.div>
      </motion.section>

      {/* ===== MARQUEE STATS ===== */}
      <div className="marquee-bar">
        <div className="marquee-track">
          {[...Array(2)].map((_, idx) => (
            <div className="marquee-content" key={idx}>
              <div className="marquee-item">
                <span className="marquee-dot gold" />
                <span className="marquee-label">Total Volume</span>
                <span className="marquee-value gold">${totalVolume.toLocaleString(undefined, {maximumFractionDigits: 0})} USDC</span>
              </div>
              <div className="marquee-divider">&bull;</div>
              <div className="marquee-item">
                <span className="marquee-dot green" />
                <span className="marquee-label">Total Copiers</span>
                <span className="marquee-value green">{uniqueCopiers}</span>
              </div>
              <div className="marquee-divider">&bull;</div>
              <div className="marquee-item">
                <span className="marquee-dot green" />
                <span className="marquee-label">Signals</span>
                <span className="marquee-value">{signalCount}</span>
              </div>
              <div className="marquee-divider">&bull;</div>
              <div className="marquee-item">
                <span className="marquee-dot gold" />
                <span className="marquee-label">Pair</span>
                <span className="marquee-value gold">XAU/USD</span>
              </div>
              <div className="marquee-divider">&bull;</div>
              <div className="marquee-item">
                <span className="marquee-dot green" />
                <span className="marquee-label">Network</span>
                <span className="marquee-value green">Arbitrum One</span>
              </div>
              <div className="marquee-divider">&bull;</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== HOW IT WORKS ===== */}
      <section className="section" id="how-it-works">
        <motion.div
          className="section-header"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="section-badge">Simple & Fast</span>
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Get started in less than 2 minutes. Four simple steps.</p>
        </motion.div>

        <div className="timeline">
          {[
            { num: '01', icon: <Wallet size={22} />, title: 'Connect Wallet', desc: 'Install MetaMask and connect to Arbitrum network. Make sure you have USDC in your wallet (you can bridge from any chain).', color: 'var(--blue)' },
            { num: '02', icon: <Eye size={22} />, title: 'Wait for Signal', desc: 'When our AI trading bot spots a gold opportunity, a live signal appears on the dashboard. You also get a notification in Telegram.', color: 'var(--emerald)' },
            { num: '03', icon: <Copy size={22} />, title: 'Click Copy Now', desc: 'Click the "Copy Now" button, enter how much USDC you want to invest. MetaMask opens — confirm and your trade is live.', color: 'var(--accent)' },
            { num: '04', icon: <Zap size={22} />, title: 'Get Paid', desc: 'The trade closes automatically when it hits profit or stop loss. Click "Claim" to receive your USDC back — including your profit.', color: 'var(--violet)' },
          ].map((step, i) => (
            <motion.div
              className={`timeline-item ${i % 2 === 1 ? 'timeline-item-right' : ''}`}
              key={step.num}
              variants={i % 2 === 0 ? slideInLeft : slideInRight}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <div className="timeline-num" style={{ '--step-color': step.color }}>{step.num}</div>
              <div className="timeline-line" />
              <div className="timeline-card">
                <div className="timeline-icon" style={{ color: step.color, borderColor: step.color, background: `color-mix(in srgb, ${step.color} 8%, transparent)` }}>
                  {step.icon}
                </div>
                <div className="timeline-text">
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Video Tutorial */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          style={{ maxWidth: '720px', margin: '3rem auto 0', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
        >
          <video
            controls
            playsInline
            preload="metadata"
            poster=""
            style={{ width: '100%', display: 'block', background: '#000' }}
          >
            <source src="/HowItWorks.mp4" type="video/mp4" />
          </video>
          <div style={{ padding: '12px 16px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Play size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Watch: How to copy trade in 2 minutes</span>
          </div>
        </motion.div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="section">
        <motion.div
          className="section-header"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="section-badge">Benefits</span>
          <h2 className="section-title">Why Gold Copy Trading</h2>
          <p className="section-subtitle">Built for maximum performance and security.</p>
        </motion.div>

        <div className="bento-grid">
          {/* Large hero feature */}
          <motion.div
            className="bento-hero"
            variants={slideInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="bento-hero-glow" />
            <div className="bento-hero-content">
              <div className="bento-hero-icon"><BrainCircuit size={32} /></div>
              <h3>Copy Trading<br /><span className="text-gold-gradient">Engine</span></h3>
              <p>Copy trades from our AI trading bot. Every trade is executed on-chain via gTrade with real leverage on XAU/USD.</p>
              <div className="bento-hero-bottom">
                <div className="bento-hero-stat">
                  <span className="bento-hero-stat-num">25x</span>
                  <span className="bento-hero-stat-label">leverage</span>
                </div>
                <div className="bento-hero-tags">
                  <span>gTrade</span>
                  <span>XAU/USD</span>
                  <span>On-Chain</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Stat tile */}
          <motion.div className="bento-stat-tile" variants={fadeUp} custom={1} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <TrendingUp size={20} className="bento-stat-icon" />
            <span className="bento-stat-number">$197B</span>
            <span className="bento-stat-desc">Daily volume on the gold market</span>
            <div className="bento-stat-bar">
              <motion.div className="bento-stat-bar-fill" initial={{ width: 0 }} whileInView={{ width: '78%' }} transition={{ duration: 1.2, delay: 0.5 }} viewport={{ once: true }} />
            </div>
          </motion.div>

          {/* Stat tile */}
          <motion.div className="bento-stat-tile bento-stat-dark" variants={fadeUp} custom={2} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Cpu size={20} className="bento-stat-icon" />
            <span className="bento-stat-number">24/5</span>
            <span className="bento-stat-desc">Fully automated, no emotions</span>
            <div className="bento-uptime-dots">
              {[...Array(14)].map((_, i) => (
                <motion.div
                  key={i}
                  className="uptime-dot"
                  initial={{ opacity: 0.2 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  viewport={{ once: true }}
                />
              ))}
            </div>
          </motion.div>

          {/* Wide row */}
          <motion.div className="bento-wide" variants={fadeUp} custom={3} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-wide-left">
              <ShieldCheck size={22} className="bento-wide-icon" />
              <div>
                <h4>On-Chain Copy Trading</h4>
                <p>Trades are executed via gTrade on Arbitrum. Fully transparent and verifiable.</p>
              </div>
            </div>
            <div className="bento-wide-stats">
              <div className="bento-wide-stat">
                <span className="bento-wide-stat-val">100%</span>
                <span className="bento-wide-stat-label">On-chain</span>
              </div>
              <div className="bento-wide-stat-divider" />
              <div className="bento-wide-stat">
                <span className="bento-wide-stat-val green">{'<'}$0.05</span>
                <span className="bento-wide-stat-label">Gas fee</span>
              </div>
              <div className="bento-wide-stat-divider" />
              <div className="bento-wide-stat">
                <span className="bento-wide-stat-val gold">Arbitrum</span>
                <span className="bento-wide-stat-label">Network</span>
              </div>
            </div>
          </motion.div>

          {/* Two small inline cards */}
          <motion.div className="bento-inline" variants={fadeUp} custom={4} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-inline-icon" style={{ color: 'var(--emerald)', borderColor: 'rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.06)' }}>
              <Wallet size={20} />
            </div>
            <h4>Pay Per Trade</h4>
            <p>No upfront deposit needed. You only pay when you copy a trade — directly from your wallet via MetaMask.</p>
            <span className="bento-inline-badge green">Directly from wallet</span>
          </motion.div>

          <motion.div className="bento-inline" variants={fadeUp} custom={5} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-inline-icon" style={{ color: 'var(--violet)', borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)' }}>
              <Copy size={20} />
            </div>
            <h4>1-Click Copy</h4>
            <p>When a signal goes live, just click "Copy Now", choose your amount, and confirm in MetaMask. Done.</p>
            <span className="bento-inline-badge purple">Instant copy</span>
          </motion.div>
        </div>
      </section>

      {/* ===== STRATEGY ===== */}
      <section className="section" id="strategy">
        <div className="strat-showcase">
          <motion.div
            className="strat-showcase-left"
            variants={slideInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <span className="section-badge">Technology</span>
            <h2 className="strat-showcase-title">
              Copy Trading on<br />
              <span className="text-gold-gradient">XAU/USD Gold</span>
            </h2>
            <p className="strat-showcase-desc">
              Our AI trading bot opens positions via gTrade on-chain.
              You copy with your own wallet and earn from every profitable trade.
            </p>
            <div className="strat-indicators">
              {['gTrade', 'Arbitrum', 'USDC', 'Leverage', 'XAU/USD', 'On-Chain'].map(tag => (
                <span key={tag} className="strat-indicator-tag">{tag}</span>
              ))}
            </div>
            <button className="btn btn-glass" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
              More about copy trading <ArrowRight size={16} />
            </button>
          </motion.div>

          <motion.div
            className="strat-showcase-right"
            variants={slideInRight}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              { icon: <BarChart3 size={18} />, title: 'Live Signals', desc: 'See trades as soon as they open.', value: 'Real-time', color: 'var(--cyan)' },
              { icon: <Copy size={18} />, title: '1-Click Copy', desc: 'Copy directly from your wallet.', value: 'Instant', color: 'var(--accent)' },
              { icon: <Shield size={18} />, title: 'Auto TP/SL', desc: 'Take-profit and stop-loss built in.', value: 'Always', color: 'var(--emerald)' },
              { icon: <Coins size={18} />, title: 'Low Fees', desc: `Only ${(feePercent / 100).toFixed(0)}% fee on profit.`, value: `${(feePercent / 100).toFixed(0)}%`, color: 'var(--violet)' },
            ].map((item, i) => (
              <motion.div
                className="strat-list-item"
                key={item.title}
                variants={fadeUp}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                whileHover={{ x: 4 }}
              >
                <div className="strat-list-icon" style={{ color: item.color, borderColor: `color-mix(in srgb, ${item.color} 25%, transparent)`, background: `color-mix(in srgb, ${item.color} 6%, transparent)` }}>
                  {item.icon}
                </div>
                <div className="strat-list-text">
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </div>
                <span className="strat-list-value" style={{ color: item.color }}>{item.value}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== REFERRAL CTA ===== */}
      <motion.section
        className="section"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        style={{ paddingBottom: '2rem' }}
      >
        <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden', maxWidth: '900px', margin: '0 auto' }}>
          {/* Animated glow border */}
          <div style={{
            position: 'absolute', inset: '-2px', borderRadius: '24px',
            background: 'conic-gradient(from 180deg, #8B5CF6, #D4A843, #8B5CF6, #34D399, #8B5CF6)',
            animation: 'spin 6s linear infinite', filter: 'blur(3px)', opacity: 0.5,
          }} />

          {/* Inner card */}
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'linear-gradient(135deg, rgba(12,15,21,0.95), rgba(20,15,35,0.95))',
            backdropFilter: 'blur(24px)',
            borderRadius: '24px', padding: '40px 44px',
            overflow: 'hidden',
          }}>
            {/* Background decoration */}
            <div style={{
              position: 'absolute', top: '-60px', right: '-40px', width: '220px', height: '220px',
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: '-40px', left: '-20px', width: '160px', height: '160px',
              borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,168,67,0.08), transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px', flexWrap: 'wrap', position: 'relative' }}>
              {/* Left: content */}
              <div style={{ flex: '1 1 auto' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '5px 14px', borderRadius: '20px', marginBottom: '16px',
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                }}>
                  <Share2 size={12} style={{ color: '#8B5CF6' }} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#8B5CF6', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Referral Program</span>
                </div>

                <h3 style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '10px', letterSpacing: '-0.02em' }}>
                  Share. Refer.{' '}
                  <span style={{
                    background: 'linear-gradient(135deg, #8B5CF6, #D4A843)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>Earn 50%.</span>
                </h3>

                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px', maxWidth: '420px' }}>
                  Invite friends and earn <strong style={{ color: 'var(--text-primary)' }}>50% of all platform fees</strong> from their profitable trades. Paid instantly in USDC.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary btn-glow"
                    style={{
                      padding: '13px 28px', fontSize: '0.9rem', fontWeight: 700,
                      background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                      boxShadow: '0 8px 32px rgba(139,92,246,0.3)',
                    }}
                    onClick={() => setActiveTab('referral')}
                  >
                    <Share2 size={16} /> Start Earning
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No limits, instant payout</span>
                  </div>
                </div>
              </div>

              {/* Right: big 50% highlight */}
              <div style={{
                textAlign: 'center', flexShrink: 0,
                padding: '24px 32px', borderRadius: '20px',
                background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
              }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: '3.5rem', fontWeight: 800, lineHeight: 1,
                  background: 'linear-gradient(135deg, #8B5CF6, #D4A843)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>50%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.06em', marginTop: '6px', textTransform: 'uppercase' }}>
                  of platform fees
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '14px',
                  padding: '10px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {[
                    { icon: <Zap size={12} />, text: 'Instant' },
                    { icon: <Coins size={12} />, text: 'USDC' },
                    { icon: <Shield size={12} />, text: 'On-chain' },
                  ].map(item => (
                    <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: '#8B5CF6' }}>{item.icon}</span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ===== BOTTOM CTA ===== */}
      <motion.section
        className="bottom-cta"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <div className="bottom-cta-glow" />
        <span className="section-badge">Start Today</span>
        <h2>Ready to <span className="text-gold-gradient">copy trade</span>?</h2>
        <p>Copy live gold trades directly from your wallet on Arbitrum.</p>
        <div className="bottom-cta-buttons">
          <button className="btn btn-primary btn-lg btn-glow" onClick={() => setActiveTab('dashboard')}>
            <Zap size={18} />
            Start Now
            <ArrowRight size={18} />
          </button>
          <button className="btn btn-glass btn-lg" onClick={() => setActiveTab('results')}>
            <BarChart3 size={16} />
            View Results
            <ArrowRight size={14} />
          </button>
        </div>
      </motion.section>

      {/* ===== SOCIAL LINKS ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px',
        padding: '2rem 0 3rem',
      }}>
        <a href="https://x.com/STCprotocol" target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
          borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
          transition: 'all 0.2s ease',
        }}>
          <span style={{ fontSize: '1.1rem' }}>𝕏</span>
          Twitter
        </a>
        <a href="https://t.me/SmartTradingClubDapp" target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
          borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
          transition: 'all 0.2s ease',
        }}>
          <ExternalLink size={14} />
          Telegram
        </a>
        <a href={`https://arbiscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
          borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none',
          transition: 'all 0.2s ease',
        }}>
          <ShieldCheck size={14} />
          Contract
        </a>
      </div>
    </>
  );

  // ===== RESULTS PAGE =====

  const renderResults = () => {
    const closedSignals = signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0);
    const wins = closedSignals.filter(s => s.tradePct > 0);
    const losses = closedSignals.filter(s => s.tradePct < 0);
    const winRate = closedSignals.length > 0 ? (wins.length / closedSignals.length * 100) : 0;

    // Best & worst trade (pure price × leverage)
    const getTradeResult = (s) => s.tradePct;
    const bestTrade = closedSignals.length > 0
      ? closedSignals.reduce((a, b) => getTradeResult(a) > getTradeResult(b) ? a : b)
      : null;
    const worstTrade = closedSignals.length > 0
      ? closedSignals.reduce((a, b) => getTradeResult(a) < getTradeResult(b) ? a : b)
      : null;

    // Group signals by period
    const now = Math.floor(Date.now() / 1000);
    const DAY = 86400;

    const groupByPeriod = (signals, days) => {
      const groups = {};
      for (const s of signals) {
        const closedAt = Number(s.closedAt);
        const daysAgo = Math.floor((now - closedAt) / DAY);
        let key;
        if (days === 1) {
          const d = new Date(closedAt * 1000);
          key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        } else if (days === 7) {
          const weekNum = Math.floor(daysAgo / 7);
          key = weekNum === 0 ? 'This Week' : weekNum === 1 ? 'Last Week' : `${weekNum}w ago`;
        } else {
          const d = new Date(closedAt * 1000);
          key = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        }
        if (!groups[key]) groups[key] = { wins: 0, losses: 0, trades: 0 };
        groups[key].trades++;
        if (s.tradePct >= 0) groups[key].wins++;
        else groups[key].losses++;
      }
      return groups;
    };

    // Current streak
    let streak = 0;
    let streakType = '';
    for (const s of [...closedSignals].sort((a, b) => Number(b.closedAt) - Number(a.closedAt))) {
      const isWin = s.tradePct > 0;
      if (streak === 0) {
        streakType = isWin ? 'win' : 'loss';
        streak = 1;
      } else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) {
        streak++;
      } else {
        break;
      }
    }

    // Average result (with leverage)
    const avgResult = closedSignals.length > 0
      ? closedSignals.reduce((sum, s) => sum + getTradeResult(s), 0) / closedSignals.length
      : 0;

    // Total PnL (sum of all leveraged results)
    const totalPnl = closedSignals.reduce((sum, s) => sum + getTradeResult(s), 0);

    const monthlyGroups = groupByPeriod(closedSignals, 30);

    return (
      <>
        {/* Hero Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '32px' }}
        >
          <span className="section-badge" style={{ marginTop: '16px', display: 'inline-block' }}>Verified On-Chain</span>
          <h2 style={{ fontSize: '2rem', margin: '16px 0 8px' }}>
            Trading <span className="text-gold-gradient">Results</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            All results are stored on the Arbitrum blockchain and verifiable by anyone
          </p>
        </motion.div>

        {/* Overview Stats */}
        <motion.div
          variants={staggerContainer} initial="hidden" animate="visible"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}
        >
          {[
            { label: 'Total PnL', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`, color: totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' },
            { label: 'Total Trades', value: closedSignals.length.toString(), color: 'var(--text-primary)' },
            { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? 'var(--success)' : 'var(--danger)' },
            { label: 'Wins', value: wins.length.toString(), color: 'var(--success)' },
            { label: 'Losses', value: losses.length.toString(), color: 'var(--danger)' },
            { label: 'Avg Result', value: `${avgResult >= 0 ? '+' : ''}${avgResult.toFixed(2)}%`, color: avgResult >= 0 ? 'var(--success)' : 'var(--danger)' },
            { label: 'Streak', value: `${streak} ${streakType}${streak > 1 ? 's' : ''}`, color: streakType === 'win' ? 'var(--success)' : streak > 0 ? 'var(--danger)' : 'var(--text-secondary)' },
          ].map((stat, i) => (
            <motion.div key={stat.label} variants={fadeUp} custom={i} style={{
              background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border)', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{stat.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: stat.color }}>{stat.value}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Best & Worst Trade */}
        {bestTrade && (
          <motion.div variants={fadeUp} initial="hidden" animate="visible"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}
          >
            <div style={{ background: 'rgba(52, 211, 153, 0.05)', borderRadius: '14px', padding: '20px', border: '1px solid rgba(52, 211, 153, 0.15)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Best Trade</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)', fontFamily: "'Space Grotesk', sans-serif" }}>
                +{bestTrade.tradePct.toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                #{Number(bestTrade.id)} &middot; {bestTrade.long ? 'LONG' : 'SHORT'} &middot; {formatLeverage(bestTrade.leverage)}x
              </div>
            </div>
            <div style={{ background: 'rgba(248, 113, 113, 0.05)', borderRadius: '14px', padding: '20px', border: '1px solid rgba(248, 113, 113, 0.15)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Worst Trade</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)', fontFamily: "'Space Grotesk', sans-serif" }}>
                {worstTrade.tradePct.toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                #{Number(worstTrade.id)} &middot; {worstTrade.long ? 'LONG' : 'SHORT'} &middot; {formatLeverage(worstTrade.leverage)}x
              </div>
            </div>
          </motion.div>
        )}

        {/* Performance by Period */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}
        >
          {/* Daily Performance */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Daily Performance</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Today', data: performanceStats.platform.today },
                { label: '7 Days', data: performanceStats.platform.week },
                { label: '30 Days', data: performanceStats.platform.month },
              ].map(({ label, data }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '12px 14px',
                }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{data.trades} trades</span>
                    <span style={{
                      fontSize: '0.85rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                      color: data.winRate >= 50 ? 'var(--success)' : data.trades === 0 ? 'var(--text-secondary)' : 'var(--danger)',
                    }}>
                      {data.trades > 0 ? `${data.winRate.toFixed(0)}%` : '-'}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{data.wins}W/{data.losses}L</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Breakdown */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <History size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Monthly Breakdown</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.entries(monthlyGroups).length > 0 ? (
                Object.entries(monthlyGroups).map(([month, data]) => (
                  <div key={month} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '12px 14px',
                  }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{month}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{data.trades} trades</span>
                      <span style={{
                        fontSize: '0.85rem', fontWeight: 700,
                        color: data.wins >= data.losses ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {data.trades > 0 ? `${(data.wins / data.trades * 100).toFixed(0)}%` : '-'}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{data.wins}W/{data.losses}L</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No completed trades yet
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Full Trade Log */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible"
          style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}
        >
          {/* Header + filters */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Trade Log</h3>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { key: 'today', label: 'Today' },
                  { key: '7d', label: '7D' },
                  { key: '30d', label: '30D' },
                  { key: 'all', label: 'All' },
                ].map(p => (
                  <button key={p.key} onClick={() => { setTradeLogPeriod(p.key); setTradeLogFrom(''); setTradeLogTo(''); }} style={{
                    padding: '4px 10px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 600,
                    background: tradeLogPeriod === p.key && !tradeLogFrom ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${tradeLogPeriod === p.key && !tradeLogFrom ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    color: tradeLogPeriod === p.key && !tradeLogFrom ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar strip — days of the month */}
          {(() => {
            const today = new Date();
            const year = calendarMonth.year;
            const month = calendarMonth.month;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const isCurrentMonth = year === today.getUTCFullYear() && month === today.getUTCMonth();
            const currentDay = isCurrentMonth ? today.getUTCDate() : -1;
            const monthName = new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

            // Get trades per day for this month
            const tradesPerDay = {};
            signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0).forEach(s => {
              const closedAt = Number(s.closedAt);
              if (closedAt === 0) return;
              const d = new Date(closedAt * 1000);
              if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
                const day = d.getUTCDate();
                if (!tradesPerDay[day]) tradesPerDay[day] = { wins: 0, losses: 0 };
                if (s.tradePct > 0) tradesPerDay[day].wins++;
                else if (s.tradePct < 0) tradesPerDay[day].losses++;
              }
            });

            // Build rows of 7 days (Mon-Sun)
            const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
            const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0
            const days = [];
            for (let i = 0; i < startOffset; i++) days.push(null);
            for (let d = 1; d <= daysInMonth; d++) days.push(d);
            while (days.length % 7 !== 0) days.push(null);

            const weeks = [];
            for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

            const selectedDay = tradeLogPeriod === 'day' ? parseInt(tradeLogFrom) : null;

            return (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                  <button onClick={() => setCalendarMonth(prev => {
                    const d = new Date(Date.UTC(prev.year, prev.month - 1, 1));
                    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
                  })} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px' }}>&lt;</button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '100px', textAlign: 'center' }}>{monthName} {year}</span>
                  {!isCurrentMonth ? (
                    <button onClick={() => setCalendarMonth(prev => {
                      const d = new Date(Date.UTC(prev.year, prev.month + 1, 1));
                      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
                    })} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px' }}>&gt;</button>
                  ) : <span style={{ width: '24px' }} />}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '4px' }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: '0.55rem', color: 'var(--text-secondary)', opacity: 0.5 }}>{d}</div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '2px' }}>
                    {week.map((day, di) => {
                      if (!day) return <div key={di} />;
                      const info = tradesPerDay[day];
                      const isToday = day === currentDay;
                      const isSelected = selectedDay === day;
                      const hasWins = info?.wins > 0;
                      const hasLosses = info?.losses > 0;
                      const isFuture = isCurrentMonth && day > currentDay;

                      return (
                        <button key={di} onClick={() => {
                          if (isFuture) return;
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          setTradeLogFrom(dateStr);
                          setTradeLogTo(dateStr);
                          setTradeLogPeriod('custom');
                        }} style={{
                          padding: '4px 0', borderRadius: '6px', fontSize: '0.65rem', fontWeight: isToday ? 700 : 500,
                          background: isSelected ? 'rgba(212,168,67,0.2)' : hasWins && !hasLosses ? 'rgba(52,211,153,0.1)' : hasLosses && !hasWins ? 'rgba(248,113,113,0.1)' : hasWins && hasLosses ? 'rgba(212,168,67,0.08)' : 'transparent',
                          border: isToday ? '1px solid rgba(212,168,67,0.4)' : '1px solid transparent',
                          color: isFuture ? 'rgba(255,255,255,0.15)' : isSelected ? 'var(--accent)' : hasWins && !hasLosses ? 'var(--success)' : hasLosses && !hasWins ? 'var(--danger)' : 'var(--text-secondary)',
                          cursor: isFuture ? 'default' : 'pointer',
                          textAlign: 'center',
                          position: 'relative',
                        }}>
                          {day}
                          {info && <div style={{ position: 'absolute', bottom: '1px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '1px' }}>
                            {Array.from({ length: info.wins }).map((_, i) => <div key={'w' + i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--success)' }} />)}
                            {Array.from({ length: info.losses }).map((_, i) => <div key={'l' + i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--danger)' }} />)}
                          </div>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Trade Rows grouped by date */}
          {(() => {
            // Filter by period or custom date range
            const now = Math.floor(Date.now() / 1000);
            let cutoffFrom = 0, cutoffTo = now;

            const utcNow = new Date();
            const utcMidnight = Math.floor(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate()) / 1000);
            if (tradeLogFrom) {
              cutoffFrom = Math.floor(new Date(tradeLogFrom).getTime() / 1000);
              cutoffTo = tradeLogTo ? Math.floor(new Date(tradeLogTo + 'T23:59:59').getTime() / 1000) : now;
            } else {
              cutoffFrom = tradeLogPeriod === 'today' ? utcMidnight
                : tradeLogPeriod === '7d' ? now - 7 * 86400
                : tradeLogPeriod === '30d' ? now - 30 * 86400
                : 0;
            }
            const filtered = signalHistory.filter(s => {
              const ts = Number(s.closedAt || s.timestamp);
              return ts >= cutoffFrom && ts <= cutoffTo && !(s.closed && Number(s.resultPct) === 0);
            });

            return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {(() => {
              // Group signals by date
              const grouped = {};
              filtered.forEach(signal => {
                const ts = Number(signal.timestamp) * 1000;
                const dateKey = new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                if (!grouped[dateKey]) grouped[dateKey] = { signals: [], dayPnl: 0, wins: 0, losses: 0 };
                grouped[dateKey].signals.push(signal);
                if (signal.closed) {
                  grouped[dateKey].dayPnl += signal.tradePct;
                  if (signal.tradePct >= 0) grouped[dateKey].wins++; else grouped[dateKey].losses++;
                }
              });

              return Object.entries(grouped).map(([date, group]) => (
                <div key={date}>
                  {/* Date header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px 6px', marginTop: '4px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{date}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {(group.wins > 0 || group.losses > 0) && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                          {group.wins}W / {group.losses}L
                        </span>
                      )}
                      {(group.wins > 0 || group.losses > 0) && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                          color: group.dayPnl >= 0 ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {group.dayPnl >= 0 ? '+' : ''}{group.dayPnl.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trades for this date */}
                  {group.signals.map((signal, index) => {
                    const leverage = Number(signal.leverage) / 1000;
                    const result = signal.tradePct;
                    const isClosed = signal.closed;
              return (
                <motion.div
                  className="trade-log-row"
                  key={Number(signal.id)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <span className="trade-log-id" style={{ color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>#{Number(signal.id)}</span>
                  <span className="trade-log-dir" style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700, textAlign: 'center',
                    background: signal.long ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                    color: signal.long ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {signal.long ? 'LONG' : 'SHORT'} {formatLeverage(signal.leverage)}x
                  </span>
                  <span className="trade-log-entry" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>
                    ${formatGTradePrice(signal.entryPrice)}
                  </span>
                  <span className="trade-log-copiers" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.8rem' }}>
                    {Number(signal.copierCount)} · ${parseFloat(ethers.formatUnits(signal.totalCopied || 0n, 6)).toFixed(0)}
                  </span>
                  <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif" }}>
                    {(() => {
                      const totalCol = parseFloat(ethers.formatUnits(signal.totalCopied || 0n, 6));
                      const totalRet = parseFloat(ethers.formatUnits(signal.totalReturned || 0n, 6));
                      if (isClosed) {
                        const dollarPnl = totalCol * result / 100;
                        return (
                          <>
                            <div style={{ fontWeight: 700, color: result >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {result >= 0 ? '+' : ''}{result.toFixed(2)}%
                            </div>
                            {totalCol > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                              {dollarPnl >= 0 ? '+' : '-'}${Math.abs(dollarPnl).toFixed(2)}
                            </div>}
                          </>
                        );
                      } else if (livePrice) {
                        const entry = Number(signal.entryPrice) / 1e10;
                        const pctMove = ((livePrice - entry) / entry) * 100 * (signal.long ? 1 : -1);
                        const livePnl = pctMove * leverage;
                        const dollarPnl = totalCol * livePnl / 100;
                        const isProfit = livePnl >= 0;
                        return (
                          <>
                            <div style={{ fontWeight: 700, color: isProfit ? 'var(--success)' : 'var(--danger)' }}>
                              {isProfit ? '+' : ''}{livePnl.toFixed(2)}%
                            </div>
                            {totalCol > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                              {isProfit ? '+' : '-'}${Math.abs(dollarPnl).toFixed(2)}
                            </div>}
                          </>
                        );
                      }
                      return <div style={{ fontWeight: 700, color: 'var(--accent)' }}>OPEN</div>;
                    })()}
                  </div>
                  {/* Copied badge */}
                  {account ? (
                    <span style={{
                      padding: '2px 6px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 600, textAlign: 'center',
                      background: userPositions[Number(signal.id)] ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
                      color: userPositions[Number(signal.id)] ? 'var(--success)' : 'var(--text-secondary)',
                      border: `1px solid ${userPositions[Number(signal.id)] ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                      {userPositions[Number(signal.id)] ? 'COPIED' : '—'}
                    </span>
                  ) : <span />}
                </motion.div>
              );
            })}
                </div>
              ));
            })()}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <BarChart3 size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                <div>{tradeLogPeriod === 'all' ? 'No trades recorded yet' : 'No trades in this period'}</div>
              </div>
            )}
          </div>
            );
          })()}
        </motion.div>

        {/* Verification Note */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible"
          style={{
            display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px',
            background: 'rgba(212, 168, 67, 0.05)', borderRadius: '12px', padding: '16px 20px',
            border: '1px solid rgba(212, 168, 67, 0.15)',
          }}
        >
          <ShieldCheck size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>On-Chain Verified</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              All results are recorded on the Arbitrum blockchain. Verify on{' '}
              <a href={`https://arbiscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                Arbiscan
              </a>
              {' · '}
              Join our{' '}
              <a href="https://t.me/SmartTradingClubDapp" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                Telegram Community
              </a>
            </div>
          </div>
        </motion.div>
      </>
    );
  };

  // ===== DASHBOARD =====

  // ===== STRATEGIES / TRADERS PAGE =====
  const [followAmount, setFollowAmount] = useState("10");
  const [positionsTab, setPositionsTab] = useState('positions');
  const [strategySort, setStrategySort] = useState('all');
  const [providerProfiles, setProviderProfiles] = useState({});
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfileAvatar, setEditProfileAvatar] = useState('');
  const [tradeLogPeriod, setTradeLogPeriod] = useState('all');
  const [tradeLogFrom, setTradeLogFrom] = useState('');
  const [tradeLogTo, setTradeLogTo] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => { const n = new Date(); return { year: n.getUTCFullYear(), month: n.getUTCMonth() }; });
  const [followTarget, setFollowTarget] = useState(null); // provider address for follow modal
  const [selectedProvider, setSelectedProvider] = useState(null); // provider object for detail modal

  // Save profile to Supabase
  const saveProfile = async () => {
    if (!account || !supabase) return;
    try {
      await supabase.from('provider_profiles').upsert({
        wallet_address: account.toLowerCase(),
        display_name: editProfileName.trim() || null,
        avatar_url: editProfileAvatar.trim() || null,
      }, { onConflict: 'wallet_address' });
      setProviderProfiles(prev => ({
        ...prev,
        [account.toLowerCase()]: { display_name: editProfileName.trim(), avatar_url: editProfileAvatar.trim() },
      }));
      setEditProfileOpen(false);
    } catch (err) { console.error('Profile save error:', err); }
  };

  // ═══════════════════════════════════════════
  //  DOCS TAB
  // ═══════════════════════════════════════════
  const renderDocs = () => {
    const GITHUB_URL = 'https://github.com/SmartTradingDev/TradingContracts';
    const CONTRACT_ADDR = CONTRACT_ADDRESS;

    const sections = [
      {
        id: 'overview',
        icon: <BookOpen size={20} />,
        title: 'Contract Overview',
        content: [
          { label: 'Contract', value: 'GoldCopyTraderV3' },
          { label: 'Network', value: 'Arbitrum One' },
          { label: 'Collateral', value: 'USDC (6 decimals)' },
          { label: 'Trade Pair', value: 'XAU/USD via gTrade (Gains Network)' },
          { label: 'Tests', value: '490+ tests, 0 failures' },
          { label: 'Audits', value: 'Pashov AI audit, all findings fixed' },
        ]
      },
      {
        id: 'lifecycle',
        icon: <Zap size={20} />,
        title: 'Signal Lifecycle',
        steps: [
          { phase: 'COLLECTING', desc: 'Admin posts signal. Users deposit USDC. Auto-copy executes.' },
          { phase: 'TRADING', desc: 'Funds sent to gTrade. Leveraged XAU/USD position opens. TP/SL monitored.' },
          { phase: 'SETTLED', desc: 'Trade closed. Returns auto-calculated on-chain. Users claim proportional share.' },
        ]
      },
      {
        id: 'constants',
        icon: <Settings size={20} />,
        title: 'Parameters',
        content: [
          { label: 'Min Deposit', value: '5 USDC (configurable)' },
          { label: 'Max Deposit', value: '50,000 USDC per user (configurable)' },
          { label: 'Max Pool', value: '500,000 USDC per signal (configurable)' },
          { label: 'Performance Fee', value: '20% of profit (0% on loss)' },
          { label: 'Leverage Range', value: '2x — 250x' },
          { label: 'Force Settle Delay', value: '7 days (admin only, when gTrade unresponsive)' },
          { label: 'Collecting Timeout', value: '24 hours (permissionless cancel)' },
          { label: 'Rescue Delay', value: '1 day after settle (admin emergency)' },
        ]
      },
      {
        id: 'security',
        icon: <Shield size={20} />,
        title: 'Security',
        features: [
          'On-chain settle calculation — no off-chain math, no $0 settle bugs',
          'Vault isolation per signal — independent accounting, no cross-contamination',
          'Reentrancy guards on all state-changing functions',
          'SafeERC20 for all token transfers',
          '2-step admin transfer (prevents accidental loss)',
          '3x cap on settlement (prevents accounting manipulation)',
          'Sweep blocked during active trades',
          'reSettle increase-only (prevents admin theft)',
          'Fee snapshot at signal creation (immune to mid-trade changes)',
          'No emergencyWithdraw — replaced with admin-gated rescueUser',
          'Outflow tracking during TRADING (claims/fees compensated in settle)',
        ]
      },
      {
        id: 'escapes',
        icon: <Lock size={20} />,
        title: 'Escape Hatches',
        desc: 'No scenario exists where funds are permanently locked.',
        escapes: [
          { phase: 'COLLECTING', action: 'withdrawDeposit()', who: 'User', wait: 'Instant' },
          { phase: 'COLLECTING', action: 'cancelSignal()', who: 'Admin', wait: 'Instant' },
          { phase: 'COLLECTING', action: 'userCancelExpiredSignal()', who: 'Anyone', wait: '24 hours' },
          { phase: 'TRADING', action: 'cancelGTradeOrder()', who: 'Admin', wait: 'Instant' },
          { phase: 'TRADING', action: 'forceSettle()', who: 'Admin', wait: '7 days' },
          { phase: 'TRADING', action: 'forceUnstick()', who: 'Admin', wait: '7 days' },
          { phase: 'SETTLED', action: 'claim()', who: 'User', wait: 'Instant' },
          { phase: 'SETTLED', action: 'claimFor()', who: 'Admin/Bot', wait: 'Instant' },
          { phase: 'SETTLED', action: 'reSettleSignal()', who: 'Admin', wait: 'Instant' },
          { phase: 'SETTLED', action: 'rescueUser()', who: 'Admin (opt-in)', wait: '1 day' },
        ]
      },
      {
        id: 'tests',
        icon: <CheckCircle2 size={20} />,
        title: 'Test Coverage',
        tests: [
          { suite: 'Main Suite', count: 167, desc: 'All functions, access control, edge cases' },
          { suite: 'Pashov Regression', count: 20, desc: 'Audit finding regression tests' },
          { suite: 'Bot Flow', count: 18, desc: 'Bot lifecycle and ABI compatibility' },
          { suite: 'Stress Tests', count: 42, desc: 'Crash scenarios, race conditions, recovery' },
          { suite: 'Bulletproof', count: 41, desc: 'Reserves, pause, admin transfer, 30-signal stress' },
          { suite: 'Extreme Edge Cases', count: 47, desc: 'Boundaries, nonces, streaks, 50-signal mega' },
          { suite: 'Realistic gTrade', count: 18, desc: 'Real USDC consumption + return flows' },
          { suite: 'Production Sim', count: 11, desc: 'gTrade fees + PnL calculations' },
          { suite: 'Timebomb Regression', count: 17, desc: 'V2 failure scenario reproduction' },
          { suite: 'Final Path', count: 20, desc: 'Index tracking, 50-signal full production' },
          { suite: 'Edge Cases R2', count: 27, desc: 'gTrade rejects, wrong index, missing confirm' },
          { suite: 'Edge Cases R3', count: 25, desc: 'reSettle, 3x cap, timeouts, leverage extremes' },
          { suite: 'Index Tracking', count: 12, desc: 'gTrade trade index assignment and tracking' },
          { suite: 'Rescue Tests', count: 25, desc: 'Emergency rescue function with safety guards' },
        ]
      }
    ];

    const cardStyle = {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '16px',
      padding: '28px',
      marginBottom: '20px',
    };
    const headerStyle = {
      display: 'flex', alignItems: 'center', gap: '12px',
      marginBottom: '20px', color: '#FFD700',
      fontSize: '1.15rem', fontWeight: 600,
    };
    const rowStyle = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    };
    const labelStyle = { color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' };
    const valueStyle = { color: '#fff', fontSize: '0.85rem', fontWeight: 500, textAlign: 'right' };
    const badgeStyle = (color) => ({
      display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem',
      fontWeight: 600, background: color + '22', color: color, letterSpacing: '0.03em',
    });
    const phaseColor = { COLLECTING: '#3B82F6', TRADING: '#F59E0B', SETTLED: '#10B981' };

    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '8px' }}>
            <span style={{ color: '#FFD700' }}>Smart Contract</span> Documentation
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', marginBottom: '20px' }}>
            GoldCopyTraderV3 — Audited, tested, transparent
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
              <GitBranch size={16} /> GitHub Repository <ExternalLink size={13} />
            </a>
            <a href={`https://arbiscan.io/address/${CONTRACT_ADDR}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)',
                borderRadius: '10px', color: '#FFD700', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
              <ShieldCheck size={16} /> Verified on Arbiscan <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Overview */}
        <div style={cardStyle}>
          <div style={headerStyle}>{sections[0].icon} {sections[0].title}</div>
          {sections[0].content.map((r, i) => (
            <div key={i} style={rowStyle}>
              <span style={labelStyle}>{r.label}</span>
              <span style={valueStyle}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Lifecycle */}
        <div style={cardStyle}>
          <div style={headerStyle}>{sections[1].icon} {sections[1].title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {sections[1].steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ ...badgeStyle(phaseColor[s.phase]), minWidth: '95px', textAlign: 'center', marginTop: '2px' }}>
                  {s.phase}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {i < 2 && <ArrowRight size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />}
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div style={cardStyle}>
          <div style={headerStyle}>{sections[2].icon} {sections[2].title}</div>
          {sections[2].content.map((r, i) => (
            <div key={i} style={rowStyle}>
              <span style={labelStyle}>{r.label}</span>
              <span style={valueStyle}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Security */}
        <div style={cardStyle}>
          <div style={headerStyle}>{sections[3].icon} {sections[3].title}</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {sections[3].features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <CheckCircle2 size={15} style={{ color: '#10B981', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Escape Hatches */}
        <div style={cardStyle}>
          <div style={headerStyle}>{sections[4].icon} {sections[4].title}</div>
          <p style={{ color: '#10B981', fontSize: '0.8rem', fontWeight: 500, marginBottom: '16px' }}>
            {sections[4].desc}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Phase', 'Function', 'Who', 'Wait'].map(h => (
                    <th key={h} style={{ padding: '8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections[4].escapes.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px' }}><span style={badgeStyle(phaseColor[e.phase])}>{e.phase}</span></td>
                    <td style={{ padding: '8px', color: '#FFD700', fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.action}</td>
                    <td style={{ padding: '8px', color: 'rgba(255,255,255,0.7)' }}>{e.who}</td>
                    <td style={{ padding: '8px', color: 'rgba(255,255,255,0.5)' }}>{e.wait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Test Coverage */}
        <div style={cardStyle}>
          <div style={headerStyle}>{sections[5].icon} {sections[5].title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
            padding: '14px 18px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '10px' }}>
            <CheckCircle2 size={20} style={{ color: '#10B981' }} />
            <div>
              <div style={{ color: '#10B981', fontWeight: 600, fontSize: '1.1rem' }}>
                {sections[5].tests.reduce((s, t) => s + t.count, 0)}+ Tests Passing
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>0 failures across all suites</div>
            </div>
          </div>
          {sections[5].tests.map((t, i) => (
            <div key={i} style={{ ...rowStyle, gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{t.suite}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{t.desc}</div>
              </div>
              <span style={{ ...badgeStyle('#10B981'), minWidth: '40px', textAlign: 'center' }}>{t.count}</span>
            </div>
          ))}
        </div>

        {/* Full Docs Link */}
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <a href={GITHUB_URL + '/tree/main/docs'} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 28px',
              background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))',
              border: '1px solid rgba(255,215,0,0.3)', borderRadius: '12px',
              color: '#FFD700', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>
            <FileText size={18} />
            Full Technical Documentation
            <ExternalLink size={14} />
          </a>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '12px' }}>
            Accounting, Bot Guide, Admin Guide, Events, Errors — all on GitHub
          </p>
        </div>
      </div>
    );
  };

  const renderAnalysis = () => {
    if (!account) {
      return (
        <div style={{ maxWidth: 720, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: '48px 32px',
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 style={{ margin: '0 0 12px', fontSize: '1.5rem', fontWeight: 600 }}>Members Only</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Connect your wallet to access the Scalp AI engine. Intraday gold setups (5m–1H), refreshed every 5 minutes, with entry / stop / target and a hard validity window.
            </p>
            <button className="btn btn-gold btn-lg" onClick={() => connectWallet?.()}>
              Connect Wallet
            </button>
          </div>
        </div>
      );
    }

    const a = analysisData;
    const verdictColor = a?.verdict === 'bullish' ? '#22c55e' : a?.verdict === 'bearish' ? '#ef4444' : '#eab308';
    const verdictBg = a?.verdict === 'bullish' ? 'rgba(34,197,94,0.12)' : a?.verdict === 'bearish' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)';

    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>
              <span className="text-gold-gradient">Scalp AI</span> — XAU/USD intraday
            </h1>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
              {a?.created_at ? `Last updated ${new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
              {a?.cached ? ' • cached' : ''}
              {a?.accuracy?.pct != null && (
                <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.3)', color: '#D4A843', fontSize: '0.75rem' }}>
                  {a.accuracy.pct}% hit rate · last {a.accuracy.total} trades
                </span>
              )}
              {a?.data_quality && a.data_quality.ok === false && (
                <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)', color: '#eab308', fontSize: '0.75rem' }}>
                  ⚠ Data quality low (Δ ${a.data_quality.delta_usd})
                </span>
              )}
            </p>
          </div>
          <button
            className="btn btn-glass"
            onClick={() => loadAnalysis(true)}
            disabled={analysisLoading}
            style={{ minHeight: 38 }}
          >
            {analysisLoading ? 'Analyzing…' : 'Refresh'}
          </button>
        </div>

        {analysisLoading && !a && (
          <div style={{ textAlign: 'center', padding: 80, color: 'rgba(255,255,255,0.5)' }}>
            Running analysis…
          </div>
        )}
        {analysisError && !a && (
          <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>
            {analysisError}
          </div>
        )}

        {a && (
          <>
            <div style={{
              background: verdictBg,
              border: `1px solid ${verdictColor}40`,
              borderRadius: 16,
              padding: '24px 28px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              flexWrap: 'wrap',
            }}>
              <div style={{ flex: '0 0 auto' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6 }}>Verdict</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: verdictColor, textTransform: 'uppercase' }}>
                  {a.verdict}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  {a.confidence}% confidence
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Live price
                  {liveGoldPrice != null && <span className="pulse-dot" style={{ width: 6, height: 6, background: '#22c55e' }} />}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: priceFlash === 'up' ? '#22c55e' : priceFlash === 'down' ? '#ef4444' : 'inherit', transition: 'color 0.4s ease' }}>
                  ${(liveGoldPrice ?? a.price)?.toFixed(2)}
                </div>
                {liveGoldPrice != null && a.price != null && (
                  <div style={{ fontSize: '0.7rem', opacity: 0.55, marginTop: 2 }}>
                    {(liveGoldPrice - a.price >= 0 ? '+' : '')}{(liveGoldPrice - a.price).toFixed(2)} since analysis
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 280, fontSize: '0.95rem', lineHeight: 1.55, opacity: 0.92 }}>
                {a.summary}
              </div>
              {a.setup_type && a.setup_type !== 'none' && a.confidence >= 75 && a.rr_ratio >= 1.5 && (
                <div style={{ flex: '0 0 auto', padding: '6px 12px', borderRadius: 999, background: '#D4A843', color: '#0a0a0a', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                  ⚡ Tradeable Signal
                </div>
              )}
            </div>

            {/* Multi-timeframe alignment strip + session + valid-until */}
            {(a.trend_4h || a.trend_1h || a.trend_15m || a.session) && (() => {
              const tfTrend = (t) => t === 'uptrend' ? { label: 'UP', color: '#22c55e' } : t === 'downtrend' ? { label: 'DOWN', color: '#ef4444' } : { label: 'FLAT', color: '#eab308' };
              const tfs = [
                { tf: '4H', t: a.trend_4h },
                { tf: '1H', t: a.trend_1h },
                { tf: '15m', t: a.trend_15m },
              ].filter(x => x.t);
              const sessionLabel = { asia: '🌏 Asia', london: '🇬🇧 London', ny: '🇺🇸 NY', 'off-hours': '🌙 Off-hours' }[a.session] || a.session;
              const minsLeft = a.valid_until ? Math.max(0, Math.floor((new Date(a.valid_until).getTime() - Date.now()) / 60000)) : null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                  {a.session && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 14, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: 1 }}>Session</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{sessionLabel}</span>
                    </div>
                  )}
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>Trend</span>
                  {tfs.map(({ tf, t }, i) => {
                    const v = tfTrend(t);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.8rem', opacity: 0.7, fontWeight: 600 }}>{tf}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: `${v.color}20`, border: `1px solid ${v.color}40`, color: v.color, fontSize: '0.72rem', fontWeight: 700 }}>{v.label}</span>
                      </div>
                    );
                  })}
                  {minsLeft != null && a.setup_type !== 'none' && (
                    <div style={{ marginLeft: 'auto', fontSize: '0.74rem', opacity: 0.7 }}>
                      Setup valid for <b>{minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : `${minsLeft}m`}</b>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Trade idea card — only when setup is real */}
            {a.setup_type && a.setup_type !== 'none' && a.entry != null && a.stop_loss != null && a.take_profit != null && (() => {
              const isLong = a.verdict === 'bullish';
              const sideColor = isLong ? '#22c55e' : '#ef4444';
              const qualifies = a.confidence >= 75 && a.rr_ratio >= 1.5;
              return (
                <div style={{ marginBottom: 20, background: qualifies ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${qualifies ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>Trade Idea</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 2 }}>
                        <span style={{ color: sideColor }}>{isLong ? 'LONG' : 'SHORT'}</span>
                        <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>{a.setup_type}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', opacity: 0.55 }}>R:R</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: a.rr_ratio >= 2 ? '#22c55e' : '#eab308' }}>{Number(a.rr_ratio).toFixed(2)} : 1</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entry</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>${Number(a.entry).toFixed(2)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.5 }}>Stop loss</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ef4444' }}>${Number(a.stop_loss).toFixed(2)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.5 }}>Take profit</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#22c55e' }}>${Number(a.take_profit).toFixed(2)}</div>
                    </div>
                  </div>
                  {!qualifies && (
                    <div style={{ marginTop: 12, fontSize: '0.78rem', opacity: 0.6, lineHeight: 1.5 }}>
                      Not auto-publishable as signal — requires confidence ≥ 75 ({a.confidence}%) and R:R ≥ 1.5 ({Number(a.rr_ratio).toFixed(2)}).
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Macro row: DXY + 10Y yield */}
            {(a.dxy != null || a.yield_10y != null) && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {a.dxy != null && (
                  <div style={{ flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>DXY (Dollar Index)</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 2 }}>{Number(a.dxy).toFixed(2)}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.55, marginTop: 1 }}>inverse to gold</div>
                  </div>
                )}
                {a.yield_10y != null && (
                  <div style={{ flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>US 10Y Yield</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 2 }}>{Number(a.yield_10y).toFixed(2)}%</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.55, marginTop: 1 }}>inverse to gold</div>
                  </div>
                )}
              </div>
            )}

            {/* Candlestick chart with S/R/target overlay */}
            {Array.isArray(a.ohlc_30d) && a.ohlc_30d.length > 0 && (() => {
              const data = a.ohlc_30d;
              const W = 900, H = 280, padL = 50, padR = 70, padT = 16, padB = 24;
              const innerW = W - padL - padR;
              const innerH = H - padT - padB;
              const allValues = data.flatMap(c => [c.h, c.l]).concat([a.levels?.support, a.levels?.resistance, a.levels?.target].filter(v => v != null));
              const minP = Math.min(...allValues) * 0.998;
              const maxP = Math.max(...allValues) * 1.002;
              const yScale = v => padT + innerH - ((v - minP) / (maxP - minP)) * innerH;
              const candleW = Math.max(2, (innerW / data.length) * 0.7);
              const xCenter = i => padL + (i + 0.5) * (innerW / data.length);

              const horizLine = (price, color, label) => price == null ? null : (
                <g key={label}>
                  <line x1={padL} x2={padL + innerW} y1={yScale(price)} y2={yScale(price)} stroke={color} strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
                  <rect x={padL + innerW + 2} y={yScale(price) - 9} width={66} height={18} rx={3} fill={color} opacity={0.85} />
                  <text x={padL + innerW + 35} y={yScale(price) + 4} fontSize="10" fill="#0a0a0a" fontWeight="700" textAnchor="middle">{label} ${Number(price).toFixed(0)}</text>
                </g>
              );

              const ticks = 5;
              const yTicks = Array.from({ length: ticks }, (_, i) => minP + (maxP - minP) * (i / (ticks - 1)));

              return (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 20, overflowX: 'auto' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, marginBottom: 4, paddingLeft: 4 }}>
                    Last 48 hours (1H) · Levels overlaid
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                    {yTicks.map((v, i) => (
                      <g key={i}>
                        <line x1={padL} x2={padL + innerW} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                        <text x={padL - 6} y={yScale(v) + 3} fontSize="10" fill="rgba(255,255,255,0.4)" textAnchor="end">{v.toFixed(0)}</text>
                      </g>
                    ))}
                    {data.map((c, i) => {
                      const up = c.c >= c.o;
                      const color = up ? '#22c55e' : '#ef4444';
                      const x = xCenter(i);
                      return (
                        <g key={i}>
                          <line x1={x} x2={x} y1={yScale(c.h)} y2={yScale(c.l)} stroke={color} strokeWidth={1} />
                          <rect
                            x={x - candleW / 2}
                            y={yScale(Math.max(c.o, c.c))}
                            width={candleW}
                            height={Math.max(1, Math.abs(yScale(c.o) - yScale(c.c)))}
                            fill={color}
                          />
                        </g>
                      );
                    })}
                    {horizLine(a.levels?.support, '#22c55e', 'S')}
                    {horizLine(a.levels?.resistance, '#ef4444', 'R')}
                    {horizLine(a.levels?.target, '#D4A843', 'T')}
                    {(() => {
                      const nowP = liveGoldPrice ?? a.price;
                      if (nowP == null) return null;
                      const flashColor = priceFlash === 'up' ? '#22c55e' : priceFlash === 'down' ? '#ef4444' : '#fff';
                      return (
                        <g>
                          <line x1={padL} x2={padL + innerW} y1={yScale(nowP)} y2={yScale(nowP)} stroke={flashColor} strokeWidth={priceFlash ? 1.5 : 1} opacity={priceFlash ? 0.85 : 0.4} style={{ transition: 'all 0.3s' }} />
                          <rect x={padL + innerW + 2} y={yScale(nowP) - 9} width={70} height={18} rx={3} fill={flashColor} style={{ transition: 'fill 0.3s' }} />
                          <text x={padL + innerW + 37} y={yScale(nowP) + 4} fontSize="10" fill="#0a0a0a" fontWeight="700" textAnchor="middle">
                            {priceFlash === 'up' ? '▲' : priceFlash === 'down' ? '▼' : ''} ${Number(nowP).toFixed(2)}
                          </text>
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, marginBottom: 12 }}>
                  Key Levels
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.7 }}>Support</span>
                    <span style={{ fontWeight: 600, color: '#22c55e' }}>${a.levels?.support?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.7 }}>Resistance</span>
                    <span style={{ fontWeight: 600, color: '#ef4444' }}>${a.levels?.resistance?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.7 }}>Target</span>
                    <span style={{ fontWeight: 600, color: '#D4A843' }}>${a.levels?.target?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, marginBottom: 12 }}>
                  Technical
                </div>
                <div style={{ display: 'grid', gap: 8, fontSize: '0.9rem', lineHeight: 1.5 }}>
                  <div><b>Trend:</b> {a.technical?.trend}</div>
                  <div><b>RSI:</b> {a.technical?.rsi?.toFixed(1)} — <span style={{ opacity: 0.8 }}>{a.technical?.rsi_note}</span></div>
                  <div><b>MACD:</b> <span style={{ opacity: 0.8 }}>{a.technical?.macd_note}</span></div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, marginBottom: 12 }}>
                  Fundamental
                </div>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.55, opacity: 0.9, marginBottom: 12 }}>
                  {a.fundamental?.note}
                </div>
                {a.fundamental?.events?.length > 0 && (
                  <div style={{ display: 'grid', gap: 8, fontSize: '0.85rem' }}>
                    {a.fundamental.events.map((e, i) => (
                      <div key={i} style={{ borderLeft: '2px solid rgba(212,168,67,0.4)', paddingLeft: 10 }}>
                        <div style={{ fontWeight: 600 }}>{e.event}</div>
                        <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>{e.when}</div>
                        <div style={{ opacity: 0.85, marginTop: 2 }}>{e.impact}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Per-setup hit rate + Recent Signals */}
            {(a.accuracy?.by_setup && Object.keys(a.accuracy.by_setup).length > 0) || (Array.isArray(a.recent_signals) && a.recent_signals.length > 0) ? (
              <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>
                    Track Record
                  </div>
                  {a.accuracy?.total > 0 && (
                    <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                      Overall: <b style={{ color: a.accuracy.pct >= 55 ? '#22c55e' : a.accuracy.pct >= 45 ? '#eab308' : '#ef4444' }}>{a.accuracy.pct}%</b> over {a.accuracy.total} closed trades
                    </div>
                  )}
                </div>

                {a.accuracy?.by_setup && Object.keys(a.accuracy.by_setup).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {Object.entries(a.accuracy.by_setup).map(([setup, s]) => {
                      const color = s.pct >= 55 ? '#22c55e' : s.pct >= 45 ? '#eab308' : '#ef4444';
                      return (
                        <div key={setup} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: `1px solid ${color}30` }}>
                          <div style={{ fontSize: '0.72rem', opacity: 0.7, textTransform: 'capitalize' }}>{setup.replace(/_/g, ' ')}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{s.pct}%</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.55 }}>{s.correct}/{s.total}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {Array.isArray(a.recent_signals) && a.recent_signals.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, marginBottom: 8 }}>Recent signals</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {a.recent_signals.map(s => {
                        const isLong = s.verdict === 'bullish';
                        const sideColor = isLong ? '#22c55e' : '#ef4444';
                        const outcomeIcon = s.outcome_type === 'tp' ? { icon: '✅', color: '#22c55e', label: 'TP' }
                          : s.outcome_type === 'sl' ? { icon: '❌', color: '#ef4444', label: 'SL' }
                          : s.outcome_type === 'timeout' ? { icon: '⏱', color: 'rgba(255,255,255,0.5)', label: 'Timeout' }
                          : s.outcome_type === 'no-trade' ? { icon: '—', color: 'rgba(255,255,255,0.4)', label: 'No-trade' }
                          : s.valid_until && new Date(s.valid_until).getTime() > Date.now()
                            ? { icon: '🟡', color: '#eab308', label: 'Active' }
                            : { icon: '⏳', color: 'rgba(255,255,255,0.4)', label: 'Pending' };
                        return (
                          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: '0.78rem' }}>
                            <span style={{ color: sideColor, fontWeight: 700, minWidth: 42 }}>{isLong ? 'LONG' : 'SHORT'}</span>
                            <span style={{ opacity: 0.85, textTransform: 'capitalize' }}>{(s.setup_type || '').replace(/_/g, ' ')}</span>
                            <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{s.entry != null ? `$${Number(s.entry).toFixed(0)}` : '—'}</span>
                            <span style={{ opacity: 0.5, fontSize: '0.72rem' }}>R:R {s.rr_ratio != null ? Number(s.rr_ratio).toFixed(1) : '—'}</span>
                            <span style={{ color: outcomeIcon.color, fontSize: '0.72rem', fontWeight: 600 }}>{outcomeIcon.icon} {outcomeIcon.label}</span>
                            <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>{new Date(s.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {/* CFTC speculator positioning */}
            {a.cot_specs_net != null && (() => {
              const net = Number(a.cot_specs_net);
              const change = a.cot_specs_change != null ? Number(a.cot_specs_change) : null;
              // Heuristic: > 200K net long is historically extreme for gold; < 50K modest
              const extreme = net > 200000 ? 'extreme long' : net > 100000 ? 'heavy long' : net < -50000 ? 'extreme short' : net < 0 ? 'net short' : 'moderate long';
              const extremeColor = (net > 200000 || net < -50000) ? '#ef4444' : net > 100000 ? '#eab308' : '#22c55e';
              return (
                <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>
                      CFTC Speculator Positioning
                    </div>
                    {a.cot_report_date && (
                      <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Report: {a.cot_report_date}</div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase' }}>Specs Net</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 2 }}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: extremeColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>
                        {extreme}
                      </div>
                    </div>
                    {change != null && (
                      <div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.55, textTransform: 'uppercase' }}>Week-over-Week Δ</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 2, color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                          {change >= 0 ? '+' : ''}{change.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.55, marginTop: 1 }}>contracts</div>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 10, fontSize: '0.78rem', opacity: 0.65, lineHeight: 1.5 }}>
                    Contrarian indicator: extreme net long often precedes tops, extreme net short often precedes bottoms.
                  </div>
                </div>
              );
            })()}

            {/* Recent gold-related headlines */}
            {Array.isArray(a.headlines) && a.headlines.length > 0 && (
              <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, marginBottom: 12 }}>
                  Recent Headlines
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {a.headlines.slice(0, 5).map((h, i) => (
                    <a key={i} href={h.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none', color: 'inherit', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
                      <div style={{ fontSize: '0.88rem', lineHeight: 1.4 }}>{h.title}</div>
                      <div style={{ fontSize: '0.72rem', opacity: 0.55, marginTop: 3 }}>
                        {h.publisher}{h.published_at ? ` · ${new Date(h.published_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Not financial advice. AI-generated analysis based on price data, macro indicators, news headlines and economic events. Accuracy track-record reflects past directional moves &gt;0.3% within 24h of each verdict. Always do your own research.
            </div>
          </>
        )}
      </div>
    );
  };

  const renderStrategies = () => {
    // Sort providers
    let traders = [...marketplaceProviders];
    if (strategySort === 'pnl') traders.sort((a, b) => b.totalPnlPct - a.totalPnlPct);
    else if (strategySort === 'winrate') traders.sort((a, b) => b.winRate - a.winRate || b.totalTrades - a.totalTrades);
    else if (strategySort === 'followers') traders.sort((a, b) => b.followers - a.followers);

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>

        {/* Hero */}
        <motion.section className="section" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
          <motion.div className="section-header" variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div className="section-badge" variants={fadeUp} style={{ background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)' }}>
              <Trophy size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ color: 'var(--accent)' }}>Strategy Marketplace</span>
            </motion.div>
            <motion.h2 className="section-title" variants={fadeUp}>
              Follow the Best.{' '}
              <span className="text-gold-gradient">Trade Smarter.</span>
            </motion.h2>
            <motion.p className="section-subtitle" variants={fadeUp}>
              Browse top-performing traders, analyze their track record, and copy their trades automatically or per signal.
            </motion.p>
          </motion.div>
        </motion.section>

        {/* Become a Provider CTA */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '1.5rem' }}>
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', maxWidth: '900px', margin: '0 auto' }}
          >
            <div style={{
              position: 'absolute', inset: '-1px', borderRadius: '20px',
              background: 'conic-gradient(from 200deg, transparent, rgba(212,168,67,0.3), transparent, rgba(52,211,153,0.15), transparent)',
              animation: 'spin 8s linear infinite', filter: 'blur(2px)', opacity: 0.5,
            }} />
            <div style={{
              position: 'relative', zIndex: 1, background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
              borderRadius: '20px', padding: '28px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(212,168,67,0.2), rgba(212,168,67,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: '1px solid rgba(212,168,67,0.15)',
                }}>
                  <Target size={22} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '3px' }}>
                    Become a Strategy Provider
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Share your trades, build a following, and earn fees from your copiers.
                  </div>
                </div>
              </div>
              <button
                className="btn btn-primary btn-glow"
                style={{ padding: '11px 24px', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                onClick={connectWallet}
                disabled={!!account}
              >
                {account ? <><CheckCircle2 size={14} /> Wallet Connected</> : <><Wallet size={14} /> Connect to Start</>}
              </button>
            </div>
          </motion.div>
        </motion.section>

        {/* Filter bar */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '0.5rem' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { key: 'all', label: 'All Traders' },
                { key: 'pnl', label: 'Top PnL' },
                { key: 'winrate', label: 'Win Rate' },
                { key: 'followers', label: 'Most Followed' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setStrategySort(opt.key)}
                  style={{
                    padding: '7px 16px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
                    background: strategySort === opt.key ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${strategySort === opt.key ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    color: strategySort === opt.key ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: 'var(--accent)' }}>{traders.length}</span> traders
            </div>
          </div>
        </motion.section>

        {/* Trader cards */}
        <motion.section className="section" style={{ paddingTop: '0.5rem', paddingBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', maxWidth: '900px', margin: '0 auto' }}>
            {traders.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <Loader2 size={32} className="spin" style={{ marginBottom: '12px', opacity: 0.5 }} />
                <div>Loading providers...</div>
              </div>
            )}
            {traders.map((trader, idx) => {
              const followInfo = userFollows[trader.address.toLowerCase()];
              const isFollowing = followInfo?.enabled;
              return (
                <motion.div
                  key={trader.address}
                  variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={idx}
                  onClick={() => setSelectedProvider(trader)}
                  style={{
                    background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
                    border: `1px solid ${isFollowing ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    position: 'relative', overflow: 'hidden', cursor: 'pointer',
                  }}
                >
                  {/* Header: avatar + name + badges */}
                  {(() => {
                    const profile = providerProfiles[trader.address.toLowerCase()];
                    const level = getProviderLevel(trader.totalTrades, trader.winRate);
                    return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '12px', objectFit: 'cover', border: '1px solid rgba(212,168,67,0.2)' }} />
                      ) : (
                        <div style={{
                          width: 40, height: 40, borderRadius: '12px',
                          background: level ? `linear-gradient(135deg, ${level.bg}, rgba(255,255,255,0.02))` : 'linear-gradient(135deg, rgba(212,168,67,0.15), rgba(212,168,67,0.03))',
                          border: `1px solid ${level ? level.border : 'rgba(212,168,67,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '0.8rem',
                          color: level ? level.color : 'var(--accent)',
                        }}>
                          {(profile?.display_name || trader.shortAddr).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{profile?.display_name || trader.shortAddr}</span>
                          {level && (
                            <span style={{
                              fontSize: '0.5rem', fontWeight: 700, padding: '1px 6px', borderRadius: '20px',
                              background: level.bg, color: level.color, border: `1px solid ${level.border}`,
                              letterSpacing: '0.03em',
                            }}>
                              {level.label}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          {profile?.display_name && <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{trader.shortAddr}</span>}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: 700, color: '#8B5CF6' }}>
                            <Users size={10} /> {trader.followers}
                          </span>
                          {isFollowing && (
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', background: 'rgba(52,211,153,0.12)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.25)' }}>
                              FOLLOWING
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 800,
                        color: trader.totalPnlPct >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {trader.totalPnlPct >= 0 ? '+' : ''}{trader.totalPnlPct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>TOTAL PNL</div>
                    </div>
                  </div>
                    );
                  })()}

                  {/* Key stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                    {[
                      { label: 'WIN RATE', value: `${trader.winRate}%`, color: trader.winRate >= 70 ? 'var(--success)' : trader.winRate >= 50 ? 'var(--accent)' : 'var(--danger)' },
                      { label: 'TRADES', value: trader.totalTrades, color: 'var(--text-primary)' },
                      { label: 'FOLLOWERS', value: trader.followers, color: '#8B5CF6' },
                      { label: 'VOLUME', value: `$${trader.totalVolume >= 1000 ? `${(trader.totalVolume / 1000).toFixed(1)}k` : Math.round(trader.totalVolume)}`, color: 'var(--accent)' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '7px 4px', textAlign: 'center' }}>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.85rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.45rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Active trade with live PnL */}
                  {trader.activeSignal && (
                    <div style={{
                      borderRadius: '10px', padding: '10px', marginBottom: '12px',
                      background: 'rgba(212,168,67,0.04)', border: '1px solid rgba(212,168,67,0.12)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="pulse-dot" style={{ width: 6, height: 6 }} />
                          <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>Active Trade</span>
                          <span style={{
                            padding: '2px 6px', borderRadius: '10px', fontSize: '0.55rem', fontWeight: 700,
                            background: trader.activeSignal.long ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                            color: trader.activeSignal.long ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {trader.activeSignal.long ? 'LONG' : 'SHORT'} {Number(trader.activeSignal.leverage) / 1000}x
                          </span>
                        </div>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                          {trader.activeSignal.copiers} copier{trader.activeSignal.copiers !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {livePrice && (() => {
                        const entry = Number(trader.activeSignal.entryPrice) / 1e10;
                        const pctMove = ((livePrice - entry) / entry) * 100 * (trader.activeSignal.long ? 1 : -1);
                        const pnl = pctMove * (Number(trader.activeSignal.leverage) / 1000);
                        const isProfit = pnl >= 0;
                        const tp = Number(trader.activeSignal.tp) / 1e10;
                        const sl = Number(trader.activeSignal.sl) / 1e10;
                        const range = Math.abs(tp - sl);
                        const progress = trader.activeSignal.long
                          ? Math.max(0, Math.min(100, ((livePrice - sl) / range) * 100))
                          : Math.max(0, Math.min(100, ((sl - livePrice) / range) * 100));
                        return (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.9rem' }}>
                                ${livePrice.toFixed(2)}
                              </span>
                              <span style={{
                                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '0.9rem',
                                color: isProfit ? 'var(--success)' : 'var(--danger)',
                              }}>
                                {isProfit ? '+' : ''}{pnl.toFixed(2)}%
                              </span>
                            </div>
                            <div style={{ position: 'relative', height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)' }}>
                              <div style={{
                                position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: '2px 0 0 2px',
                                width: '50%', background: 'rgba(248,113,113,0.15)',
                              }} />
                              <div style={{
                                position: 'absolute', right: 0, top: 0, height: '100%', borderRadius: '0 2px 2px 0',
                                width: '50%', background: 'rgba(52,211,153,0.15)',
                              }} />
                              <div style={{
                                position: 'absolute', top: '-3px', left: `${progress}%`, transform: 'translateX(-50%)',
                                width: '9px', height: '9px', borderRadius: '50%',
                                background: isProfit ? 'var(--success)' : 'var(--danger)',
                                boxShadow: `0 0 6px ${isProfit ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)'}`,
                                transition: 'left 0.5s ease',
                              }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.5rem', fontFamily: "'Space Grotesk', sans-serif" }}>
                              <span style={{ color: 'var(--danger)' }}>SL</span>
                              <span style={{ color: 'var(--text-secondary)' }}>Entry ${entry.toFixed(0)}</span>
                              <span style={{ color: 'var(--success)' }}>TP</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Recent performance bars */}
                  {trader.recent.length > 0 && trader.recent.some(r => r !== 0) && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.05em' }}>RECENT TRADES</div>
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '28px', marginBottom: '4px' }}>
                        {trader.recent.map((r, i) => (
                          <div key={i} style={{
                            flex: 1, borderRadius: '3px 3px 0 0',
                            height: `${Math.min(100, Math.abs(r) * 2.5 + 15)}%`,
                            background: r >= 0
                              ? 'linear-gradient(to top, rgba(52,211,153,0.25), rgba(52,211,153,0.7))'
                              : 'linear-gradient(to top, rgba(248,113,113,0.2), rgba(248,113,113,0.5))',
                          }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {trader.recent.map((r, i) => (
                          <span key={i} style={{
                            flex: 1, textAlign: 'center', padding: '2px 0', borderRadius: '4px', fontSize: '0.55rem',
                            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                            background: r >= 0 ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
                            color: r >= 0 ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {r >= 0 ? '+' : ''}{r.toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {isFollowing ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{
                        flex: 1, padding: '8px', fontSize: '0.7rem', textAlign: 'center',
                        background: 'rgba(52,211,153,0.06)', borderRadius: '10px', color: 'var(--success)',
                        fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600,
                      }}>
                        ${followInfo.amount}/trade
                      </div>
                      <button
                        className="btn btn-glass"
                        style={{ padding: '8px 14px', fontSize: '0.7rem', fontWeight: 600 }}
                        onClick={(e) => { e.stopPropagation(); handleUnfollow(trader.address); }}
                        disabled={followLoading}
                      >
                        Unfollow
                      </button>
                    </div>
                  ) : account && account.toLowerCase() === trader.address.toLowerCase() ? (
                    <div style={{
                      width: '100%', padding: '10px', fontSize: '0.75rem', textAlign: 'center',
                      background: 'rgba(212,168,67,0.06)', borderRadius: '10px', color: 'var(--accent)',
                      fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}>
                      <Crown size={14} /> Your Strategy
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '10px', fontSize: '0.75rem', fontWeight: 700 }}
                      onClick={(e) => { e.stopPropagation(); setFollowTarget(trader.address); setFollowAmount("10"); }}
                      disabled={!account || followLoading}
                    >
                      <BrainCircuit size={14} /> {account ? 'Follow & Auto-Copy' : 'Connect Wallet to Follow'}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* Follow modal */}
        <AnimatePresence>
          {followTarget && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
              onClick={() => setFollowTarget(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '28px', maxWidth: '380px', width: '100%', border: '1px solid var(--border)' }}
              >
                <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Follow Provider</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                  Set your USDC amount per trade. When this provider posts a signal, your trade will be copied automatically.
                </p>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Amount per trade (USDC)</div>
                <input
                  type="number"
                  value={followAmount}
                  onChange={e => setFollowAmount(e.target.value)}
                  min="5"
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px', fontSize: '1rem',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                    outline: 'none', marginBottom: '6px', boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Minimum $5 USDC. Your USDC stays in your wallet until a signal is posted.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-glass"
                    style={{ flex: 1, padding: '10px', fontSize: '0.8rem' }}
                    onClick={() => setFollowTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-glow"
                    style={{ flex: 1, padding: '10px', fontSize: '0.8rem', fontWeight: 700 }}
                    onClick={async () => {
                      await handleFollow(followTarget, parseFloat(followAmount) || 10);
                      setFollowTarget(null);
                    }}
                    disabled={followLoading || parseFloat(followAmount) < 5}
                  >
                    {followLoading ? <Loader2 size={16} className="spin" /> : <><BrainCircuit size={14} /> Follow</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Provider detail modal */}
        <AnimatePresence>
          {selectedProvider && (() => {
            const t = selectedProvider;
            const followInfo = userFollows[t.address.toLowerCase()];
            const isFollowing = followInfo?.enabled;
            const isOwn = account && account.toLowerCase() === t.address.toLowerCase();

            // Build equity curve from trade history
            const equityCurve = [0];
            const sortedHistory = [...(t.tradeHistory || [])].sort((a, b) => a.closedAt - b.closedAt);
            sortedHistory.forEach(trade => {
              equityCurve.push(equityCurve[equityCurve.length - 1] + trade.pnl);
            });

            // SVG chart dimensions
            const chartW = 500, chartH = 140, chartPad = 20;
            const maxVal = Math.max(...equityCurve.map(Math.abs), 1);
            const points = equityCurve.map((v, i) => {
              const x = chartPad + (i / Math.max(equityCurve.length - 1, 1)) * (chartW - chartPad * 2);
              const y = chartH / 2 - (v / maxVal) * (chartH / 2 - chartPad);
              return `${x},${y}`;
            }).join(' ');
            const lastPnl = equityCurve[equityCurve.length - 1];
            const lineColor = lastPnl >= 0 ? '#34D399' : '#F87171';
            const fillPoints = `${chartPad},${chartH / 2} ${points} ${chartW - chartPad},${chartH / 2}`;

            return (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}
                onClick={() => setSelectedProvider(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                  onClick={e => e.stopPropagation()}
                  style={{ background: 'var(--bg-card)', borderRadius: '20px', maxWidth: '560px', width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
                >
                  {/* Modal header */}
                  {(() => {
                    const mProfile = providerProfiles[t.address.toLowerCase()];
                    const mLevel = getProviderLevel(t.totalTrades, t.winRate);
                    return (
                  <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {mProfile?.avatar_url ? (
                        <img src={mProfile.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: '14px', objectFit: 'cover', border: '1px solid rgba(212,168,67,0.25)' }} />
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: '14px',
                          background: mLevel ? `linear-gradient(135deg, ${mLevel.bg}, rgba(255,255,255,0.02))` : 'linear-gradient(135deg, rgba(212,168,67,0.2), rgba(212,168,67,0.05))',
                          border: `1px solid ${mLevel ? mLevel.border : 'rgba(212,168,67,0.25)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '1rem', color: mLevel ? mLevel.color : 'var(--accent)',
                        }}>
                          {(mProfile?.display_name || t.shortAddr).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700 }}>{mProfile?.display_name || t.shortAddr}</span>
                          {mLevel && (
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: mLevel.bg, color: mLevel.color, border: `1px solid ${mLevel.border}` }}>
                              {mLevel.label}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          {mProfile?.display_name && <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{t.shortAddr}</span>}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', fontWeight: 700, color: '#8B5CF6' }}>
                            <Users size={12} /> {t.followers} followers
                          </span>
                          {isFollowing && (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: 'rgba(52,211,153,0.12)', color: 'var(--success)', border: '1px solid rgba(52,211,153,0.2)' }}>
                              FOLLOWING
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedProvider(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                      <X size={20} />
                    </button>
                  </div>
                    );
                  })()}

                  {/* Stats grid */}
                  {(() => {
                    const wins = sortedHistory.filter(x => x.pnl >= 0);
                    const losses = sortedHistory.filter(x => x.pnl < 0);
                    const avgWin = wins.length > 0 ? wins.reduce((s, x) => s + x.pnl, 0) / wins.length : 0;
                    const avgLoss = losses.length > 0 ? losses.reduce((s, x) => s + x.pnl, 0) / losses.length : 0;
                    const best = sortedHistory.length > 0 ? Math.max(...sortedHistory.map(x => x.pnl)) : 0;
                    const worst = sortedHistory.length > 0 ? Math.min(...sortedHistory.map(x => x.pnl)) : 0;
                    const totalWin = wins.reduce((s, x) => s + x.pnl, 0);
                    const totalLoss = Math.abs(losses.reduce((s, x) => s + x.pnl, 0));
                    const profitFactor = totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : totalWin > 0 ? '∞' : '—';
                    const avgLev = sortedHistory.length > 0 ? sortedHistory.reduce((s, x) => s + x.leverage, 0) / sortedHistory.length : 0;
                    const longs = sortedHistory.filter(x => x.long).length;
                    const shorts = sortedHistory.length - longs;

                    // Current streak
                    let streak = 0, streakType = '';
                    for (let i = sortedHistory.length - 1; i >= 0; i--) {
                      const isWin = sortedHistory[i].pnl >= 0;
                      if (i === sortedHistory.length - 1) { streakType = isWin ? 'W' : 'L'; streak = 1; }
                      else if ((isWin && streakType === 'W') || (!isWin && streakType === 'L')) streak++;
                      else break;
                    }

                    // Max drawdown
                    let peak = 0, maxDD = 0, cumPnl = 0;
                    for (const trade of sortedHistory) {
                      cumPnl += trade.pnl;
                      if (cumPnl > peak) peak = cumPnl;
                      const dd = peak - cumPnl;
                      if (dd > maxDD) maxDD = dd;
                    }

                    const statStyle = { background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px 6px', textAlign: 'center' };
                    const valStyle = { fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.95rem', fontWeight: 800 };
                    const lblStyle = { fontSize: '0.5rem', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginTop: '2px' };

                    return (
                      <div style={{ padding: '16px 24px 8px' }}>
                        {/* Primary stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: t.totalPnlPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>{t.totalPnlPct >= 0 ? '+' : ''}{t.totalPnlPct.toFixed(1)}%</div>
                            <div style={lblStyle}>TOTAL PNL</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: t.winRate >= 70 ? 'var(--success)' : t.winRate >= 50 ? 'var(--accent)' : 'var(--danger)' }}>{t.winRate}%</div>
                            <div style={lblStyle}>WIN RATE</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--text-primary)' }}>{t.totalTrades}</div>
                            <div style={lblStyle}>TRADES</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--accent)' }}>${t.totalVolume >= 1000 ? `${(t.totalVolume / 1000).toFixed(1)}k` : Math.round(t.totalVolume)}</div>
                            <div style={lblStyle}>VOLUME</div>
                          </div>
                        </div>
                        {/* Secondary stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--success)' }}>+{avgWin.toFixed(1)}%</div>
                            <div style={lblStyle}>AVG WIN</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--danger)' }}>{avgLoss.toFixed(1)}%</div>
                            <div style={lblStyle}>AVG LOSS</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: best >= 0 ? 'var(--success)' : 'var(--danger)' }}>+{best.toFixed(1)}%</div>
                            <div style={lblStyle}>BEST</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--danger)' }}>{worst.toFixed(1)}%</div>
                            <div style={lblStyle}>WORST</div>
                          </div>
                        </div>
                        {/* Tertiary stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: parseFloat(profitFactor) >= 2 ? 'var(--success)' : parseFloat(profitFactor) >= 1 ? 'var(--accent)' : 'var(--danger)' }}>{profitFactor}</div>
                            <div style={lblStyle}>PROFIT FACTOR</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--danger)' }}>-{maxDD.toFixed(1)}%</div>
                            <div style={lblStyle}>MAX DRAWDOWN</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: streakType === 'W' ? 'var(--success)' : 'var(--danger)' }}>{streak}{streakType}</div>
                            <div style={lblStyle}>STREAK</div>
                          </div>
                          <div style={statStyle}>
                            <div style={{ ...valStyle, color: 'var(--text-primary)' }}>{longs}L/{shorts}S</div>
                            <div style={lblStyle}>LONG/SHORT</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Trade results bar chart */}
                  {sortedHistory.length > 0 && (() => {
                    const maxPnl = Math.max(...sortedHistory.map(x => Math.abs(x.pnl)), 0.1);
                    return (
                      <div style={{ padding: '0 24px 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>TRADE RESULTS</span>
                          <span style={{ fontSize: '0.8rem', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, color: lineColor }}>
                            {lastPnl >= 0 ? '+' : ''}{lastPnl.toFixed(1)}% total
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '120px' }}>
                          {sortedHistory.map((trade, i) => {
                            const isWin = trade.pnl >= 0;
                            const height = Math.max((Math.abs(trade.pnl) / maxPnl) * 100, 4);
                            return (
                              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'center', gap: '0' }}>
                                {/* PnL label */}
                                <div style={{
                                  fontSize: '0.55rem', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                                  color: isWin ? 'var(--success)' : 'var(--danger)',
                                  marginBottom: isWin ? 'auto' : '2px', marginTop: isWin ? '2px' : 'auto',
                                  order: isWin ? -1 : 1,
                                }}>
                                  {isWin ? '+' : ''}{trade.pnl.toFixed(0)}%
                                </div>
                                {/* Bar */}
                                <div style={{
                                  width: '100%', maxWidth: '32px',
                                  height: `${height}%`,
                                  borderRadius: isWin ? '4px 4px 1px 1px' : '1px 1px 4px 4px',
                                  background: isWin
                                    ? 'linear-gradient(to top, rgba(52,211,153,0.3), rgba(52,211,153,0.8))'
                                    : 'linear-gradient(to bottom, rgba(248,113,113,0.3), rgba(248,113,113,0.7))',
                                  boxShadow: isWin
                                    ? '0 -2px 8px rgba(52,211,153,0.15)'
                                    : '0 2px 8px rgba(248,113,113,0.15)',
                                  transition: 'height 0.5s ease',
                                }} />
                                {/* Trade number */}
                                <div style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', marginTop: '4px', order: 2 }}>
                                  #{trade.id}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Active trade */}
                  {t.activeSignal && (
                    <div style={{ padding: '8px 24px 8px' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>ACTIVE TRADE</div>
                      <div style={{
                        borderRadius: '12px', padding: '14px',
                        background: 'rgba(212,168,67,0.04)', border: '1px solid rgba(212,168,67,0.12)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="pulse-dot" style={{ width: 7, height: 7 }} />
                            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.95rem' }}>XAU/USD</span>
                            <span style={{
                              padding: '3px 8px', borderRadius: '12px', fontSize: '0.6rem', fontWeight: 700,
                              background: t.activeSignal.long ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                              color: t.activeSignal.long ? 'var(--success)' : 'var(--danger)',
                            }}>
                              {t.activeSignal.long ? 'LONG' : 'SHORT'} {Number(t.activeSignal.leverage) / 1000}x
                            </span>
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            {t.activeSignal.copiers} copier{t.activeSignal.copiers !== 1 ? 's' : ''} &middot; ${t.activeSignal.volume.toFixed(0)}
                          </span>
                        </div>
                        {livePrice && (() => {
                          const entry = Number(t.activeSignal.entryPrice) / 1e10;
                          const tp = Number(t.activeSignal.tp) / 1e10;
                          const sl = Number(t.activeSignal.sl) / 1e10;
                          const pctMove = ((livePrice - entry) / entry) * 100 * (t.activeSignal.long ? 1 : -1);
                          const pnl = pctMove * (Number(t.activeSignal.leverage) / 1000);
                          const isProfit = pnl >= 0;
                          const range = Math.abs(tp - sl);
                          const progress = t.activeSignal.long
                            ? Math.max(0, Math.min(100, ((livePrice - sl) / range) * 100))
                            : Math.max(0, Math.min(100, ((sl - livePrice) / range) * 100));
                          return (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                                <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>LIVE PRICE</div>
                                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.2rem' }}>${livePrice.toFixed(2)}</div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>PNL</div>
                                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '1.2rem', color: isProfit ? 'var(--success)' : 'var(--danger)' }}>
                                    {isProfit ? '+' : ''}{pnl.toFixed(2)}%
                                  </div>
                                </div>
                              </div>
                              <TradeProgressBar entry={entry} tp={tp} sl={sl} currentPrice={livePrice} isLong={t.activeSignal.long} />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Trade history */}
                  {sortedHistory.length > 0 && (
                    <div style={{ padding: '8px 24px 8px' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>TRADE HISTORY</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {sortedHistory.slice().reverse().map(trade => (
                          <div key={trade.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>#{trade.id}</span>
                              <span style={{
                                padding: '2px 6px', borderRadius: '8px', fontSize: '0.55rem', fontWeight: 700,
                                background: trade.long ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                                color: trade.long ? 'var(--success)' : 'var(--danger)',
                              }}>
                                {trade.long ? 'LONG' : 'SHORT'} {trade.leverage}x
                              </span>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                                {trade.copiers} copier{trade.copiers !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <span style={{
                              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.8rem',
                              color: trade.pnl >= 0 ? 'var(--success)' : 'var(--danger)',
                            }}>
                              {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action footer */}
                  <div style={{ padding: '16px 24px 24px' }}>
                    {isOwn ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{
                          width: '100%', padding: '12px', fontSize: '0.8rem', textAlign: 'center',
                          background: 'rgba(212,168,67,0.06)', borderRadius: '12px', color: 'var(--accent)',
                          fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}>
                          <Crown size={16} /> This is your strategy
                        </div>
                        <button
                          className="btn btn-glass"
                          style={{ width: '100%', padding: '10px', fontSize: '0.75rem' }}
                          onClick={() => {
                            const p = providerProfiles[account.toLowerCase()];
                            setEditProfileName(p?.display_name || '');
                            setEditProfileAvatar(p?.avatar_url || '');
                            setEditProfileOpen(true);
                            setSelectedProvider(null);
                          }}
                        >
                          <Settings size={14} /> Edit Profile
                        </button>
                      </div>
                    ) : isFollowing ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{
                          flex: 1, padding: '12px', fontSize: '0.8rem', textAlign: 'center',
                          background: 'rgba(52,211,153,0.06)', borderRadius: '12px', color: 'var(--success)',
                          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                        }}>
                          Following — ${followInfo.amount}/trade
                        </div>
                        <button
                          className="btn btn-glass"
                          style={{ padding: '12px 20px', fontSize: '0.8rem', fontWeight: 600 }}
                          onClick={() => { handleUnfollow(t.address); setSelectedProvider(null); }}
                          disabled={followLoading}
                        >
                          Unfollow
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary btn-glow"
                        style={{ width: '100%', padding: '14px', fontSize: '0.9rem', fontWeight: 700 }}
                        onClick={() => { setSelectedProvider(null); setFollowTarget(t.address); setFollowAmount("10"); }}
                        disabled={!account || followLoading}
                      >
                        <BrainCircuit size={16} /> {account ? 'Follow & Auto-Copy' : 'Connect Wallet to Follow'}
                      </button>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* How it works */}
        <motion.section className="section" style={{ paddingTop: '1rem', paddingBottom: '2rem' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.1em', textAlign: 'center', marginBottom: '20px', textTransform: 'uppercase' }}>
              How It Works
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[
                { num: '1', icon: <Wallet size={22} />, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.2)', title: 'Connect Wallet', desc: 'Connect your Arbitrum wallet to browse the strategy marketplace.' },
                { num: '2', icon: <UserPlus size={22} />, color: 'var(--accent)', bg: 'rgba(212,168,67,0.12)', border: 'rgba(212,168,67,0.2)', title: 'Follow a Trader', desc: 'Analyze track records and set your copy amount per trade.' },
                { num: '3', icon: <Coins size={22} />, color: 'var(--success)', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.2)', title: 'Earn Automatically', desc: 'Trades are copied automatically on-chain. Claim profits anytime.' },
              ].map(step => (
                <motion.div key={step.num} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px 20px', border: `1px solid ${step.border}`, textAlign: 'center', position: 'relative' }}
                >
                  <div style={{
                    position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                    width: 24, height: 24, borderRadius: '50%', background: step.bg, border: `1px solid ${step.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '0.7rem', color: step.color,
                  }}>{step.num}</div>
                  <div style={{ width: 44, height: 44, borderRadius: '12px', margin: '8px auto 12px', background: step.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: step.color }}>{step.icon}</span>
                  </div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '6px' }}>{step.title}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Edit Profile Modal */}
        <AnimatePresence>
          {editProfileOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
              onClick={() => setEditProfileOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '28px', maxWidth: '380px', width: '100%', border: '1px solid var(--border)' }}
              >
                <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Edit Profile</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                  Set your display name and avatar for your provider card.
                </p>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Display Name</div>
                <input
                  type="text" value={editProfileName} onChange={e => setEditProfileName(e.target.value)}
                  placeholder="e.g. GoldMaster" maxLength={20}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px', fontSize: '0.9rem',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', outline: 'none', marginBottom: '14px', boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Avatar URL</div>
                <input
                  type="url" value={editProfileAvatar} onChange={e => setEditProfileAvatar(e.target.value)}
                  placeholder="https://..."
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px', fontSize: '0.9rem',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', outline: 'none', marginBottom: '6px', boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Paste a direct image URL (e.g. from imgur, Twitter, etc.)
                </div>
                {editProfileAvatar && (
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <img src={editProfileAvatar} alt="Preview" style={{ width: 60, height: 60, borderRadius: '14px', objectFit: 'cover', border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-glass" style={{ flex: 1, padding: '10px', fontSize: '0.8rem' }} onClick={() => setEditProfileOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary btn-glow" style={{ flex: 1, padding: '10px', fontSize: '0.8rem', fontWeight: 700 }} onClick={saveProfile}>
                    Save Profile
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom info */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '3rem' }}>
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {[
                { icon: <Shield size={20} />, color: 'var(--success)', bg: 'rgba(52,211,153,0.1)', title: 'Fully Transparent', desc: 'All trades are on-chain. Verify every result on Arbiscan.' },
                { icon: <Zap size={20} />, color: 'var(--accent)', bg: 'rgba(212,168,67,0.1)', title: 'Instant Copy', desc: 'Auto-copy or choose per signal. Your funds, your control.' },
                { icon: <Users size={20} />, color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)', title: 'Open to Everyone', desc: 'Anyone can become a strategy provider. Just connect and trade.' },
              ].map(item => (
                <motion.div
                  key={item.title}
                  variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  style={{
                    background: 'var(--bg-card)', borderRadius: '16px', padding: '24px 20px',
                    border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: '12px', margin: '0 auto 12px',
                    background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: item.color }}>{item.icon}</span>
                  </div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '6px' }}>{item.title}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </motion.div>
    );
  };

  // ===== REFERRAL PAGE =====
  const renderReferral = () => {
    const rewardsEarned = referralStats.referrals.reduce((sum, r) => sum + (r.reward_paid ? Number(r.reward_amount || 0) : 0), 0);

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>

        {/* Hero */}
        <motion.section className="section" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
          <motion.div className="section-header" variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div className="section-badge" variants={fadeUp} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <Share2 size={14} style={{ color: '#8B5CF6' }} />
              <span style={{ color: '#8B5CF6' }}>Referral Program</span>
            </motion.div>
            <motion.h2 className="section-title" variants={fadeUp}>
              Invite Friends,{' '}
              <span className="text-gold-gradient">Earn USDC.</span>
            </motion.h2>
            <motion.p className="section-subtitle" variants={fadeUp}>
              Share your unique link. When your friends copy trades and profit, you automatically earn 50% of the platform fee — paid in USDC directly to your wallet.
            </motion.p>
          </motion.div>
        </motion.section>

        {/* How it works — 3 steps */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '2rem' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
            maxWidth: '900px', margin: '0 auto',
          }}>
            {[
              { num: '1', icon: <Share2 size={22} />, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.2)', title: 'Share Your Link', desc: 'Connect your wallet and copy your unique referral link. Share it with friends, on social media, or in communities.' },
              { num: '2', icon: <Copy size={22} />, color: 'var(--accent)', bg: 'rgba(212,168,67,0.12)', border: 'rgba(212,168,67,0.2)', title: 'Friend Copies a Trade', desc: 'When someone opens your link and copies a trade, the referral is permanently saved on-chain.' },
              { num: '3', icon: <Coins size={22} />, color: 'var(--success)', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.2)', title: 'Earn 50% of Fees', desc: 'When their trade closes profitably, you automatically receive 50% of the platform fee as USDC.' },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden' }}
              >
                <div style={{
                  position: 'absolute', inset: '-1px', borderRadius: '20px',
                  background: `conic-gradient(from ${120 * i}deg, transparent, ${step.border}, transparent)`,
                  animation: 'spin 10s linear infinite', filter: 'blur(2px)', opacity: 0.5,
                }} />
                <div style={{
                  position: 'relative', zIndex: 1, background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
                  borderRadius: '20px', padding: '28px 24px', textAlign: 'center', height: '100%',
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '16px', margin: '0 auto 16px',
                    background: step.bg, border: `1px solid ${step.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: step.color }}>{step.icon}</span>
                  </div>
                  <div style={{
                    position: 'absolute', top: '12px', left: '16px',
                    fontSize: '0.6rem', fontWeight: 700, color: step.color, opacity: 0.5,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}>STEP {step.num}</div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>{step.title}</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Reward breakdown */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '2rem' }}>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', maxWidth: '700px', margin: '0 auto' }}
          >
            <div style={{
              position: 'absolute', inset: '-1px', borderRadius: '20px',
              background: 'conic-gradient(from 200deg, transparent, rgba(139,92,246,0.25), transparent, rgba(212,168,67,0.2), transparent)',
              animation: 'spin 10s linear infinite', filter: 'blur(2px)', opacity: 0.6,
            }} />
            <div style={{
              position: 'relative', zIndex: 1, background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
              borderRadius: '20px', padding: '32px',
            }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '0.65rem', color: '#8B5CF6', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Reward Example
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>How Your Rewards Are Calculated</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Friend profits', value: '$100', sub: 'on a trade', color: 'var(--text-primary)' },
                  { label: 'Platform fee', value: `${(feePercent / 100).toFixed(0)}%`, sub: `= $${(100 * feePercent / 10000).toFixed(0)}`, color: 'var(--accent)' },
                  { label: 'Your reward', value: '50%', sub: `= $${(100 * feePercent / 10000 * 0.5).toFixed(0)} USDC`, color: '#8B5CF6' },
                ].map((item, i) => (
                  <React.Fragment key={item.label}>
                    {i > 0 && <ArrowRight size={18} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />}
                    <div style={{
                      background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px 24px',
                      border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', minWidth: '130px',
                    }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '6px', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{item.sub}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* Your referral link + stats */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '2rem' }}>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', maxWidth: '700px', margin: '0 auto' }}
          >
            <div style={{
              position: 'absolute', inset: '-1px', borderRadius: '20px',
              background: 'conic-gradient(from 100deg, transparent, rgba(52,211,153,0.2), transparent, rgba(139,92,246,0.2), transparent)',
              animation: 'spin 10s linear infinite', filter: 'blur(2px)', opacity: 0.5,
            }} />
            <div style={{
              position: 'relative', zIndex: 1, background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
              borderRadius: '20px', padding: '32px',
            }}>
              {account ? (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Your Referral Dashboard
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    {[
                      { label: 'Referrals', value: referralStats.count, color: '#8B5CF6', prefix: '' },
                      { label: 'Volume', value: referralStats.volume, color: 'var(--accent)', prefix: '$' },
                      { label: 'Rewards Earned', value: rewardsEarned, color: 'var(--success)', prefix: '$' },
                    ].map(stat => (
                      <div key={stat.label} style={{
                        background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px',
                        border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center',
                      }}>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.4rem', fontWeight: 700, color: stat.color }}>
                          {stat.prefix}<CountUp end={stat.value} duration={1.5} decimals={stat.prefix === '$' ? 2 : 0} separator="," />
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginTop: '4px', textTransform: 'uppercase' }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Referral link */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 16px', borderRadius: '14px',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{
                      fontSize: '0.7rem', color: 'var(--text-secondary)',
                      fontFamily: "'Space Grotesk', sans-serif",
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: '10px',
                    }}>
                      {referralLink}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '10px 20px', fontSize: '0.8rem', fontWeight: 700, width: '100%' }}
                      onClick={() => {
                        navigator.clipboard.writeText(referralLink);
                        setReferralCopied(true);
                        setTimeout(() => setReferralCopied(false), 2000);
                      }}
                    >
                      {referralCopied ? <><CheckCircle2 size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '16px', margin: '0 auto 16px',
                    background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Wallet size={24} style={{ color: '#8B5CF6' }} />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>Connect Wallet to Start</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    Connect your wallet to get your unique referral link and start earning.
                  </p>
                  <button className="btn btn-primary btn-glow" onClick={connectWallet} style={{ padding: '12px 32px', fontSize: '0.9rem' }}>
                    <Wallet size={16} /> Connect Wallet
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.section>

        {/* Rewards History */}
        {account && referralStats.referrals.length > 0 && (
          <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '1.5rem' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
              <div style={{
                background: 'var(--bg-card)', borderRadius: '16px', padding: '20px 24px',
                border: '1px solid var(--border)',
              }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} style={{ color: '#8B5CF6' }} />
                  Your Referrals
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {referralStats.referrals.map((r, i) => {
                    // No estimate - only show actual paid rewards
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                            {r.referred?.slice(0, 6)}...{r.referred?.slice(-4)}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            ${Number(r.amount || 0).toFixed(0)} per trade
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {r.reward_paid ? (
                            <div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)', fontFamily: "'Space Grotesk', sans-serif" }}>
                                +${Number(r.reward_amount || 0).toFixed(2)}
                              </div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--success)' }}>Paid</div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--accent)' }}>Active</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{
                  marginTop: '14px', padding: '10px 14px', borderRadius: '10px',
                  background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '0.75rem', color: '#8B5CF6', fontWeight: 600 }}>Total Rewards</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#8B5CF6', fontFamily: "'Space Grotesk', sans-serif" }}>
                    ${referralStats.referrals.reduce((sum, r) => sum + (r.reward_paid ? Number(r.reward_amount || 0) : 0), 0).toFixed(2)} earned
                  </span>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* FAQ */}
        <motion.section className="section" style={{ paddingTop: 0, paddingBottom: '3rem' }}>
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Frequently Asked Questions</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { q: 'Who can participate?', a: 'Anyone with a Web3 wallet. Connect your wallet, grab your link, and start sharing.' },
                { q: 'How are rewards calculated?', a: `You earn 50% of the platform fee (${(feePercent / 100).toFixed(0)}%) on every profitable trade your referrals make. If they don't profit, there's no fee and no reward.` },
                { q: 'When do I receive my rewards?', a: 'Rewards are sent automatically in USDC to your wallet the moment your referral claims their profit. No action needed from you.' },
                { q: 'Is there a limit?', a: 'No limits. You can refer unlimited friends and earn on every profitable trade they make.' },
                { q: 'Can I track my referrals?', a: 'Yes. Connect your wallet and check this page to see your total referrals, volume, and rewards earned.' },
              ].map((faq, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i}
                  style={{
                    background: 'var(--bg-card)', borderRadius: '14px', padding: '18px 22px',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '6px' }}>{faq.q}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{faq.a}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </motion.div>
    );
  };

  const renderDashboard = () => (
    <motion.div
      className="dash-v2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* ===== BSC BANNER ===== */}
      {isOnBSC && account && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'linear-gradient(135deg, rgba(243, 186, 47, 0.12), rgba(212, 168, 67, 0.08))',
            border: '1px solid rgba(243, 186, 47, 0.3)',
            borderRadius: '14px',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={18} style={{ color: '#F3BA2F' }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F3BA2F' }}>You're on BNB Chain</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Bridge your USDT/USDC to Arbitrum to start copy trading
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              onClick={() => setShowBridgeModal(true)}
            >
              <ArrowLeftRight size={14} /> Bridge Now
            </button>
            <button
              className="btn btn-glass"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              onClick={switchToArbitrum}
            >
              Switch to Arbitrum
            </button>
          </div>
        </motion.div>
      )}

      {/* ===== LIVE SIGNAL STATUS BANNER ===== */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', marginBottom: '16px' }}
      >
        {/* Animated glow border */}
        <div style={{
          position: 'absolute', inset: '-1px', borderRadius: '20px',
          background: activeSignal
            ? `conic-gradient(from 200deg, transparent, ${activeSignal.long ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)'}, transparent, rgba(212,168,67,0.2), transparent)`
            : 'conic-gradient(from 200deg, transparent, rgba(255,255,255,0.08), transparent, rgba(212,168,67,0.1), transparent)',
          animation: 'spin 10s linear infinite', filter: 'blur(2px)', opacity: 0.6,
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
          borderRadius: '20px', padding: '24px 28px',
        }}>
          {activeSignal ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '14px',
                  background: `linear-gradient(135deg, ${activeSignal.long ? 'rgba(52,211,153,0.2), rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.2), rgba(248,113,113,0.05)'})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: `1px solid ${activeSignal.long ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
                }}>
                  {activeSignal.long ? <TrendingUp size={22} style={{ color: 'var(--success)' }} /> : <ArrowDownRight size={22} style={{ color: 'var(--danger)' }} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                      Signal #{Number(activeSignal.id)} is LIVE
                    </span>
                    <span className="pulse-dot" style={{ width: 8, height: 8, background: activeSignal.long ? 'var(--success)' : 'var(--danger)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700,
                      background: activeSignal.long ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                      color: activeSignal.long ? 'var(--success)' : 'var(--danger)',
                    }}>{activeSignal.long ? 'LONG' : 'SHORT'}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>
                      XAU/USD &middot; {formatLeverage(activeSignal.leverage)}x{(isAdmin || (activeSignal && userPositions[Number(activeSignal.id)])) ? ` · Entry $${formatGTradePrice(activeSignal.entryPrice)}` : ''}
                    </span>
                  </div>
                </div>
              </div>
              {!userPositions[Number(activeSignal.id)] ? (
                <button
                  className="btn btn-primary btn-glow"
                  style={{ padding: '12px 28px', fontSize: '0.95rem', fontWeight: 700 }}
                  onClick={() => setShowCopyModal(true)}
                  disabled={!account || isLoading}
                >
                  <Zap size={16} /> Copy Now
                </button>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 16px', borderRadius: '12px',
                  background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.15)',
                }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent)' }}>
                    Copied — {parseFloat(ethers.formatUnits(userPositions[Number(activeSignal.id)].deposit, USDC_DECIMALS)).toFixed(2)} USDC
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Clock size={22} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '4px' }}>
                    Waiting for Signal
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      No active trade right now
                    </span>
                    <span style={{
                      width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
                    }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Alerts via Telegram
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  padding: '8px 14px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <Eye size={13} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Monitoring 24/5</span>
                </div>
                <a
                  href="https://t.me/SmartTradingClubDapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-glass"
                  style={{ padding: '10px 20px', fontSize: '0.82rem', textDecoration: 'none', fontWeight: 600 }}
                >
                  <ExternalLink size={13} />
                  Join Telegram
                </a>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ===== TOP: Wallet + Stats ===== */}
      <motion.div className="dash-bento-top" variants={staggerContainer} initial="hidden" animate="visible">

        {/* Wallet overview card */}
        <motion.div className="dash-total-card" variants={fadeUp} custom={0}>
          <div className="dash-total-card-glow" />
          <div className="dash-total-card-inner">
            <div className="dash-total-header">
              <span className="pulse-dot" />
              <span className="dash-total-tag">Wallet</span>
            </div>
            <div className="dash-total-amount">
              $<CountUp end={walletUSDC} duration={1.5} decimals={2} separator="," />
            </div>
            <span className="dash-total-sub">USDC available in wallet</span>
            <button
              className="btn btn-glass"
              style={{ marginTop: '12px', width: '100%', fontSize: '0.8rem', padding: '8px 12px' }}
              onClick={() => setShowBridgeModal(true)}
            >
              <ArrowLeftRight size={14} />
              Bridge
            </button>
          </div>
        </motion.div>

        {/* Compact stat row */}
        <motion.div variants={fadeUp} custom={1} style={{
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          {[
            { icon: <BarChart3 size={14} />, label: 'Signals', value: signalCount, color: 'var(--text-primary)' },
            { icon: <Copy size={14} />, label: 'My Trades', value: Object.keys(userPositions).length, color: 'var(--accent)' },
            { icon: <Coins size={14} />, label: 'Fee', value: `${(feePercent / 100).toFixed(0)}%`, color: 'var(--text-primary)' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px', borderRadius: '12px',
              background: 'rgba(12,15,21,0.7)', border: '1px solid var(--border)',
            }}>
              <span style={{ color: 'var(--accent)', opacity: 0.7 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 600 }}>{s.label}</div>
              </div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* ===== AUTO-COPY BANNER ===== */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="autocopy-banner"
        style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', marginBottom: '16px' }}
      >
        {/* Animated glow border */}
        <div style={{
          position: 'absolute', inset: '-1px', borderRadius: '20px',
          background: autoCopyConfig.enabled
            ? 'conic-gradient(from 200deg, transparent, rgba(52,211,153,0.3), transparent, rgba(52,211,153,0.15), transparent)'
            : 'conic-gradient(from 200deg, transparent, rgba(212,168,67,0.25), transparent, rgba(139,92,246,0.15), transparent)',
          animation: 'spin 10s linear infinite', filter: 'blur(2px)', opacity: 0.6,
        }} />

        {/* Inner content */}
        <div style={{
          position: 'relative', zIndex: 1,
          background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
          borderRadius: '20px', padding: '24px 28px',
        }}>
          {autoCopyConfig.enabled ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: '1px solid rgba(52,211,153,0.15)',
                }}>
                  <BrainCircuit size={22} style={{ color: 'var(--success)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Auto-Copy Active</span>
                    <span className="pulse-dot" style={{ width: 8, height: 8 }} />
                  </div>
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.2rem', fontWeight: 700,
                    color: 'var(--accent-light)',
                  }}>
                    ${autoCopyConfig.amount.toFixed(2)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>USDC per trade</span>
                </div>
              </div>
              {/* Low balance warning — hidden while user has funds locked in the active trade */}
              {arbUsdcBalance > 0 && arbUsdcBalance < autoCopyConfig.amount && !(activeSignal && userPositions[Number(activeSignal.id)] && Number(userPositions[Number(activeSignal.id)].deposit) > 0) && (
                <div style={{
                  padding: '12px 16px', borderRadius: '12px', marginBottom: '10px',
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                }}>
                  <AlertTriangle size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', flex: 1 }}>
                    Balance <b>${arbUsdcBalance.toFixed(2)}</b> is below your auto-copy of <b>${autoCopyConfig.amount.toFixed(0)}</b>. Top up your wallet or you'll miss the next trade.
                  </span>
                  {activeSignal && Number(activeSignal.phase) === 0 && (
                    <button
                      onClick={() => { setCopyAmount(Math.floor(arbUsdcBalance).toString()); setShowCopyModal(true); }}
                      style={{
                        padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                        background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Copy with ${Math.floor(arbUsdcBalance)}
                    </button>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{
                  flex: 1, padding: '10px 14px', borderRadius: '10px',
                  background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  <CheckCircle2 size={13} style={{ color: 'var(--success)' }} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600 }}>Copying all signals</span>
                </div>
                <button
                  className="btn btn-glass"
                  style={{ padding: '10px 18px', fontSize: '0.78rem' }}
                  onClick={handleDisableAutoCopy}
                  disabled={autoCopyLoading}
                >
                  {autoCopyLoading ? <Loader2 size={14} className="spin" /> : <X size={14} />}
                  Turn Off
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Top row: info + badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(212,168,67,0.2), rgba(212,168,67,0.05))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    border: '1px solid rgba(212,168,67,0.15)',
                  }}>
                    <BrainCircuit size={22} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '2px' }}>
                      Auto-Copy Trading
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Never miss a trade — every signal gets copied automatically
                    </span>
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 12px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Lock size={10} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>On-chain</span>
                </div>
              </div>

              {/* Bottom: amount selection + enable */}
              <div style={{
                padding: '14px 16px', borderRadius: '14px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
                  Amount per trade:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {[10, 25, 50, 100].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setAutoCopyAmount(String(amt))}
                      style={{
                        padding: '7px 16px', borderRadius: '10px', fontSize: '0.75rem',
                        fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                        background: autoCopyAmount === String(amt)
                          ? 'linear-gradient(135deg, rgba(212,168,67,0.2), rgba(212,168,67,0.08))'
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${autoCopyAmount === String(amt) ? 'rgba(212,168,67,0.35)' : 'rgba(255,255,255,0.06)'}`,
                        color: autoCopyAmount === String(amt) ? 'var(--accent)' : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.2s ease',
                      }}
                    >
                      ${amt}
                    </button>
                  ))}
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
                      fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 700,
                      fontFamily: "'Space Grotesk', sans-serif", pointerEvents: 'none',
                    }}>$</span>
                    <input
                      type="number"
                      min="5"
                      step="1"
                      placeholder="Custom"
                      value={autoCopyAmount}
                      onChange={(e) => setAutoCopyAmount(e.target.value)}
                      style={{
                        width: '80px', padding: '7px 10px 7px 24px',
                        borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)',
                        fontSize: '0.8rem', fontFamily: "'Space Grotesk', sans-serif",
                        fontWeight: 600, outline: 'none', transition: 'border-color 0.2s ease',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'rgba(212,168,67,0.4)'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-glow"
                  style={{
                    padding: '10px 24px', fontSize: '0.82rem', fontWeight: 700,
                    width: '100%',
                  }}
                  onClick={handleEnableAutoCopy}
                  disabled={autoCopyLoading || !account}
                >
                  {autoCopyLoading ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                  Enable Auto-Copy
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* ===== PERFORMANCE STATS ===== */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginTop: '16px',
        }}
      >
        {/* Platform Performance */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <BarChart3 size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Platform Performance</h3>
          </div>

          {/* Today's PnL highlight */}
          {performanceStats.platform.today.trades > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: '12px', marginBottom: '12px',
              background: performanceStats.platform.today.totalCopied > 0
                ? 'linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(52,211,153,0.02) 100%)'
                : 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '4px' }}>TODAY'S PERFORMANCE (00:00 — 00:00 UTC)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {performanceStats.platform.today.wins}W / {performanceStats.platform.today.losses}L
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {(() => {
                  const utcN = new Date(); const todayCutoff = Math.floor(Date.UTC(utcN.getUTCFullYear(), utcN.getUTCMonth(), utcN.getUTCDate()) / 1000);
                  const todaySignals = signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0 && Number(s.closedAt) >= todayCutoff);
                  let todayPnl = 0;
                  todaySignals.forEach(s => { todayPnl += s.tradePct; });
                  return (
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 800,
                      color: todayPnl >= 0 ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {todayPnl >= 0 ? '+' : ''}{todayPnl.toFixed(1)}%
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Today', data: performanceStats.platform.today },
              { label: '7 Days', data: performanceStats.platform.week },
              { label: '30 Days', data: performanceStats.platform.month },
              { label: 'All Time', data: performanceStats.platform.all },
            ].map(({ label, data }) => {
              // Calculate total PnL for this period
              const cutoff = label === 'Today' ? 86400 : label === '7 Days' ? 7 * 86400 : label === '30 Days' ? 30 * 86400 : 0;
              const now = Math.floor(Date.now() / 1000);
              const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
              const todayCutoff = Math.floor(startOfDay.getTime() / 1000);
              const periodCutoff = label === 'Today' ? todayCutoff : label === '7 Days' ? now - 7 * 86400 : label === '30 Days' ? now - 30 * 86400 : 0;
              const periodSignals = signalHistory.filter(s => s.closed && Number(s.resultPct) !== 0 && (periodCutoff === 0 || Number(s.closedAt) >= periodCutoff));
              let periodPct = 0;
              periodSignals.forEach(s => { periodPct += s.tradePct; });

              return (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '10px',
                  padding: '12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: '1.1rem', fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", marginBottom: '4px',
                    color: periodPct > 0 ? 'var(--success)' : periodPct < 0 ? 'var(--danger)' : 'var(--text-primary)',
                  }}>
                    {data.trades > 0 ? `${periodPct >= 0 ? '+' : ''}${periodPct.toFixed(1)}%` : '-'}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                    {data.trades} trades · {data.wins}W / {data.losses}L
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* My PnL */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>My PnL</h3>
          </div>

          <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Today', data: performanceStats.my.today },
              { label: '7 Days', data: performanceStats.my.week },
              { label: '30 Days', data: performanceStats.my.month },
              { label: 'All Time', data: performanceStats.my.all },
            ].map(({ label, data }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  {label}
                </div>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: data.pnl >= 0 ? (data.pnl > 0 ? 'var(--success)' : 'var(--text-primary)') : 'var(--danger)',
                  marginBottom: '4px',
                }}>
                  {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>USDC</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {data.trades} trade{data.trades !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ===== MIDDLE: Active Signal + Positions ===== */}
      <div className="dash-mid-grid">

        {/* LEFT: Active Signal */}
        <motion.div className="dash-claim-panel" variants={slideInLeft} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="dash-claim-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Active Signal</h3>
              {activeSignal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif",
                    padding: '3px 10px', borderRadius: '20px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    #{Number(activeSignal.id)}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                    {timeAgo(activeSignal.timestamp)}
                  </span>
                </div>
              )}
            </div>
            {activeSignal ? (
              <div className="signal-card-active">
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span className="pulse-dot" style={{ width: 8, height: 8 }} />
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', fontWeight: 700 }}>XAU/USD</span>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      background: activeSignal.long ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                      color: activeSignal.long ? 'var(--success)' : 'var(--danger)',
                      border: `1px solid ${activeSignal.long ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`
                    }}>
                      {activeSignal.long ? 'LONG' : 'SHORT'}
                    </span>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      background: 'rgba(212, 168, 67, 0.1)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(212, 168, 67, 0.2)',
                    }}>
                      {formatLeverage(activeSignal.leverage)}x
                    </span>
                </div>

                {/* Live PnL Section */}
                {(() => {
                  const entry = Number(activeSignal.entryPrice) / 1e10;
                  const tp = Number(activeSignal.tp) / 1e10;
                  const sl = Number(activeSignal.sl) / 1e10;
                  const lev = Number(activeSignal.leverage) / 1000;
                  const hasPrice = !!livePrice;
                  const pctMove = hasPrice ? ((livePrice - entry) / entry) * 100 * (activeSignal.long ? 1 : -1) : 0;
                  const livePnl = pctMove * lev;
                  const isProfit = livePnl >= 0;

                  // Progress: 0% = SL, 50% = Entry, 100% = TP
                  const range = tp - sl;
                  const progress = hasPrice ? Math.max(0, Math.min(100, ((livePrice - sl) / range) * 100)) : 50;

                  return (
                    <>
                      {/* Live price + PnL hero */}
                      <div style={{
                        position: 'relative', borderRadius: '12px', padding: '16px',
                        marginBottom: '12px', textAlign: 'center', overflow: 'hidden',
                        background: hasPrice
                          ? isProfit
                            ? 'linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.02) 100%)'
                            : 'linear-gradient(135deg, rgba(248,113,113,0.08) 0%, rgba(248,113,113,0.02) 100%)'
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${hasPrice ? (isProfit ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)') : 'rgba(255,255,255,0.06)'}`,
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div style={{ textAlign: 'center', padding: '4px 0' }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                              Live Price
                            </div>
                            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.5rem', lineHeight: 1 }}>
                              {hasPrice ? `$${livePrice.toFixed(2)}` : '—'}
                            </div>
                          </div>
                          <div style={{
                            textAlign: 'center', padding: '4px 0',
                            borderLeft: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                              PnL
                            </div>
                            <div style={{
                              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: '1.5rem', lineHeight: 1,
                              color: hasPrice ? (isProfit ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)',
                            }}>
                              {hasPrice ? `${isProfit ? '+' : ''}${livePnl.toFixed(2)}%` : '—'}
                            </div>
                            {hasPrice && userPositions[Number(activeSignal.id)] && (() => {
                              const col = parseFloat(ethers.formatUnits(userPositions[Number(activeSignal.id)].deposit, USDC_DECIMALS));
                              const pnlUSD = col * livePnl / 100;
                              return (
                                <div style={{
                                  fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.75rem', fontWeight: 600, marginTop: '4px',
                                  color: pnlUSD >= 0 ? 'var(--success)' : 'var(--danger)', opacity: 0.8,
                                }}>
                                  {pnlUSD >= 0 ? '+' : '-'}${Math.abs(pnlUSD).toFixed(2)}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* SL — Entry — TP progress bar */}
                        <div style={{ marginTop: '14px' }}>
                          <TradeProgressBar entry={entry} tp={tp} sl={sl} currentPrice={hasPrice ? livePrice : null} isLong={activeSignal.long} showPrices={isAdmin || !!userPositions[Number(activeSignal.id)]} />
                        </div>
                      </div>
                    </>
                  );
                })()}

                {userPositions[Number(activeSignal.id)] ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px', borderRadius: '8px',
                    background: 'rgba(212, 168, 67, 0.08)', border: '1px solid rgba(212, 168, 67, 0.2)',
                    fontSize: '0.75rem', color: 'var(--accent)',
                  }}>
                    <CheckCircle2 size={14} />
                    Copied {parseFloat(ethers.formatUnits(userPositions[Number(activeSignal.id)].deposit, USDC_DECIMALS)).toFixed(2)} USDC
                    <span style={{ color: 'var(--text-secondary)' }}>&middot;</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{Number(activeSignal.copierCount)} copiers</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      className="btn btn-primary btn-glow"
                      style={{ width: '100%' }}
                      onClick={() => setShowCopyModal(true)}
                      disabled={!account || isLoading}
                    >
                      <Copy size={16} /> Copy Trade
                    </button>
                    <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {Number(activeSignal.copierCount)} copiers &middot; ${parseFloat(ethers.formatUnits(activeSignal.totalCopied, USDC_DECIMALS)).toLocaleString()} USDC
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <Clock size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No active signal right now</div>
                <div style={{ fontSize: '0.75rem', marginTop: '6px', lineHeight: 1.5 }}>
                  When our trader opens a new trade, it will appear here with a "Copy Now" button.
                  <br />Join our <a href="https://t.me/SmartTradingClubDapp" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Telegram</a> to get notified instantly.
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* RIGHT: My Positions & History */}
        <motion.div className="dash-action-panel" variants={slideInRight} initial="hidden" whileInView="visible" viewport={{ once: true }} style={{ maxHeight: '520px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              {[
                { key: 'positions', label: 'My Positions' },
                { key: 'journal', label: 'Journal' },
              ].map(t => (
                <button key={t.key} onClick={() => setPositionsTab(t.key)} style={{
                  flex: 1, padding: '8px', fontSize: '0.75rem', fontWeight: 600,
                  background: positionsTab === t.key ? 'rgba(212,168,67,0.1)' : 'transparent',
                  color: positionsTab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                  borderRight: t.key === 'positions' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {positionsTab === 'positions' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
              {signalHistory.filter(s => userPositions[Number(s.id)] && !userPositions[Number(s.id)].claimed).length > 0 ? (
                signalHistory.filter(s => userPositions[Number(s.id)] && !userPositions[Number(s.id)].claimed).map((signal) => {
                  const pos = userPositions[Number(signal.id)];
                  const isClosed = signal.closed;
                  const result = Number(signal.resultPct) / 100;
                  const collateral = parseFloat(ethers.formatUnits(pos.deposit, USDC_DECIMALS));
                  const leverage = Number(signal.leverage) / 1000;
                  const feePct = Number(signal.feeAtCreation || 0) / 100;

                  // Live PnL for open trades
                  let pnlPct, pnlUSDC, fee, payout;
                  if (isClosed) {
                    pnlPct = result * leverage;
                    pnlUSDC = collateral * pnlPct / 100;
                    fee = pnlUSDC > 0 ? pnlUSDC * feePct / 100 : 0;
                    payout = pnlUSDC >= 0 ? collateral + pnlUSDC - fee : Math.max(0, collateral + pnlUSDC);
                  } else if (livePrice) {
                    const entry = Number(signal.entryPrice) / 1e10;
                    const pctMove = ((livePrice - entry) / entry) * 100 * (signal.long ? 1 : -1);
                    pnlPct = pctMove * leverage;
                    pnlUSDC = collateral * pnlPct / 100;
                    fee = pnlUSDC > 0 ? pnlUSDC * feePct / 100 : 0;
                    payout = pnlUSDC >= 0 ? collateral + pnlUSDC - fee : Math.max(0, collateral + pnlUSDC);
                  } else {
                    pnlPct = 0;
                    pnlUSDC = 0;
                    fee = 0;
                    payout = collateral;
                  }

                  return (
                    <div key={Number(signal.id)} style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '12px',
                      padding: '16px',
                      border: `1px solid ${isClosed ? (result >= 0 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)') : 'var(--border)'}`,
                    }}>
                      {/* Header: direction + status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            background: signal.long ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                            color: signal.long ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {signal.long ? 'LONG' : 'SHORT'}
                          </span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>XAU/USD</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>#{Number(signal.id)}</span>
                        </div>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 10px',
                          borderRadius: '12px',
                          fontWeight: 600,
                          background: (isClosed || livePrice) ? (pnlPct >= 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)') : 'rgba(212, 168, 67, 0.1)',
                          color: (isClosed || livePrice) ? (pnlPct >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--accent)',
                        }}>
                          {(isClosed || livePrice) ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : 'OPEN'}
                        </span>
                      </div>

                      {/* PnL Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invested</div>
                          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.85rem' }}>${collateral.toFixed(2)}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PnL</div>
                          <div style={{
                            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.85rem',
                            color: (isClosed || livePrice) ? (pnlUSDC >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--accent)',
                          }}>
                            {(isClosed || livePrice) ? `${pnlUSDC >= 0 ? '+' : '-'}$${Math.abs(pnlUSDC).toFixed(2)}` : 'Pending'}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isClosed ? 'Payout' : 'Value'}</div>
                          <div style={{
                            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.85rem',
                            color: (isClosed || livePrice) ? (payout > collateral ? 'var(--success)' : payout < collateral ? 'var(--danger)' : 'var(--text-primary)') : 'var(--accent)',
                          }}>
                            {(isClosed || livePrice) ? `$${payout.toFixed(2)}` : 'Pending'}
                          </div>
                        </div>
                      </div>

                      {/* Leverage + fee info */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>{leverage}x leverage</span>
                        {isClosed && fee > 0 && <span>Fee: ${fee.toFixed(2)} USDC</span>}
                      </div>

                      {/* Progress bar for open trades */}
                      {!isClosed && livePrice && (() => {
                        const entry = Number(signal.entryPrice) / 1e10;
                        const tp = Number(signal.tp) / 1e10;
                        const sl = Number(signal.sl) / 1e10;
                        return <TradeProgressBar entry={entry} tp={tp} sl={sl} currentPrice={livePrice} isLong={signal.long} />;
                      })()}

                      {/* Claim button */}
                      {isClosed && !pos.claimed && (
                        contractBalance !== null && contractBalance < payout ? (
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            marginTop: '10px', padding: '10px', borderRadius: '8px', fontSize: '0.75rem',
                            background: 'rgba(212, 168, 67, 0.08)', border: '1px solid rgba(212, 168, 67, 0.15)',
                            color: 'var(--accent)',
                          }}>
                            <Lock size={14} /> Claimable after active trade closes
                          </div>
                        ) : (
                          <button
                            className="btn btn-primary btn-glow"
                            style={{ width: '100%', marginTop: '10px', padding: '10px', fontSize: '0.85rem' }}
                            onClick={() => handleClaimProceeds(Number(signal.id))}
                            disabled={isLoading}
                          >
                            <Zap size={16} /> Claim ${payout.toFixed(2)} USDC
                          </button>
                        )
                      )}
                      {pos.claimed && (
                        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <CheckCircle2 size={14} /> Claimed ${payout.toFixed(2)} USDC
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)' }}>
                  <Copy size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No active positions</div>
                  <div style={{ fontSize: '0.7rem', marginTop: '6px', lineHeight: 1.5 }}>
                    When you copy a trade, it will appear here.
                  </div>
                </div>
              )}
            </div>
            ) : (
            /* Journal tab */
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {(() => {
                const claimed = signalHistory
                  .filter(s => userPositions[Number(s.id)] && userPositions[Number(s.id)].claimed)
                  .sort((a, b) => Number(b.closedAt || b.timestamp) - Number(a.closedAt || a.timestamp));

                if (claimed.length === 0) return (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)' }}>
                    <History size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No history yet</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '6px' }}>Claimed positions will appear here.</div>
                  </div>
                );

                // Group by date
                const grouped = {};
                claimed.forEach(signal => {
                  const ts = Number(signal.closedAt || signal.timestamp) * 1000;
                  const dateKey = new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  if (!grouped[dateKey]) grouped[dateKey] = [];
                  grouped[dateKey].push(signal);
                });

                // Totals
                let totalPnl = 0;
                claimed.forEach(s => {
                  const pos = userPositions[Number(s.id)];
                  const col = parseFloat(ethers.formatUnits(pos.deposit, USDC_DECIMALS));
                  totalPnl += col * (Number(s.resultPct) / 100) / 100;
                });

                return (
                  <>
                    {/* Total summary */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', borderRadius: '10px', marginBottom: '10px',
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{claimed.length} trades claimed</span>
                      <span style={{
                        fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.9rem', fontWeight: 800,
                        color: totalPnl >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
                      </span>
                    </div>

                    {Object.entries(grouped).map(([date, signals]) => {
                      let dayPnl = 0;
                      signals.forEach(s => {
                        const pos = userPositions[Number(s.id)];
                        const col = parseFloat(ethers.formatUnits(pos.deposit, USDC_DECIMALS));
                        dayPnl += col * (Number(s.resultPct) / 100) / 100;
                      });

                      return (
                        <div key={date} style={{ marginBottom: '6px' }}>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 8px', borderRadius: '6px',
                            background: 'rgba(255,255,255,0.02)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)' }}>{date}</span>
                              <div style={{ display: 'flex', gap: '2px' }}>
                                {signals.map((s, i) => (
                                  <div key={i} style={{
                                    width: '5px', height: '5px', borderRadius: '50%',
                                    background: Number(s.resultPct) >= 0 ? 'var(--success)' : 'var(--danger)',
                                    opacity: 0.7,
                                  }} />
                                ))}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{signals.length} trade{signals.length !== 1 ? 's' : ''}</span>
                              <span style={{
                                fontSize: '0.7rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                                color: dayPnl >= 0 ? 'var(--success)' : 'var(--danger)',
                              }}>
                                {dayPnl >= 0 ? '+' : '-'}${Math.abs(dayPnl).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {signals.map(signal => {
                            const pos = userPositions[Number(signal.id)];
                            const col = parseFloat(ethers.formatUnits(pos.deposit, USDC_DECIMALS));
                            const pnlPct = Number(signal.resultPct) / 100;
                            const pnlUSD = col * pnlPct / 100;
                            return (
                              <div key={Number(signal.id)} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '4px 8px 4px 16px', fontSize: '0.6rem',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                                  <span style={{ width: '3px', height: '12px', borderRadius: '2px', background: pnlPct >= 0 ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)' }} />
                                  <span>#{Number(signal.id)}</span>
                                  <span style={{ color: signal.long ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{signal.long ? 'L' : 'S'}</span>
                                  <span>${col.toFixed(0)}</span>
                                </div>
                                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: pnlPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                  {pnlUSD >= 0 ? '+' : '-'}${Math.abs(pnlUSD).toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ===== REFERRAL BANNER ===== */}
      {account && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', marginTop: '16px' }}
        >
          <div style={{
            position: 'absolute', inset: '-1px', borderRadius: '20px',
            background: 'conic-gradient(from 200deg, transparent, rgba(139,92,246,0.25), transparent, rgba(212,168,67,0.2), transparent)',
            animation: 'spin 10s linear infinite', filter: 'blur(2px)', opacity: 0.5,
          }} />
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'var(--bg-card)', backdropFilter: 'blur(24px)',
            borderRadius: '20px', padding: '24px 28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(212,168,67,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: '1px solid rgba(139,92,246,0.15)',
                }}>
                  <Share2 size={22} style={{ color: '#8B5CF6' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '4px' }}>
                    Invite Friends & Earn
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Share your referral link — earn rewards when friends copy trades
                  </div>
                </div>
              </div>

              <div>
                {/* Stats */}
                <div style={{
                  display: 'flex', gap: '16px', padding: '10px 16px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: '10px',
                }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', fontWeight: 700, color: '#8B5CF6' }}>
                      {referralStats.count}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>REFERRALS</div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', fontWeight: 700, color: 'var(--accent)' }}>
                      ${referralStats.volume.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>VOLUME</div>
                  </div>
                </div>

                {/* Copy link button */}
                <div style={{
                  padding: '10px 12px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '0.7rem', color: 'var(--text-secondary)',
                  fontFamily: "'Space Grotesk', sans-serif",
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: '10px',
                }}>
                  smarttradingclub.io/?ref={account.slice(0, 6)}...
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: '10px 20px', fontSize: '0.8rem', fontWeight: 700, width: '100%' }}
                  onClick={() => {
                    navigator.clipboard.writeText(referralLink);
                    setReferralCopied(true);
                    setTimeout(() => setReferralCopied(false), 2000);
                  }}
                >
                  {referralCopied ? <><CheckCircle2 size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ===== BOTTOM: Protocol info + Signal History + Transactions ===== */}
      <div className="dash-bottom-grid" style={{ marginTop: '20px' }}>

        {/* Protocol bar */}
        <motion.div className="dash-protocol-bar" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          {[
            { label: 'Pair', value: 'XAU/USD', color: 'var(--accent-light)' },
            { label: 'Platform', value: 'gTrade', color: 'var(--text-primary)' },
            { label: 'Fee', value: `${(feePercent / 100).toFixed(0)}% on profit`, color: 'var(--text-primary)' },
            { label: 'Network', value: 'Arbitrum', color: '#28A0F0' },
            { label: 'Collateral', value: 'USDC', color: 'var(--blue)' },
            { label: 'Signals', value: `${signalCount}`, color: 'var(--accent-light)' },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <div className="dash-protocol-divider" />}
              <div className="dash-protocol-item">
                <span className="dash-protocol-label">{item.label}</span>
                <span className="dash-protocol-value" style={{ color: item.color }}>{item.value}</span>
              </div>
            </React.Fragment>
          ))}
        </motion.div>

        {/* Signal History */}
        <motion.div className="dash-tx-panel" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="dash-tx-header">
            <div className="dash-tx-header-left">
              <BarChart3 size={16} />
              <h3>Signal History</h3>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { key: 'today', label: 'Today' },
                { key: '7d', label: '7D' },
                { key: 'all', label: 'All' },
              ].map(p => (
                <button key={p.key} onClick={() => setTradeLogPeriod(p.key)} style={{
                  padding: '3px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 600,
                  background: tradeLogPeriod === p.key ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tradeLogPeriod === p.key ? 'rgba(212,168,67,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  color: tradeLogPeriod === p.key ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="dash-tx-list">
            {(() => {
              const now = Math.floor(Date.now() / 1000);
              const utcNow2 = new Date();
              const utcMidnight2 = Math.floor(Date.UTC(utcNow2.getUTCFullYear(), utcNow2.getUTCMonth(), utcNow2.getUTCDate()) / 1000);
              const cutoff = tradeLogPeriod === 'today' ? utcMidnight2
                : tradeLogPeriod === '7d' ? now - 7 * 86400
                : 0;
              const filtered = signalHistory.filter(s => Number(s.closedAt || s.timestamp) >= cutoff && !(s.closed && Number(s.resultPct) === 0));

              // Group by date
              const grouped = {};
              filtered.forEach(signal => {
                const ts = Number(signal.timestamp) * 1000;
                const dateKey = new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                if (!grouped[dateKey]) grouped[dateKey] = { signals: [], dayPnl: 0, wins: 0, losses: 0 };
                grouped[dateKey].signals.push(signal);
                if (signal.closed) {
                  grouped[dateKey].dayPnl += signal.tradePct;
                  if (signal.tradePct >= 0) grouped[dateKey].wins++; else grouped[dateKey].losses++;
                }
              });

              if (filtered.length === 0) {
                return (
                  <div className="dash-tx-empty">
                    <BarChart3 size={24} />
                    <span>{tradeLogPeriod === 'all' ? 'No signals yet' : 'No signals in this period'}</span>
                  </div>
                );
              }

              return Object.entries(grouped).map(([date, group]) => (
                <div key={date}>
                  {/* Date header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 1.75rem 8px',
                    background: 'rgba(255,255,255,0.015)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{date}</span>
                      {(group.wins > 0 || group.losses > 0) && (
                        <span style={{
                          fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px',
                          background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                        }}>
                          {group.signals.length} trades
                        </span>
                      )}
                    </div>
                    {(group.wins > 0 || group.losses > 0) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {group.signals.filter(s => s.closed).map((s, i) => (
                            <div key={i} style={{
                              width: '6px', height: '6px', borderRadius: '50%',
                              background: s.tradePct >= 0 ? 'var(--success)' : 'var(--danger)',
                              opacity: 0.7,
                            }} />
                          ))}
                        </div>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                          color: group.dayPnl >= 0 ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {group.dayPnl >= 0 ? '+' : ''}{group.dayPnl.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Trades */}
                  {group.signals.map((signal, index) => {
                    const leverage = Number(signal.leverage) / 1000;
                    const isClosed = signal.closed;
                    const pnl = signal.tradePct;
                    const isWin = pnl >= 0;

                    // Live PnL for open trades
                    let livePnlVal = null;
                    if (!isClosed && livePrice) {
                      const entry = Number(signal.entryPrice) / 1e10;
                      const pctMove = ((livePrice - entry) / entry) * 100 * (signal.long ? 1 : -1);
                      livePnlVal = pctMove * leverage;
                    }

                    return (
                      <div
                        key={Number(signal.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 1.75rem',
                          borderLeft: `3px solid ${isClosed ? (isWin ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)') : 'rgba(212,168,67,0.4)'}`,
                          borderBottom: '1px solid rgba(255,255,255,0.02)',
                        }}
                      >
                        {/* Signal # */}
                        <span style={{
                          fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif",
                          minWidth: '24px',
                        }}>
                          #{Number(signal.id)}
                        </span>

                        {/* Direction badge */}
                        <span style={{
                          padding: '2px 6px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 700,
                          background: signal.long ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                          color: signal.long ? 'var(--success)' : 'var(--danger)',
                          minWidth: '36px', textAlign: 'center',
                        }}>
                          {signal.long ? 'LONG' : 'SHORT'}
                        </span>

                        {/* Entry price */}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif", flex: 1 }}>
                          ${formatGTradePrice(signal.entryPrice)}
                        </span>

                        {/* Leverage */}
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                          {leverage}x
                        </span>

                        {/* Copied badge */}
                        {account && (
                          <span style={{
                            padding: '2px 5px', borderRadius: '4px', fontSize: '0.5rem', fontWeight: 600,
                            background: userPositions[Number(signal.id)] ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
                            color: userPositions[Number(signal.id)] ? 'var(--success)' : 'var(--text-secondary)',
                            border: `1px solid ${userPositions[Number(signal.id)] ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}`,
                          }}>
                            {userPositions[Number(signal.id)] ? 'COPIED' : 'NOT COPIED'}
                          </span>
                        )}

                        {/* Result */}
                        <div style={{ textAlign: 'right', minWidth: '55px' }}>
                          {isClosed ? (
                            <span style={{
                              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.8rem',
                              color: isWin ? 'var(--success)' : 'var(--danger)',
                            }}>
                              {isWin ? '+' : ''}{pnl.toFixed(1)}%
                            </span>
                          ) : livePnlVal !== null ? (
                            <span style={{
                              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '0.8rem',
                              color: livePnlVal >= 0 ? 'var(--success)' : 'var(--danger)',
                            }}>
                              {livePnlVal >= 0 ? '+' : ''}{livePnlVal.toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>OPEN</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </motion.div>
      </div>

      {/* ===== ADMIN PANEL ===== */}
      {isAdmin && (
        <motion.div
          style={{ marginTop: '24px' }}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <button
            className="btn btn-glass"
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            style={{ marginBottom: '16px' }}
          >
            <Settings size={16} />
            {showAdminPanel ? 'Verberg Admin Panel' : 'Admin Panel'}
          </button>

          <AnimatePresence>
            {showAdminPanel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                {/* Quick Signal Generator — one click trade */}
                <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(212,168,67,0.2)', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Quick Trade</h3>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <div className="input-container" style={{ flex: 1 }}>
                      <input type="number" step="1" className="input-field" placeholder="TP $" value={signalGen.tpDistance} onChange={(e) => setSignalGen(prev => ({ ...prev, tpDistance: e.target.value }))} />
                      <div className="input-suffix">TP $</div>
                    </div>
                    <div className="input-container" style={{ flex: 1 }}>
                      <input type="number" step="1" className="input-field" placeholder="SL $" value={signalGen.slDistance} onChange={(e) => setSignalGen(prev => ({ ...prev, slDistance: e.target.value }))} />
                      <div className="input-suffix">SL $</div>
                    </div>
                    <div className="input-container" style={{ flex: 1 }}>
                      <input type="number" step="1" className="input-field" placeholder="Lev" value={signalGen.leverage} onChange={(e) => setSignalGen(prev => ({ ...prev, leverage: e.target.value }))} />
                      <div className="input-suffix">x</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[true, false].map(isLong => (
                      <button
                        key={isLong ? 'buy' : 'sell'}
                        type="button"
                        disabled={isLoading || activeSignal}
                        className="btn"
                        style={{
                          flex: 1, padding: '14px', fontSize: '1rem', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer',
                          background: isLong ? 'linear-gradient(135deg, var(--accent), var(--accent-light))' : 'var(--danger)',
                          color: isLong ? 'var(--bg-primary)' : '#fff',
                          opacity: (isLoading || activeSignal) ? 0.5 : 1,
                        }}
                        onClick={async () => {
                          if (!isAdmin || !contractRef.current) return;
                          try {
                            setIsLoading(true);
                            const res = await fetch('https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2');
                            const d = await res.json();
                            const price = Number(d.parsed[0].price.price) * Math.pow(10, Number(d.parsed[0].price.expo));
                            const entry = Math.round(price);
                            const tpDist = Number(signalGen.tpDistance) || 20;
                            const slDist = Number(signalGen.slDistance) || 30;
                            const lev = Math.round((Number(signalGen.leverage) || 28) * 1000);

                            const entryBig = BigInt(Math.round(entry * 1e10));
                            const tpBig = BigInt(Math.round((isLong ? entry + tpDist : entry - tpDist) * 1e10));
                            const slBig = BigInt(Math.round((isLong ? entry - slDist : entry + slDist) * 1e10));

                            const tx = await contractRef.current.postSignal(isLong, entryBig, tpBig, slBig, lev);
                            await tx.wait();
                            await loadData(contractRef.current, usdcRef.current, account);
                          } catch (err) {
                            console.error(err);
                            alert(friendlyError(err));
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                      >
                        {isLoading ? '...' : isLong ? 'BUY' : 'SELL'}
                      </button>
                    ))}
                  </div>
                  {activeSignal && activeSignal.phase === 1 && (
                    <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--accent)', textAlign: 'center' }}>
                      Signal #{activeSignal.id} is collecting deposits — bot will auto-copy and open trade
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Post Signal */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Post Signal</h3>
                    <form onSubmit={handlePostSignal}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <button
                          type="button"
                          className={`btn ${signalForm.long ? 'btn-primary' : 'btn-outline'}`}
                          style={{ flex: 1, padding: '8px' }}
                          onClick={() => setSignalForm(prev => ({ ...prev, long: true }))}
                        >
                          LONG
                        </button>
                        <button
                          type="button"
                          className={`btn ${!signalForm.long ? 'btn-primary' : 'btn-outline'}`}
                          style={{ flex: 1, padding: '8px', borderColor: 'var(--danger)', color: !signalForm.long ? '#fff' : 'var(--danger)', background: !signalForm.long ? 'var(--danger)' : 'transparent' }}
                          onClick={() => setSignalForm(prev => ({ ...prev, long: false }))}
                        >
                          SHORT
                        </button>
                      </div>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Entry Price (e.g. 2340.50)" value={signalForm.entryPrice} onChange={(e) => setSignalForm(prev => ({ ...prev, entryPrice: e.target.value }))} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Take Profit" value={signalForm.tp} onChange={(e) => setSignalForm(prev => ({ ...prev, tp: e.target.value }))} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Stop Loss" value={signalForm.sl} onChange={(e) => setSignalForm(prev => ({ ...prev, sl: e.target.value }))} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '12px' }}>
                        <input type="number" step="1" className="input-field" placeholder="Leverage (e.g. 28)" value={signalForm.leverage} onChange={(e) => setSignalForm(prev => ({ ...prev, leverage: e.target.value }))} />
                        <div className="input-suffix">{signalForm.leverage}x</div>
                      </div>
                      <button type="submit" className="btn btn-primary btn-glow" style={{ width: '100%' }} disabled={isLoading}>
                        <Zap size={16} /> {isLoading ? 'Loading...' : 'Post Signal'}
                      </button>
                    </form>
                  </div>

                  {/* Settle Signal */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Settle Signal</h3>
                    <form onSubmit={handleCloseSignal}>
                      <div className="input-container" style={{ marginBottom: '12px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Total USDC returned from gTrade" value={settleTotalReturned} onChange={(e) => setSettleTotalReturned(e.target.value)} />
                        <div className="input-suffix">USDC</div>
                      </div>
                      <button type="submit" className="btn btn-outline" style={{ width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={isLoading}>
                        <X size={16} /> {isLoading ? 'Loading...' : 'Settle Signal'}
                      </button>
                    </form>

                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Withdraw Fees</h4>
                      <button
                        className="btn btn-glass"
                        style={{ width: '100%' }}
                        onClick={async () => {
                          try {
                            setIsLoading(true);
                            const tx = await contractRef.current.withdrawFees();
                            await tx.wait();
                            await loadData(contractRef.current, usdcRef.current, account);
                          } catch (err) {
                            alert(friendlyError(err));
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        disabled={isLoading}
                      >
                        <Coins size={16} /> Withdraw Fees
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ===== BRIDGE MODAL (Li.Fi Widget) ===== */}
      <AnimatePresence>
        {showBridgeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowBridgeModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '420px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}
            >
              <QueryClientProvider client={queryClient}>
                <LiFiWidget
                  integrator="smart-goldbot"
                  config={{
                    appearance: 'dark',
                    variant: 'compact',
                    fromChain: 56,
                    toChain: 42161,
                    toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                    hiddenUI: ['poweredBy', 'language', 'appearance'],
                    theme: {
                      container: {
                        borderRadius: '16px',
                        boxShadow: '0 0 60px rgba(0,0,0,0.6)',
                      },
                      palette: {
                        primary: { main: '#D4A843' },
                        secondary: { main: '#1a1a2e' },
                        background: { default: '#0d0d1a', paper: '#1a1a2e' },
                      },
                    },
                  }}
                />
              </QueryClientProvider>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OLD BRIDGE MODAL (kept as fallback, disabled) */}
      <AnimatePresence>
        {false && (
          <motion.div
            className="modal-overlay-old"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!bridgeLoading) setShowBridgeModal(false); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px'
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-secondary)', borderRadius: '20px',
                padding: '28px', maxWidth: '440px', width: '100%',
                border: '1px solid var(--border)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ArrowLeftRight size={20} style={{ color: 'var(--accent)' }} />
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Bridge</h3>
                </div>
                <button onClick={() => { if (!bridgeLoading) setShowBridgeModal(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Direction toggle */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '4px' }}>
                <button
                  className={`btn ${bridgeDirection === 'toArbitrum' ? 'btn-primary' : 'btn-glass'}`}
                  style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}
                  onClick={() => { setBridgeDirection('toArbitrum'); setBridgeQuote(null); setBridgeError(''); setBridgeToken('USDT'); }}
                  disabled={bridgeLoading}
                >
                  BSC → Arbitrum
                </button>
                <button
                  className={`btn ${bridgeDirection === 'toBSC' ? 'btn-primary' : 'btn-glass'}`}
                  style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}
                  onClick={() => { setBridgeDirection('toBSC'); setBridgeQuote(null); setBridgeError(''); }}
                  disabled={bridgeLoading}
                >
                  Arbitrum → BSC
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                {bridgeDirection === 'toArbitrum'
                  ? 'Bridge USDT or USDC from BNB Chain to Arbitrum USDC. Powered by Li.Fi.'
                  : 'Bridge USDC from Arbitrum back to USDT on BNB Chain. Powered by Li.Fi.'}
              </div>

              {/* Done state */}
              {bridgeStatus === "done" ? (
                <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                  <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: '16px' }} />
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>Bridge Complete!</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    {bridgeDirection === 'toArbitrum'
                      ? 'Your USDC is now on Arbitrum. Switch network to start copy trading.'
                      : 'Your USDT is now on BNB Chain.'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {bridgeDirection === 'toArbitrum' ? (
                      <button className="btn btn-primary btn-glow" style={{ flex: 1 }} onClick={async () => {
                        await switchToArbitrum();
                        setShowBridgeModal(false);
                        setBridgeStatus("");
                      }}>
                        Switch to Arbitrum
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-glow" style={{ flex: 1 }} onClick={() => { setShowBridgeModal(false); setBridgeStatus(""); }}>
                        Done
                      </button>
                    )}
                    <button className="btn btn-glass" style={{ flex: 1 }} onClick={() => { setShowBridgeModal(false); setBridgeStatus(""); }}>
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Route visualization */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', marginBottom: '16px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>FROM</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: bridgeDirection === 'toArbitrum' ? '#F3BA2F' : '#28A0F0' }}>
                        {bridgeDirection === 'toArbitrum' ? 'BNB Chain' : 'Arbitrum'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {bridgeDirection === 'toArbitrum' ? bridgeToken : 'USDC'}
                      </div>
                    </div>
                    <ArrowRight size={20} style={{ color: 'var(--accent)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>TO</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: bridgeDirection === 'toArbitrum' ? '#28A0F0' : '#F3BA2F' }}>
                        {bridgeDirection === 'toArbitrum' ? 'Arbitrum' : 'BNB Chain'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {bridgeDirection === 'toArbitrum' ? 'USDC' : 'USDT'}
                      </div>
                    </div>
                  </div>

                  {/* Token selector (only for BSC → Arbitrum) */}
                  {bridgeDirection === 'toArbitrum' && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      {["USDT", "USDC"].map(token => (
                        <button
                          key={token}
                          type="button"
                          className={`btn ${bridgeToken === token ? 'btn-primary' : 'btn-outline'}`}
                          style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                          onClick={() => { setBridgeToken(token); setBridgeQuote(null); setBridgeError(""); }}
                          disabled={bridgeLoading}
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Amount input */}
                  <div style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      <span>Amount</span>
                      <span>Balance: {bridgeDirection === 'toArbitrum' ? bscBalance[bridgeToken].toFixed(2) + ' ' + bridgeToken : arbUsdcBalance.toFixed(2) + ' USDC'}</span>
                    </div>
                    <div className="input-container" style={{ marginBottom: 0 }}>
                      <Coins className="input-icon" size={18} />
                      <input
                        type="number"
                        step="0.01"
                        className="input-field"
                        style={{ fontSize: '1.1rem', minWidth: 0 }}
                        placeholder="0.00"
                        value={bridgeAmount}
                        onChange={(e) => { setBridgeAmount(e.target.value); setBridgeQuote(null); }}
                        disabled={bridgeLoading}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingRight: '0.5rem' }}>
                        <button type="button" className="input-max-btn" style={{ marginRight: 0 }} onClick={() => {
                          const max = bridgeDirection === 'toArbitrum' ? bscBalance[bridgeToken].toFixed(2) : arbUsdcBalance.toFixed(2);
                          setBridgeAmount(max); setBridgeQuote(null);
                        }}>MAX</button>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{bridgeDirection === 'toArbitrum' ? bridgeToken : 'USDC'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick amounts */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                    {[25, 50, 75, 100].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        className="dash-quick-btn"
                        onClick={() => {
                          const bal = bridgeDirection === 'toArbitrum' ? bscBalance[bridgeToken] : arbUsdcBalance;
                          setBridgeAmount((bal * pct / 100).toFixed(2)); setBridgeQuote(null);
                        }}
                        disabled={bridgeLoading}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  {/* Quote result */}
                  {bridgeQuote && (
                    <div style={{
                      background: 'rgba(52, 211, 153, 0.06)', border: '1px solid rgba(52, 211, 153, 0.2)',
                      borderRadius: '12px', padding: '14px', marginBottom: '16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>You receive</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--success)' }}>
                          ~{parseFloat(ethers.formatUnits(bridgeQuote.estimate.toAmount, bridgeDirection === 'toArbitrum' ? 6 : 18)).toFixed(2)} {bridgeDirection === 'toArbitrum' ? 'USDC' : 'USDT'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        <span>Bridge: {bridgeQuote.tool}</span>
                        <span>~{Math.ceil(bridgeQuote.estimate.executionDuration / 60)} min</span>
                      </div>
                      {bridgeQuote.estimate.gasCosts?.[0] && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <span>Gas fee</span>
                          <span>~${parseFloat(bridgeQuote.estimate.gasCosts[0].amountUSD || "0").toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {bridgeError && (
                    <div style={{
                      background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.2)',
                      borderRadius: '10px', padding: '12px', marginBottom: '16px',
                      fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <AlertTriangle size={16} />
                      {bridgeError}
                    </div>
                  )}

                  {/* Status indicator */}
                  {bridgeStatus && bridgeStatus !== "error" && (
                    <div style={{
                      background: 'rgba(212, 168, 67, 0.08)', border: '1px solid rgba(212, 168, 67, 0.2)',
                      borderRadius: '10px', padding: '12px', marginBottom: '16px',
                      fontSize: '0.8rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <Loader2 size={16} className="spin" />
                      {bridgeStatus === "quoting" && "Getting best bridge route..."}
                      {bridgeStatus === "approving" && "Approve token in your wallet..."}
                      {bridgeStatus === "bridging" && "Confirm bridge transaction..."}
                      {bridgeStatus === "waiting" && "Bridging in progress... This may take a few minutes."}
                    </div>
                  )}

                  {/* Action buttons */}
                  {!bridgeQuote ? (
                    <button
                      className="btn btn-primary btn-glow"
                      style={{ width: '100%' }}
                      onClick={handleGetQuote}
                      disabled={bridgeLoading || !bridgeAmount || Number(bridgeAmount) <= 0 || !account}
                    >
                      {bridgeLoading ? <><Loader2 size={16} className="spin" /> Getting Quote...</> : <><RefreshCw size={16} /> Get Bridge Quote</>}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-glow"
                      style={{ width: '100%' }}
                      onClick={handleBridge}
                      disabled={bridgeLoading}
                    >
                      {bridgeLoading
                        ? <><Loader2 size={16} className="spin" /> Bridging...</>
                        : bridgeDirection === 'toArbitrum'
                          ? <><ArrowLeftRight size={16} /> Bridge {bridgeAmount} {bridgeToken} → USDC</>
                          : <><ArrowLeftRight size={16} /> Bridge {bridgeAmount} USDC → USDT</>
                      }
                    </button>
                  )}

                  {/* Network switch helper */}
                  {bridgeDirection === 'toArbitrum' && !isOnBSC && (
                    <div style={{ textAlign: 'center', marginTop: '12px' }}>
                      <button className="btn btn-glass" style={{ fontSize: '0.8rem', padding: '8px 16px' }} onClick={async () => {
                        try {
                          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] });
                        } catch (err) {
                          if (err.code === 4902) {
                            await window.ethereum.request({
                              method: 'wallet_addEthereumChain',
                              params: [{
                                chainId: BSC_CHAIN_ID,
                                chainName: 'BNB Smart Chain',
                                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                                rpcUrls: ['https://bsc-dataseed.binance.org/'],
                                blockExplorerUrls: ['https://bscscan.com/'],
                              }],
                            });
                          }
                        }
                      }}>
                        <Network size={14} /> Switch to BNB Chain first
                      </button>
                    </div>
                  )}
                  {bridgeDirection === 'toBSC' && !isOnArbitrum && (
                    <div style={{ textAlign: 'center', marginTop: '12px' }}>
                      <button className="btn btn-glass" style={{ fontSize: '0.8rem', padding: '8px 16px' }} onClick={switchToArbitrum}>
                        <Network size={14} /> Switch to Arbitrum first
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== COPY TRADE MODAL ===== */}
      <AnimatePresence>
        {showCopyModal && activeSignal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCopyModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px'
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-secondary)', borderRadius: '20px',
                padding: '28px', maxWidth: '420px', width: '100%',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Copy This Trade</h3>
                <button onClick={() => setShowCopyModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Signal summary */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600 }}>XAU/USD</span>
                  <span style={{
                    padding: '2px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700,
                    background: activeSignal.long ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                    color: activeSignal.long ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {activeSignal.long ? 'LONG' : 'SHORT'} {formatLeverage(activeSignal.leverage)}x
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '0.75rem' }}>
                  {[
                    { label: 'Entry', price: formatGTradePrice(activeSignal.entryPrice), color: 'var(--text-secondary)' },
                    { label: 'TP', price: formatGTradePrice(activeSignal.tp), color: 'var(--success)' },
                    { label: 'SL', price: formatGTradePrice(activeSignal.sl), color: 'var(--danger)' },
                  ].map(item => (
                    <div key={item.label}><span style={{ color: item.color }}>{item.label}</span><br/>
                      {(isAdmin || (activeSignal && userPositions[Number(activeSignal.id)])) ? `$${item.price}` : `${item.price.replace(/,/g, '').slice(0, 2)}••`}
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <form onSubmit={handleCopyTrade}>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    <span>Amount</span>
                    <span>Available: {walletUSDC.toFixed(2)} USDC</span>
                  </div>
                  <div className="input-container">
                    <Coins className="input-icon" size={18} />
                    <input type="number" step="0.01" className="input-field" placeholder="0.00" value={copyAmount} onChange={(e) => setCopyAmount(e.target.value)} />
                    <button type="button" className="input-max-btn" onClick={() => setCopyAmount(walletUSDC.toFixed(2))}>MAX</button>
                    <div className="input-suffix">USDC</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                  {[25, 50, 75, 100].map(pct => (
                    <button key={pct} type="button" className="dash-quick-btn" onClick={() => setCopyAmount((walletUSDC * pct / 100).toFixed(2))}>
                      {pct}%
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.6, background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <AlertTriangle size={12} />
                    <strong>How it works:</strong>
                  </div>
                  <div>1. MetaMask will ask you to approve USDC</div>
                  <div>2. Your USDC is used to open the trade</div>
                  <div>3. When the trade closes, click "Claim" to get paid</div>
                  <div style={{ marginTop: '6px', color: 'var(--accent)' }}>Fee: {(feePercent / 100).toFixed(0)}% on profit only — no fee on losses</div>
                </div>

                <button type="submit" className="btn btn-primary btn-glow" style={{ width: '100%', padding: '14px', fontSize: '1rem' }} disabled={isLoading || !account}>
                  <Zap size={18} /> {isLoading ? 'Processing...' : 'Copy Now'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <>
      {/* ===== BACKGROUND ===== */}
      <div className="bg-system">
        <div className="bg-hero-image" style={{ backgroundImage: "url('/hero-bg.png')" }} />
        <div className="bg-hero-fade" />
        <div className="bg-mesh" />
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
        <div className="bg-orb bg-orb-4" />
        <div className="bg-dots" />
        <div className="bg-noise" />
        <div className="bg-vignette" />
      </div>

      <div className="app-container">
        {/* Navigation */}
        <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
          <div className="brand">
            <img src="/logo.png" alt="Smart Trading Club" className="brand-logo" />
            <span className="brand-text">Smart <span className="text-gold-gradient">Trading</span> Club</span>
          </div>

          <div className={`nav-links ${mobileMenuOpen ? 'nav-links-open' : ''}`}>
            {[
              { key: 'invest', label: 'Copy Trading' },
              { key: 'dashboard', label: 'Dashboard' },
              { key: 'analysis', label: 'Scalp AI' },
              { key: 'results', label: 'Results' },
              { key: 'referral', label: 'Referral' },
              { key: 'docs', label: 'Docs' },
            ].map(t => (
              <button key={t.key} className={`nav-link ${activeTab === t.key ? 'active' : ''}`} onClick={() => { setActiveTab(t.key); setMobileMenuOpen(false); }}>
                {t.label}
              </button>
            ))}
            <a href={`https://arbiscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="nav-link nav-link-external" onClick={() => setMobileMenuOpen(false)}>
              <ShieldCheck size={14} />
              Contract
            </a>
            <a href="https://t.me/SmartTradingClubDapp" target="_blank" rel="noopener noreferrer" className="nav-link nav-link-external" onClick={() => setMobileMenuOpen(false)}>
              Community
            </a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="connect-wallet-btn" onClick={connectWallet} disabled={isConnecting}>
              <Wallet size={16} />
              {account
                ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}`
                : (isConnecting ? "Connecting..." : "Connect")}
            </button>
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          {/* Legacy claim banner — visible on all tabs for this specific wallet */}
          {account && account.toLowerCase() === '0x52de1ec42554cd0867fe7d8a7eb105d09912afb3' && !legacyClaimed && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(212,168,67,0.1), rgba(212,168,67,0.05))',
              border: '1px solid rgba(212,168,67,0.25)',
              borderRadius: '16px', padding: '20px 24px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                  You have an unclaimed position from the previous contract
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Signal #17 — ~$35.10 USDC available to claim
                </div>
              </div>
              <button
                className="btn btn-primary"
                disabled={isLoading}
                onClick={async () => {
                  try {
                    setIsLoading(true);
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    const oldContract = new ethers.Contract(
                      '0xf41d121DB5841767f403a4Bc59A54B26DecF6b99',
                      ['function claimProceeds(uint256 _id) external'],
                      signer
                    );
                    const tx = await oldContract.claimProceeds(17);
                    await tx.wait();
                    setLegacyClaimed(true);
                  } catch (err) {
                    alert(friendlyError(err));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                {isLoading ? 'Claiming...' : 'Claim $35.10 USDC'}
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'invest' ? (
              <motion.div key="invest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderInvest()}
              </motion.div>
            ) : activeTab === 'results' ? (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderResults()}
              </motion.div>
            ) : activeTab === 'referral' ? (
              <motion.div key="referral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderReferral()}
              </motion.div>
            ) : activeTab === 'docs' ? (
              <motion.div key="docs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderDocs()}
              </motion.div>
            ) : activeTab === 'strategies' ? (
              <motion.div key="strategies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderStrategies()}
              </motion.div>
            ) : activeTab === 'analysis' ? (
              <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderAnalysis()}
              </motion.div>
            ) : (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderDashboard()}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Disclaimer */}
        <footer style={{
          padding: '24px 16px', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)',
          lineHeight: 1.6, maxWidth: '700px', margin: '0 auto',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <p style={{ margin: '0 0 8px' }}>
            Trading involves significant risk. Past performance does not guarantee future results. You may lose some or all of your invested capital. Only trade with funds you can afford to lose.
          </p>
          <p style={{ margin: 0 }}>
            Smart Trading Club is a decentralized protocol on Arbitrum. All trades are executed on-chain via gTrade. This is not financial advice. DYOR.
          </p>
        </footer>
      </div>
    </>
  );
}

export default App;

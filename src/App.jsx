/* global BigInt */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { ethers } from 'ethers';
import { Wallet, ArrowDownRight, ArrowUpRight, Coins, TrendingUp, ShieldCheck, Zap, BarChart3, History, CheckCircle2, Lock, BrainCircuit, Network, Cpu, Clock, ArrowRight, Shield, ExternalLink, ChevronDown, Sparkles, Eye, Copy, X, AlertTriangle, Settings, ArrowLeftRight, Loader2, RefreshCw } from 'lucide-react';
import CONTRACT_ABI from './contractABI.json';
import './index.css';

// ===== ARBITRUM CONFIG =====
const CONTRACT_ADDRESS = "0xb09d6B8fA13Cbf757393ECb3E9c616C6BE94cA82";
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

// Helper: format leverage (1e3 precision)
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

function App() {
  const [account, setAccount] = useState("");
  const [activeTab, setActiveTab] = useState("invest");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [particlesReady, setParticlesReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Blockchain State
  const [walletUSDC, setWalletUSDC] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // Signal State
  const [activeSignal, setActiveSignal] = useState(null);
  const [signalHistory, setSignalHistory] = useState([]);
  const [userPositions, setUserPositions] = useState({});
  const [signalCount, setSignalCount] = useState(0);
  const [feePercent, setFeePercent] = useState(2000); // 20% default (contract uses basis points: 2000 = 20%)

  // Performance stats computed from signal history + user positions
  const performanceStats = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const DAY = 86400;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;

    const closedSignals = signalHistory.filter(s => s.closed);
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
        const col = pos ? parseFloat(ethers.formatUnits(pos.collateral, 6)) : 0;
        const resultPct = Number(s.resultPct) / 100; // to %
        const lev = Number(s.leverage) / 1000;
        const pnl = col * (resultPct / 100) * lev;
        totalPnl += pnl;
        totalCollateral += col;
        if (Number(s.resultPct) >= 0) wins++;
        else losses++;
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

      for (const s of filtered) {
        if (Number(s.resultPct) >= 0) wins++;
        else losses++;
        totalCopied += parseFloat(ethers.formatUnits(s.totalCopied || 0n, 6));
      }

      return { wins, losses, trades: filtered.length, winRate: filtered.length > 0 ? (wins / filtered.length * 100) : 0, totalCopied };
    };

    return {
      my: {
        today: calcPnl(mySignals, now - DAY),
        week: calcPnl(mySignals, now - WEEK),
        month: calcPnl(mySignals, now - MONTH),
        all: calcPnl(mySignals, null),
      },
      platform: {
        today: calcPlatformPnl(closedSignals, now - DAY),
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
  const [signalForm, setSignalForm] = useState({
    long: true,
    entryPrice: '',
    tp: '',
    sl: '',
    leverage: '50'
  });
  const [closeSignalId, setCloseSignalId] = useState('');
  const [closeResultPct, setCloseResultPct] = useState('');

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
  }, []);

  // Scroll detection for navbar
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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
      let freshQuote;
      if (bridgeDirection === "toArbitrum") {
        const token = BSC_TOKENS[bridgeToken];
        const amountWei = ethers.parseUnits(bridgeAmount, token.decimals).toString();
        freshQuote = await getBridgeQuote(token.address, amountWei, account, "toBridge");
      } else {
        const amountWei = ethers.parseUnits(bridgeAmount, 6).toString();
        freshQuote = await getBridgeQuote(USDC_ADDRESS, amountWei, account, "fromBridge");
      }

      // Step 2: Approve on the fresh quote's approval address
      const fromTokenAddr = freshQuote.action?.fromToken?.address;
      const approvalAddr = freshQuote.estimate?.approvalAddress;
      if (fromTokenAddr && fromTokenAddr !== "0x0000000000000000000000000000000000000000" && approvalAddr) {
        setBridgeStatus("approving");
        const tokenContract = new ethers.Contract(fromTokenAddr, ERC20_ABI, signer);
        const allowance = await tokenContract.allowance(account, approvalAddr);
        const requiredAmount = BigInt(freshQuote.action.fromAmount);
        if (BigInt(allowance) < requiredAmount) {
          if (BigInt(allowance) > 0n) {
            const resetTx = await tokenContract.approve(approvalAddr, 0);
            await resetTx.wait();
          }
          const approveTx = await tokenContract.approve(approvalAddr, ethers.MaxUint256);
          await approveTx.wait();
        }
      }

      // Step 3: Send bridge transaction directly via MetaMask (bypass ethers.js quirks)
      setBridgeStatus("bridging");
      const txReq = freshQuote.transactionRequest;
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: txReq.to,
          data: txReq.data,
          value: txReq.value || "0x0",
          gas: txReq.gasLimit,
          gasPrice: txReq.gasPrice,
        }],
      });
      // Wait for confirmation
      const receipt = await provider.waitForTransaction(txHash);

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

  // Load data from contract
  const loadData = useCallback(async (contract, usdcContract, userAddress) => {
    try {
      // Wallet USDC balance
      const walletBal = await usdcContract.balanceOf(userAddress);
      setWalletUSDC(parseFloat(ethers.formatUnits(walletBal, USDC_DECIMALS)));

      // Check if admin
      const adminAddr = await contract.admin();
      setIsAdmin(adminAddr.toLowerCase() === userAddress.toLowerCase());

      // Signal count & fee
      const count = await contract.signalCount();
      setSignalCount(Number(count));
      const fee = await contract.feePercent();
      setFeePercent(Number(fee));

      // Active signal
      try {
        const activeId = await contract.getActiveSignalId();
        if (Number(activeId) > 0) {
          const core = await contract.signalCore(activeId);
          const meta = await contract.signalMeta(activeId);
          setActiveSignal({ id: Number(activeId), ...core, ...meta });
        } else {
          setActiveSignal(null);
        }
      } catch {
        setActiveSignal(null);
      }

      // Signal history (load last 20)
      try {
        const total = Number(count);
        const histArr = [];
        const start = Math.max(1, total - 19);
        for (let i = total; i >= start; i--) {
          const core = await contract.signalCore(i);
          const meta = await contract.signalMeta(i);
          histArr.push({ id: i, ...core, ...meta });
        }
        setSignalHistory(histArr);
      } catch {
        setSignalHistory([]);
      }

      // User positions
      try {
        const sids = await contract.getUserSignalIds(userAddress);
        const posMap = {};
        for (const sid of sids) {
          const pos = await contract.positions(userAddress, sid);
          if (Number(pos.collateral) > 0) {
            posMap[Number(sid)] = pos;
          }
        }
        setUserPositions(posMap);
      } catch {
        setUserPositions({});
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

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);

      // Only set up contract refs if on Arbitrum
      if (chainId === ARBITRUM_CHAIN_ID) {
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
    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', () => {});
    };
  }, [loadData]);

  // Refresh data periodically
  useEffect(() => {
    if (!account || !contractRef.current || !usdcRef.current) return;
    const interval = setInterval(() => {
      loadData(contractRef.current, usdcRef.current, account);
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
      alert(err.reason || err.message || "Failed to post signal");
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
      const resultBps = Math.round(parseFloat(closeResultPct) * 100); // convert % to basis points

      const tx = await contractRef.current.closeSignal(
        BigInt(closeSignalId),
        BigInt(resultBps)
      );
      await tx.wait();

      setCloseSignalId('');
      setCloseResultPct('');
      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Close signal error:", err);
      alert(err.reason || err.message || "Failed to close signal");
    } finally {
      setIsLoading(false);
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

      const tx = await contractRef.current.copyTrade(activeSignal.id, amount);
      const receipt = await tx.wait();

      setTransactions(prev => [
        { id: `${receipt.hash.substring(0, 6)}...${receipt.hash.substring(62)}`, type: 'copy', amount: Number(copyAmount), signalId: Number(activeSignal.id), date: 'Nu net' },
        ...prev
      ]);
      setCopyAmount("");
      setShowCopyModal(false);
      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Copy trade error:", err);
      alert(err.reason || err.message || "Copy trade failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ===== USER: Claim Proceeds =====
  const handleClaimProceeds = async (signalId) => {
    if (!account) return;

    try {
      setIsLoading(true);
      const tx = await contractRef.current.claimProceeds(BigInt(signalId));
      const receipt = await tx.wait();

      setTransactions(prev => [
        { id: `${receipt.hash.substring(0, 6)}...${receipt.hash.substring(62)}`, type: 'claim', amount: 0, signalId, date: 'Nu net' },
        ...prev
      ]);
      await loadData(contractRef.current, usdcRef.current, account);
    } catch (err) {
      console.error("Claim error:", err);
      alert(err.reason || err.message || "Claim failed");
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
              <span>Live op Arbitrum</span>
              <span className="hero-tag-badge">v3.0</span>
            </motion.div>

            <motion.h1 className="hero-title" variants={fadeUp} custom={1}>
              <span className="hero-title-line">Smart Trading</span>
              <span className="hero-title-line">Club.</span>
              <span className="hero-title-accent">
                <span className="text-gold-gradient">Copy & Earn.</span>
                <Sparkles className="hero-sparkle" size={28} />
              </span>
            </motion.h1>

            <motion.p className="hero-subtitle" variants={fadeUp} custom={2}>
              Copy our live gold trades directly from your wallet.
              No deposit needed — you pay per trade via MetaMask. Powered by gTrade on Arbitrum.
            </motion.p>

            {/* Trust indicators */}
            <motion.div className="hero-trust-row" variants={fadeUp} custom={3}>
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
                    <span className="pulse-dot" />
                    <span className="hero-card-label">Live Trading Terminal</span>
                  </div>
                  <span className="hero-card-live">LIVE</span>
                </div>

                {/* Active trade preview */}
                <div style={{ padding: '16px 0 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.3rem', fontWeight: 700 }}>XAU/USD</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700,
                        background: activeSignal ? (activeSignal.long ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)') : 'rgba(255,255,255,0.06)',
                        color: activeSignal ? (activeSignal.long ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)',
                        letterSpacing: '0.05em'
                      }}>
                        {activeSignal ? (activeSignal.long ? 'LONG' : 'SHORT') : 'WAITING'}
                      </span>
                    </div>
                    {activeSignal && (
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                        {formatLeverage(activeSignal.leverage)}x
                      </span>
                    )}
                  </div>
                  {activeSignal ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {[
                        { label: 'ENTRY', value: `$${formatGTradePrice(activeSignal.entryPrice)}`, color: 'var(--text-primary)' },
                        { label: 'TP', value: `$${formatGTradePrice(activeSignal.tp)}`, color: 'var(--success)' },
                        { label: 'SL', value: `$${formatGTradePrice(activeSignal.sl)}`, color: 'var(--danger)' },
                      ].map(item => (
                        <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '2px' }}>{item.label}</div>
                          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.85rem', color: item.color }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <Clock size={14} />
                      <span>Waiting for next signal...</span>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', padding: '14px 0 12px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)' }}>
                      <CountUp end={signalCount} duration={2} />
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Signals</div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.2rem', fontWeight: 700 }}>150x</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Max Leverage</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.2rem', fontWeight: 700 }}>{(feePercent / 100).toFixed(0)}%</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>Profit Fee</div>
                  </div>
                </div>

                {/* Performance bars */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Recent Performance</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>Gold Trading</span>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '48px' }}>
                    {[
                      { h: 65, win: true }, { h: 40, win: false }, { h: 80, win: true },
                      { h: 55, win: true }, { h: 30, win: false }, { h: 75, win: true },
                      { h: 90, win: true }, { h: 45, win: true }, { h: 60, win: true },
                      { h: 35, win: false }, { h: 85, win: true }, { h: 70, win: true },
                    ].map((bar, i) => (
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

                {/* Bottom tags */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {['Arbitrum', 'gTrade', 'USDC', 'On-Chain'].map(tag => (
                    <span key={tag} style={{
                      padding: '3px 10px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600,
                      background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>{tag}</span>
                  ))}
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
                <span className="marquee-dot green" />
                <span className="marquee-label">Signalen</span>
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
                <span className="marquee-dot gold" />
                <span className="marquee-label">Fee</span>
                <span className="marquee-value gold">{(feePercent / 100).toFixed(0)}% per trade</span>
              </div>
              <div className="marquee-divider">&bull;</div>
              <div className="marquee-item">
                <span className="marquee-dot green" />
                <span className="marquee-label">Netwerk</span>
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
            { num: '01', icon: <Wallet size={22} />, title: 'Connect Wallet', desc: 'Connect MetaMask to Arbitrum. You need USDC and a little ETH for gas.', color: 'var(--blue)' },
            { num: '02', icon: <Eye size={22} />, title: 'View Signals', desc: 'Our trader opens positions on XAU/USD. You see live signals with entry, TP and SL.', color: 'var(--emerald)' },
            { num: '03', icon: <Copy size={22} />, title: 'Copy Trade', desc: 'Click "Copy Trade", choose your amount in USDC. MetaMask opens, confirm and you\'re in.', color: 'var(--accent)' },
            { num: '04', icon: <Zap size={22} />, title: 'Claim Profit', desc: 'Trade closes automatically at TP/SL. Claim your profit directly back to your wallet.', color: 'var(--violet)' },
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
              <p>Copy trades from experienced gold traders. Every trade is executed on-chain via gTrade with real leverage on XAU/USD.</p>
              <div className="bento-hero-bottom">
                <div className="bento-hero-stat">
                  <span className="bento-hero-stat-num">150x</span>
                  <span className="bento-hero-stat-label">max leverage</span>
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
            <h4>No Deposit Needed</h4>
            <p>You pay per trade directly from your own wallet. No lock-ups, no deposit.</p>
            <span className="bento-inline-badge green">Directly from wallet</span>
          </motion.div>

          <motion.div className="bento-inline" variants={fadeUp} custom={5} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-inline-icon" style={{ color: 'var(--violet)', borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)' }}>
              <Copy size={20} />
            </div>
            <h4>1-Click Copy</h4>
            <p>See a signal, click copy, confirm in MetaMask. It's that simple.</p>
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
              Our trader opens positions on MT5 and mirrors them via gTrade on-chain.
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
    </>
  );

  // ===== RESULTS PAGE =====

  const renderResults = () => {
    const closedSignals = signalHistory.filter(s => s.closed);
    const wins = closedSignals.filter(s => Number(s.resultPct) > 0);
    const losses = closedSignals.filter(s => Number(s.resultPct) < 0);
    const breakeven = closedSignals.filter(s => Number(s.resultPct) === 0);
    const winRate = closedSignals.length > 0 ? (wins.length / closedSignals.length * 100) : 0;

    // Best & worst trade
    const bestTrade = closedSignals.length > 0
      ? closedSignals.reduce((a, b) => Number(a.resultPct) > Number(b.resultPct) ? a : b)
      : null;
    const worstTrade = closedSignals.length > 0
      ? closedSignals.reduce((a, b) => Number(a.resultPct) < Number(b.resultPct) ? a : b)
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
        if (Number(s.resultPct) >= 0) groups[key].wins++;
        else groups[key].losses++;
      }
      return groups;
    };

    // Current streak
    let streak = 0;
    let streakType = '';
    for (const s of [...closedSignals].sort((a, b) => Number(b.closedAt) - Number(a.closedAt))) {
      const isWin = Number(s.resultPct) > 0;
      if (streak === 0) {
        streakType = isWin ? 'win' : 'loss';
        streak = 1;
      } else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) {
        streak++;
      } else {
        break;
      }
    }

    // Average result
    const avgResult = closedSignals.length > 0
      ? closedSignals.reduce((sum, s) => sum + Number(s.resultPct), 0) / closedSignals.length / 100
      : 0;

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
          <span className="section-badge">Verified On-Chain</span>
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
                +{(Number(bestTrade.resultPct) / 100).toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                #{Number(bestTrade.id)} &middot; {bestTrade.long ? 'LONG' : 'SHORT'} &middot; {formatLeverage(bestTrade.leverage)}x
              </div>
            </div>
            <div style={{ background: 'rgba(248, 113, 113, 0.05)', borderRadius: '14px', padding: '20px', border: '1px solid rgba(248, 113, 113, 0.15)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Worst Trade</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)', fontFamily: "'Space Grotesk', sans-serif" }}>
                {(Number(worstTrade.resultPct) / 100).toFixed(2)}%
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
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Daily Performance</h3>
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
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Monthly Breakdown</h3>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Trade Log</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{signalHistory.length} signals</span>
          </div>

          {/* Table Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '50px 70px 80px 1fr 80px 80px 100px',
            gap: '8px', padding: '8px 12px', fontSize: '0.65rem', color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)',
          }}>
            <span>#</span>
            <span>Direction</span>
            <span>Leverage</span>
            <span>Entry / TP / SL</span>
            <span>Copiers</span>
            <span>Volume</span>
            <span style={{ textAlign: 'right' }}>Result</span>
          </div>

          {/* Trade Rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {signalHistory.map((signal, index) => {
              const result = Number(signal.resultPct) / 100;
              const isClosed = signal.closed;
              return (
                <motion.div
                  key={Number(signal.id)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  style={{
                    display: 'grid', gridTemplateColumns: '50px 70px 80px 1fr 80px 80px 100px',
                    gap: '8px', padding: '12px', fontSize: '0.8rem',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>{Number(signal.id)}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700, textAlign: 'center',
                    background: signal.long ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                    color: signal.long ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {signal.long ? 'LONG' : 'SHORT'}
                  </span>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.8rem' }}>
                    {formatLeverage(signal.leverage)}x
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: "'Space Grotesk', sans-serif" }}>
                    ${formatGTradePrice(signal.entryPrice)} / ${formatGTradePrice(signal.tp)} / ${formatGTradePrice(signal.sl)}
                  </span>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.8rem' }}>
                    {Number(signal.copierCount)}
                  </span>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.8rem' }}>
                    ${parseFloat(ethers.formatUnits(signal.totalCopied || 0n, 6)).toFixed(0)}
                  </span>
                  <span style={{
                    textAlign: 'right', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                    color: isClosed ? (result >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--accent)',
                  }}>
                    {isClosed ? `${result >= 0 ? '+' : ''}${result.toFixed(2)}%` : 'OPEN'}
                  </span>
                </motion.div>
              );
            })}
            {signalHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <BarChart3 size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                <div>No trades recorded yet</div>
              </div>
            )}
          </div>
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
            </div>
          </div>
        </motion.div>
      </>
    );
  };

  // ===== DASHBOARD =====

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

        {/* Stat cards */}
        <motion.div className="dash-stat-card" variants={fadeUp} custom={1}>
          <BarChart3 size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Total Signals</span>
          <span className="dash-stat-card-value">
            <CountUp end={signalCount} duration={1} decimals={0} />
          </span>
          <span className="dash-stat-card-unit">signals</span>
        </motion.div>

        <motion.div className="dash-stat-card dash-stat-card-accent" variants={fadeUp} custom={2}>
          <Copy size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">My Positions</span>
          <span className="dash-stat-card-value accent">{Object.keys(userPositions).length}</span>
          <span className="dash-stat-card-unit">trades</span>
        </motion.div>

        <motion.div className="dash-stat-card" variants={fadeUp} custom={3}>
          <Coins size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Fee</span>
          <span className="dash-stat-card-value">{(feePercent / 100).toFixed(1)}%</span>
          <span className="dash-stat-card-unit">on profit</span>
        </motion.div>
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
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Platform Performance</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Today', data: performanceStats.platform.today },
              { label: '7 Days', data: performanceStats.platform.week },
              { label: '30 Days', data: performanceStats.platform.month },
              { label: 'All Time', data: performanceStats.platform.all },
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
                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginBottom: '4px' }}>
                  {data.trades}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>trades</div>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: data.winRate >= 50 ? 'var(--success)' : data.trades === 0 ? 'var(--text-secondary)' : 'var(--danger)',
                }}>
                  {data.trades > 0 ? `${data.winRate.toFixed(0)}% win` : '-'}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {data.wins}W / {data.losses}L
                </div>
              </div>
            ))}
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
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>My PnL</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Active Signal</h3>
              {activeSignal && <span className="pulse-dot" style={{ width: 8, height: 8 }} />}
            </div>

            {activeSignal ? (
              <div className="signal-card-active">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    background: activeSignal.long ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                    color: activeSignal.long ? 'var(--success)' : 'var(--danger)',
                    border: `1px solid ${activeSignal.long ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`
                  }}>
                    {activeSignal.long ? 'LONG' : 'SHORT'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    #{Number(activeSignal.id)} &middot; {timeAgo(activeSignal.timestamp)}
                  </span>
                </div>

                <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginBottom: '4px' }}>
                  XAU/USD
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  {formatLeverage(activeSignal.leverage)}x Leverage
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry</div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.9rem' }}>${formatGTradePrice(activeSignal.entryPrice)}</div>
                  </div>
                  <div style={{ background: 'rgba(52, 211, 153, 0.05)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--success)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TP</div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.9rem', color: 'var(--success)' }}>${formatGTradePrice(activeSignal.tp)}</div>
                  </div>
                  <div style={{ background: 'rgba(248, 113, 113, 0.05)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--danger)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SL</div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '0.9rem', color: 'var(--danger)' }}>${formatGTradePrice(activeSignal.sl)}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>{Number(activeSignal.copierCount)} copiers</span>
                  <span>&middot;</span>
                  <span>${parseFloat(ethers.formatUnits(activeSignal.totalCopied, USDC_DECIMALS)).toLocaleString()} USDC copied</span>
                </div>

                {userPositions[Number(activeSignal.id)] ? (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(212, 168, 67, 0.08)', border: '1px solid rgba(212, 168, 67, 0.2)', textAlign: 'center' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--accent)', marginBottom: '4px' }} />
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                      You copied this trade ({parseFloat(ethers.formatUnits(userPositions[Number(activeSignal.id)].collateral, USDC_DECIMALS)).toFixed(2)} USDC)
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-glow"
                    style={{ width: '100%' }}
                    onClick={() => setShowCopyModal(true)}
                    disabled={!account || isLoading}
                  >
                    <Copy size={16} /> Copy Trade
                  </button>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <Clock size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <div style={{ fontSize: '0.9rem' }}>No active signal</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Waiting for the next signal from the trader</div>
              </div>
            )}
          </div>
        </motion.div>

        {/* RIGHT: My Positions & History */}
        <motion.div className="dash-action-panel" variants={slideInRight} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-secondary)' }}>My Positions</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {signalHistory.filter(s => userPositions[Number(s.id)]).length > 0 ? (
                signalHistory.filter(s => userPositions[Number(s.id)]).map((signal) => {
                  const pos = userPositions[Number(signal.id)];
                  const isClosed = signal.closed;
                  const result = Number(signal.resultPct) / 100;

                  return (
                    <div key={Number(signal.id)} style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '10px',
                      padding: '14px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
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
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: isClosed ? (result >= 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)') : 'rgba(212, 168, 67, 0.1)',
                          color: isClosed ? (result >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--accent)',
                        }}>
                          {isClosed ? `${result >= 0 ? '+' : ''}${result.toFixed(2)}%` : 'OPEN'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>Inzet: {parseFloat(ethers.formatUnits(pos.collateral, USDC_DECIMALS)).toFixed(2)} USDC</span>
                        <span>{formatLeverage(signal.leverage)}x</span>
                      </div>

                      {isClosed && !pos.claimed && (
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', marginTop: '10px', padding: '8px', fontSize: '0.8rem' }}
                          onClick={() => handleClaimProceeds(Number(signal.id))}
                          disabled={isLoading}
                        >
                          <Zap size={14} /> Claim Profit
                        </button>
                      )}
                      {pos.claimed && (
                        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.7rem', color: 'var(--success)' }}>
                          <CheckCircle2 size={12} style={{ marginRight: '4px' }} /> Claimed
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)' }}>
                  <Copy size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '0.85rem' }}>No positions yet</div>
                  <div style={{ fontSize: '0.7rem', marginTop: '4px' }}>Copy a signal to get started</div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ===== BOTTOM: Protocol info + Signal History + Transactions ===== */}
      <div className="dash-bottom-grid">

        {/* Protocol bar */}
        <motion.div className="dash-protocol-bar" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          {[
            { label: 'Pair', value: 'XAU/USD', color: 'var(--accent-light)' },
            { label: 'Platform', value: 'gTrade', color: 'var(--text-primary)' },
            { label: 'Fee', value: `${(feePercent / 100).toFixed(0)}% on profit`, color: 'var(--text-primary)' },
            { label: 'Netwerk', value: 'Arbitrum', color: '#28A0F0' },
            { label: 'Collateral', value: 'USDC', color: 'var(--blue)' },
            { label: 'Signalen', value: `${signalCount}`, color: 'var(--accent-light)' },
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
            <span className="dash-tx-count">{signalHistory.length} signals</span>
          </div>

          <div className="dash-tx-list">
            {signalHistory.map((signal, index) => (
              <motion.div
                className="dash-tx-item"
                key={Number(signal.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <div className={`dash-tx-icon-wrap ${signal.long ? 'dash-tx-icon-deposit' : 'dash-tx-icon-withdraw'}`}>
                  {signal.long ? <TrendingUp size={16} /> : <ArrowDownRight size={16} />}
                </div>
                <div className="dash-tx-details">
                  <span className="dash-tx-type">
                    XAU/USD {signal.long ? 'LONG' : 'SHORT'} &middot; {formatLeverage(signal.leverage)}x
                  </span>
                  <span className="dash-tx-date">
                    Entry: ${formatGTradePrice(signal.entryPrice)} &middot; {timeAgo(signal.timestamp)}
                  </span>
                </div>
                <div className="dash-tx-amount-col">
                  {signal.closed ? (
                    <>
                      <span className={`dash-tx-amount ${Number(signal.resultPct) >= 0 ? 'green' : 'red'}`}>
                        {Number(signal.resultPct) >= 0 ? '+' : ''}{(Number(signal.resultPct) / 100).toFixed(2)}%
                      </span>
                      <span className="dash-tx-unit">gesloten</span>
                    </>
                  ) : (
                    <>
                      <span className="dash-tx-amount gold">OPEN</span>
                      <span className="dash-tx-unit">{Number(signal.copierCount)} copiers</span>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
            {signalHistory.length === 0 && (
              <div className="dash-tx-empty">
                <BarChart3 size={24} />
                <span>No signals yet</span>
              </div>
            )}
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
                        <input type="number" step="1" className="input-field" placeholder="Leverage (e.g. 50)" value={signalForm.leverage} onChange={(e) => setSignalForm(prev => ({ ...prev, leverage: e.target.value }))} />
                        <div className="input-suffix">{signalForm.leverage}x</div>
                      </div>
                      <button type="submit" className="btn btn-primary btn-glow" style={{ width: '100%' }} disabled={isLoading}>
                        <Zap size={16} /> {isLoading ? 'Loading...' : 'Post Signal'}
                      </button>
                    </form>
                  </div>

                  {/* Close Signal */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Close Signal</h3>
                    <form onSubmit={handleCloseSignal}>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" className="input-field" placeholder="Signal ID" value={closeSignalId} onChange={(e) => setCloseSignalId(e.target.value)} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '12px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Result % (e.g. 2.5 or -1.0)" value={closeResultPct} onChange={(e) => setCloseResultPct(e.target.value)} />
                        <div className="input-suffix">%</div>
                      </div>
                      <button type="submit" className="btn btn-outline" style={{ width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={isLoading}>
                        <X size={16} /> {isLoading ? 'Loading...' : 'Close Signal'}
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
                            alert(err.reason || err.message || "Failed to withdraw fees");
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

      {/* ===== BRIDGE MODAL ===== */}
      <AnimatePresence>
        {showBridgeModal && (
          <motion.div
            className="modal-overlay"
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
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Copy Trade</h3>
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
                  <div><span style={{ color: 'var(--text-secondary)' }}>Entry</span><br/>${formatGTradePrice(activeSignal.entryPrice)}</div>
                  <div><span style={{ color: 'var(--success)' }}>TP</span><br/>${formatGTradePrice(activeSignal.tp)}</div>
                  <div><span style={{ color: 'var(--danger)' }}>SL</span><br/>${formatGTradePrice(activeSignal.sl)}</div>
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

                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={12} />
                  Fee: {(feePercent / 100).toFixed(0)}% on profit. USDC goes directly from your wallet to gTrade.
                </div>

                <button type="submit" className="btn btn-primary btn-glow" style={{ width: '100%' }} disabled={isLoading || !account}>
                  <Copy size={16} /> {isLoading ? 'Loading...' : 'Confirm Copy Trade'}
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
        <div className="bg-hero-image" style={{ backgroundImage: "url('/Screenshot_1-12-1024x692.png')" }} />
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
            <img src="/logo.svg" alt="Smart GoldBot" className="brand-logo" />
            <span className="brand-text">Smart <span className="text-gold-gradient">GoldBot</span></span>
          </div>

          <div className="nav-links">
            <button className={`nav-link ${activeTab === 'invest' ? 'active' : ''}`} onClick={() => setActiveTab('invest')}>
              Copy Trading
            </button>
            <button className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              Dashboard
            </button>
            <button className={`nav-link ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
              <BarChart3 size={14} />
              Results
            </button>
          </div>

          <button className="connect-wallet-btn" onClick={connectWallet} disabled={isConnecting}>
            <Wallet size={16} />
            {account
              ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}`
              : (isConnecting ? "Connecting..." : "Connect Wallet")}
          </button>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          <AnimatePresence mode="wait">
            {activeTab === 'invest' ? (
              <motion.div key="invest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderInvest()}
              </motion.div>
            ) : activeTab === 'results' ? (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderResults()}
              </motion.div>
            ) : (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderDashboard()}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}

export default App;

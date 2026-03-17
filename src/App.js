/* global BigInt */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { ethers } from 'ethers';
import { Wallet, ArrowDownRight, ArrowUpRight, Coins, TrendingUp, ShieldCheck, Zap, BarChart3, History, CheckCircle2, Lock, BrainCircuit, Network, Cpu, Clock, ArrowRight, Shield, ExternalLink, ChevronDown, Sparkles, Eye, Copy, X, AlertTriangle, Settings } from 'lucide-react';
import CONTRACT_ABI from './contractABI.json';
import './index.css';

// ===== ARBITRUM CONFIG =====
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Deploy and fill in
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Native USDC on Arbitrum
const ARBITRUM_CHAIN_ID = "0xa4b1"; // 42161

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
  if (seconds < 60) return 'Zojuist';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m geleden`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}u geleden`;
  return `${Math.floor(seconds / 86400)}d geleden`;
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
  const [feePercent, setFeePercent] = useState(0);

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
      alert("Installeer MetaMask of een andere Web3 wallet!");
      return;
    }
    try {
      setIsConnecting(true);
      await switchToArbitrum();

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

      providerRef.current = provider;
      signerRef.current = signer;
      contractRef.current = contract;
      usdcRef.current = usdcContract;

      setAccount(address);
      await loadData(contract, usdcContract, address);
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
    window.ethereum.on('chainChanged', () => window.location.reload());
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
      alert(err.reason || err.message || "Signaal posten mislukt");
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
      alert(err.reason || err.message || "Signaal sluiten mislukt");
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
      alert(err.reason || err.message || "Copy trade mislukt");
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
      alert(err.reason || err.message || "Claim mislukt");
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
              <span className="hero-title-line">Gold Copy</span>
              <span className="hero-title-line">Trading.</span>
              <span className="hero-title-accent">
                <span className="text-gold-gradient">Kopieer & Verdien.</span>
                <Sparkles className="hero-sparkle" size={28} />
              </span>
            </motion.h1>

            <motion.p className="hero-subtitle" variants={fadeUp} custom={2}>
              Kopieer onze live gold trades direct vanuit je wallet.
              Geen storting nodig — je betaalt per trade via MetaMask. Powered by gTrade op Arbitrum.
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
                Hoe werkt het?
                <ChevronDown size={16} />
              </button>
            </motion.div>
          </motion.div>

          <motion.div className="hero-right" variants={slideInRight} initial="hidden" animate="visible">
            {/* Main stats card */}
            <div className="hero-card">
              <div className="hero-card-glow" />
              <div className="hero-card-inner">
                <div className="hero-card-header">
                  <div className="hero-card-header-left">
                    <span className="pulse-dot" />
                    <span className="hero-card-label">Copy Trading Stats</span>
                  </div>
                  <span className="hero-card-live">LIVE</span>
                </div>

                <div className="hero-card-tvl">
                  <span className="hero-card-tvl-label">Totaal Gekopieerd</span>
                  <span className="hero-card-tvl-amount">
                    $<CountUp end={signalCount} duration={2.5} separator="," decimals={0} suffix=" signals" />
                  </span>
                </div>

                <div className="hero-card-grid">
                  <div className="hero-card-stat">
                    <div className="hero-card-stat-icon">
                      <TrendingUp size={16} />
                    </div>
                    <span className="hero-card-stat-value gold">XAU/USD</span>
                    <span className="hero-card-stat-label">Pair</span>
                  </div>
                  <div className="hero-card-stat">
                    <div className="hero-card-stat-icon">
                      <ShieldCheck size={16} />
                    </div>
                    <span className="hero-card-stat-value">Arbitrum</span>
                    <span className="hero-card-stat-label">Netwerk</span>
                  </div>
                  <div className="hero-card-stat">
                    <div className="hero-card-stat-icon">
                      <Coins size={16} />
                    </div>
                    <span className="hero-card-stat-value">{(feePercent / 100).toFixed(0)}%</span>
                    <span className="hero-card-stat-label">Fee</span>
                  </div>
                </div>

                {/* Mini chart visualization */}
                <div className="hero-card-chart">
                  <div className="hero-card-chart-label">
                    <span>Recente signalen</span>
                    <span className="gold">{signalCount} totaal</span>
                  </div>
                  <div className="mini-chart">
                    {[35, 45, 40, 60, 55, 70, 85].map((h, i) => (
                      <motion.div
                        key={i}
                        className="mini-chart-bar"
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ duration: 0.8, delay: 0.8 + i * 0.1, ease: "easeOut" }}
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
          <span className="section-badge">Simpel & Snel</span>
          <h2 className="section-title">Hoe het werkt</h2>
          <p className="section-subtitle">Begin in minder dan 2 minuten. Vier simpele stappen.</p>
        </motion.div>

        <div className="timeline">
          {[
            { num: '01', icon: <Wallet size={22} />, title: 'Verbind Wallet', desc: 'Verbind MetaMask met Arbitrum. Je hebt USDC en een beetje ETH voor gas nodig.', color: 'var(--blue)' },
            { num: '02', icon: <Eye size={22} />, title: 'Bekijk Signalen', desc: 'Onze trader opent posities op XAU/USD. Je ziet live signalen met entry, TP en SL.', color: 'var(--emerald)' },
            { num: '03', icon: <Copy size={22} />, title: 'Kopieer Trade', desc: 'Klik op "Copy Trade", kies je bedrag in USDC. MetaMask opent, bevestig en je bent erin.', color: 'var(--accent)' },
            { num: '04', icon: <Zap size={22} />, title: 'Claim Winst', desc: 'Trade sluit automatisch op TP/SL. Claim je winst direct terug naar je wallet.', color: 'var(--violet)' },
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
          <span className="section-badge">Voordelen</span>
          <h2 className="section-title">Waarom Gold Copy Trading</h2>
          <p className="section-subtitle">Gebouwd voor maximale performance en veiligheid.</p>
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
              <p>Kopieer trades van ervaren gold traders. Elke trade wordt via gTrade on-chain uitgevoerd met echte leverage op XAU/USD.</p>
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
            <span className="bento-stat-desc">Dagelijks volume op de goudmarkt</span>
            <div className="bento-stat-bar">
              <motion.div className="bento-stat-bar-fill" initial={{ width: 0 }} whileInView={{ width: '78%' }} transition={{ duration: 1.2, delay: 0.5 }} viewport={{ once: true }} />
            </div>
          </motion.div>

          {/* Stat tile */}
          <motion.div className="bento-stat-tile bento-stat-dark" variants={fadeUp} custom={2} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Cpu size={20} className="bento-stat-icon" />
            <span className="bento-stat-number">24/5</span>
            <span className="bento-stat-desc">Volledig automatisch, geen emoties</span>
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
                <p>Trades worden via gTrade uitgevoerd op Arbitrum. Volledig transparant en verifieerbaar.</p>
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
            <h4>Geen Storting Nodig</h4>
            <p>Je betaalt per trade direct vanuit je eigen wallet. Geen lock-ups, geen deposit.</p>
            <span className="bento-inline-badge green">Direct vanuit wallet</span>
          </motion.div>

          <motion.div className="bento-inline" variants={fadeUp} custom={5} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-inline-icon" style={{ color: 'var(--violet)', borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)' }}>
              <Copy size={20} />
            </div>
            <h4>1-Click Copy</h4>
            <p>Zie een signaal, klik copy, bevestig in MetaMask. Zo simpel is het.</p>
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
            <span className="section-badge">Technologie</span>
            <h2 className="strat-showcase-title">
              Copy Trading op<br />
              <span className="text-gold-gradient">XAU/USD Goud</span>
            </h2>
            <p className="strat-showcase-desc">
              Onze trader opent posities op MT5 en spiegelt ze via gTrade on-chain.
              Jij kopieert met je eigen wallet en verdient mee aan elke winstgevende trade.
            </p>
            <div className="strat-indicators">
              {['gTrade', 'Arbitrum', 'USDC', 'Leverage', 'XAU/USD', 'On-Chain'].map(tag => (
                <span key={tag} className="strat-indicator-tag">{tag}</span>
              ))}
            </div>
            <button className="btn btn-glass" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
              Meer over copy trading <ArrowRight size={16} />
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
              { icon: <BarChart3 size={18} />, title: 'Live Signalen', desc: 'Zie trades zodra ze geopend worden.', value: 'Real-time', color: 'var(--cyan)' },
              { icon: <Copy size={18} />, title: '1-Click Copy', desc: 'Kopieer direct vanuit je wallet.', value: 'Instant', color: 'var(--accent)' },
              { icon: <Shield size={18} />, title: 'Auto TP/SL', desc: 'Take-profit en stop-loss ingebouwd.', value: 'Altijd', color: 'var(--emerald)' },
              { icon: <Coins size={18} />, title: 'Lage Fees', desc: `Slechts ${(feePercent / 100).toFixed(0)}% fee op winst.`, value: `${(feePercent / 100).toFixed(0)}%`, color: 'var(--violet)' },
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
        <span className="section-badge">Start Vandaag</span>
        <h2>Klaar om te <span className="text-gold-gradient">copy traden</span>?</h2>
        <p>Kopieer live gold trades direct vanuit je wallet op Arbitrum.</p>
        <div className="bottom-cta-buttons">
          <button className="btn btn-primary btn-lg btn-glow" onClick={() => setActiveTab('dashboard')}>
            <Zap size={18} />
            Start Nu
            <ArrowRight size={18} />
          </button>
          <a
            href="https://www.myfxbook.com/members/SmartGoldBot"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-glass btn-lg"
          >
            <BarChart3 size={16} />
            Bekijk Resultaten
            <ExternalLink size={14} />
          </a>
        </div>
      </motion.section>
    </>
  );

  // ===== DASHBOARD =====

  const renderDashboard = () => (
    <motion.div
      className="dash-v2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
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
            <span className="dash-total-sub">USDC beschikbaar in wallet</span>
          </div>
        </motion.div>

        {/* Stat cards */}
        <motion.div className="dash-stat-card" variants={fadeUp} custom={1}>
          <BarChart3 size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Totaal Signalen</span>
          <span className="dash-stat-card-value">
            <CountUp end={signalCount} duration={1} decimals={0} />
          </span>
          <span className="dash-stat-card-unit">signals</span>
        </motion.div>

        <motion.div className="dash-stat-card dash-stat-card-accent" variants={fadeUp} custom={2}>
          <Copy size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Mijn Posities</span>
          <span className="dash-stat-card-value accent">{Object.keys(userPositions).length}</span>
          <span className="dash-stat-card-unit">trades</span>
        </motion.div>

        <motion.div className="dash-stat-card" variants={fadeUp} custom={3}>
          <Coins size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Fee</span>
          <span className="dash-stat-card-value">{(feePercent / 100).toFixed(1)}%</span>
          <span className="dash-stat-card-unit">op winst</span>
        </motion.div>
      </motion.div>

      {/* ===== MIDDLE: Active Signal + Positions ===== */}
      <div className="dash-mid-grid">

        {/* LEFT: Active Signal */}
        <motion.div className="dash-claim-panel" variants={slideInLeft} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="dash-claim-info" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Actief Signaal</h3>
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
                  <span>${parseFloat(ethers.formatUnits(activeSignal.totalCopied, USDC_DECIMALS)).toLocaleString()} USDC gekopieerd</span>
                </div>

                {userPositions[Number(activeSignal.id)] ? (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(212, 168, 67, 0.08)', border: '1px solid rgba(212, 168, 67, 0.2)', textAlign: 'center' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--accent)', marginBottom: '4px' }} />
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                      Je hebt deze trade gekopieerd ({parseFloat(ethers.formatUnits(userPositions[Number(activeSignal.id)].collateral, USDC_DECIMALS)).toFixed(2)} USDC)
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
                <div style={{ fontSize: '0.9rem' }}>Geen actief signaal</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Wacht op het volgende signaal van de trader</div>
              </div>
            )}
          </div>
        </motion.div>

        {/* RIGHT: My Positions & History */}
        <motion.div className="dash-action-panel" variants={slideInRight} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-secondary)' }}>Mijn Posities</h3>

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
                          <Zap size={14} /> Claim Winst
                        </button>
                      )}
                      {pos.claimed && (
                        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.7rem', color: 'var(--success)' }}>
                          <CheckCircle2 size={12} style={{ marginRight: '4px' }} /> Geclaimed
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)' }}>
                  <Copy size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '0.85rem' }}>Nog geen posities</div>
                  <div style={{ fontSize: '0.7rem', marginTop: '4px' }}>Kopieer een signaal om te beginnen</div>
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
            { label: 'Fee', value: `${(feePercent / 100).toFixed(0)}% op winst`, color: 'var(--text-primary)' },
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
              <h3>Signaal Geschiedenis</h3>
            </div>
            <span className="dash-tx-count">{signalHistory.length} signalen</span>
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
                <span>Nog geen signalen</span>
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
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Post Signaal</h3>
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
                        <input type="number" step="0.01" className="input-field" placeholder="Entry Price (bijv. 2340.50)" value={signalForm.entryPrice} onChange={(e) => setSignalForm(prev => ({ ...prev, entryPrice: e.target.value }))} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Take Profit" value={signalForm.tp} onChange={(e) => setSignalForm(prev => ({ ...prev, tp: e.target.value }))} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Stop Loss" value={signalForm.sl} onChange={(e) => setSignalForm(prev => ({ ...prev, sl: e.target.value }))} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '12px' }}>
                        <input type="number" step="1" className="input-field" placeholder="Leverage (bijv. 50)" value={signalForm.leverage} onChange={(e) => setSignalForm(prev => ({ ...prev, leverage: e.target.value }))} />
                        <div className="input-suffix">{signalForm.leverage}x</div>
                      </div>
                      <button type="submit" className="btn btn-primary btn-glow" style={{ width: '100%' }} disabled={isLoading}>
                        <Zap size={16} /> {isLoading ? 'Bezig...' : 'Post Signaal'}
                      </button>
                    </form>
                  </div>

                  {/* Close Signal */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Sluit Signaal</h3>
                    <form onSubmit={handleCloseSignal}>
                      <div className="input-container" style={{ marginBottom: '8px' }}>
                        <input type="number" className="input-field" placeholder="Signal ID" value={closeSignalId} onChange={(e) => setCloseSignalId(e.target.value)} />
                      </div>
                      <div className="input-container" style={{ marginBottom: '12px' }}>
                        <input type="number" step="0.01" className="input-field" placeholder="Resultaat % (bijv. 2.5 of -1.0)" value={closeResultPct} onChange={(e) => setCloseResultPct(e.target.value)} />
                        <div className="input-suffix">%</div>
                      </div>
                      <button type="submit" className="btn btn-outline" style={{ width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={isLoading}>
                        <X size={16} /> {isLoading ? 'Bezig...' : 'Sluit Signaal'}
                      </button>
                    </form>

                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Fees Opnemen</h4>
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
                            alert(err.reason || err.message || "Fees opnemen mislukt");
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
                    <span>Bedrag</span>
                    <span>Beschikbaar: {walletUSDC.toFixed(2)} USDC</span>
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
                  Fee: {(feePercent / 100).toFixed(0)}% op winst. USDC gaat direct vanuit je wallet naar gTrade.
                </div>

                <button type="submit" className="btn btn-primary btn-glow" style={{ width: '100%' }} disabled={isLoading || !account}>
                  <Copy size={16} /> {isLoading ? 'Bezig...' : 'Bevestig Copy Trade'}
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
            <a href="https://www.myfxbook.com/members/SmartGoldBot" target="_blank" rel="noopener noreferrer" className="nav-link nav-link-external">
              <BarChart3 size={14} />
              Resultaten
            </a>
          </div>

          <button className="connect-wallet-btn" onClick={connectWallet} disabled={isConnecting}>
            <Wallet size={16} />
            {account
              ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}`
              : (isConnecting ? "Verbinden..." : "Connect Wallet")}
          </button>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          <AnimatePresence mode="wait">
            {activeTab === 'invest' ? (
              <motion.div key="invest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {renderInvest()}
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

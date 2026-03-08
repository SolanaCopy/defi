import React, { useState, useEffect, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { Wallet, ArrowDownRight, ArrowUpRight, Coins, TrendingUp, ShieldCheck, Zap, BarChart3, Activity, History, CheckCircle2, Lock, BrainCircuit, Network, Cpu, Clock, Timer, ArrowRight, Shield, ExternalLink, ChevronDown, Sparkles, Globe, Eye, Users } from 'lucide-react';
import './index.css';

const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

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

function App() {
  const [account, setAccount] = useState("");
  const [activeTab, setActiveTab] = useState("invest");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [particlesReady, setParticlesReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Simulated User State
  const [balance, setBalance] = useState(2500.00);
  const [yieldEarned, setYieldEarned] = useState(72.50);
  const [walletUSDT, setWalletUSDT] = useState(10000.00);
  const [totalYieldClaimed, setTotalYieldClaimed] = useState(840.20);

  // 24h Claim Timer
  const [lastDepositTime, setLastDepositTime] = useState(null);
  const [claimTimeLeft, setClaimTimeLeft] = useState(0);
  const canClaim = lastDepositTime !== null && claimTimeLeft <= 0 && yieldEarned > 0;

  // Simulated Global State
  const [activeUsers] = useState(2451);
  const [tvl] = useState(2850420.00);

  const [transactions, setTransactions] = useState([
    { id: '0x8f...2a', type: 'claim', amount: 45.00, date: 'Vandaag, 14:12' },
    { id: '0x1a...4b', type: 'deposit', amount: 1500.00, date: 'Gisteren, 10:42' },
    { id: '0x3c...2d', type: 'claim', amount: 80.50, date: '26 Feb, 15:30' },
    { id: '0x9f...8e', type: 'withdraw', amount: 500.00, date: '25 Feb, 09:15' },
    { id: '0x7a...1c', type: 'deposit', amount: 1500.00, date: '21 Feb, 18:20' },
  ]);

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

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        setIsConnecting(true);
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);
      } catch (error) {
        console.error("Connection error", error);
      } finally {
        setIsConnecting(false);
      }
    } else {
      alert("Please install MetaMask or a Web3 wallet browser extension!");
    }
  };

  const handleDeposit = (e) => {
    e.preventDefault();
    if (!depositAmount || isNaN(depositAmount) || Number(depositAmount) <= 0) return;
    setBalance(prev => prev + Number(depositAmount));
    setWalletUSDT(prev => prev - Number(depositAmount));
    setTransactions(prev => [
      { id: `0x${Math.floor(Math.random() * 16777215).toString(16)}...`, type: 'deposit', amount: Number(depositAmount), date: 'Nu net' },
      ...prev
    ]);
    setLastDepositTime(Date.now());
    setDepositAmount("");
    alert(`Succesvol gestort: ${depositAmount} USDT — de AI Gold Bot gaat nu voor je traden (Simulatie)`);
  };

  const handleWithdraw = (e) => {
    e.preventDefault();
    if (!withdrawAmount || isNaN(withdrawAmount) || Number(withdrawAmount) <= 0) return;
    if (Number(withdrawAmount) > balance) { alert("Onvoldoende balans"); return; }
    setBalance(prev => prev - Number(withdrawAmount));
    setWalletUSDT(prev => prev + Number(withdrawAmount));
    setTransactions(prev => [
      { id: `0x${Math.floor(Math.random() * 16777215).toString(16)}...`, type: 'withdraw', amount: Number(withdrawAmount), date: 'Nu net' },
      ...prev
    ]);
    setWithdrawAmount("");
    alert(`Succesvol opgenomen: ${withdrawAmount} USDT`);
  };

  const formatTimeLeft = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const claimProgress = lastDepositTime
    ? Math.min(100, ((24 * 60 * 60 * 1000 - claimTimeLeft) / (24 * 60 * 60 * 1000)) * 100)
    : 0;

  const submitClaim = () => {
    if (!canClaim) return;
    setWalletUSDT(prev => prev + yieldEarned);
    setTotalYieldClaimed(prev => prev + yieldEarned);
    setTransactions(prev => [
      { id: `0x${Math.floor(Math.random() * 16777215).toString(16)}...`, type: 'claim', amount: Number(yieldEarned), date: 'Nu net' },
      ...prev
    ]);
    alert(`Winst geclaimd: ${yieldEarned.toFixed(2)} USDT`);
    setYieldEarned(0);
    setLastDepositTime(null);
    setClaimTimeLeft(0);
  };

  // Yield accumulation
  useEffect(() => {
    const interval = setInterval(() => {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        setYieldEarned(prev => prev + (balance * 0.02 / 28800));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [balance]);

  // 24h claim countdown
  useEffect(() => {
    if (!lastDepositTime) return;
    const tick = () => {
      const elapsed = Date.now() - lastDepositTime;
      const remaining = Math.max(0, 24 * 60 * 60 * 1000 - elapsed);
      setClaimTimeLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lastDepositTime]);

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
              <span>Live op BSC Mainnet</span>
              <span className="hero-tag-badge">v2.0</span>
            </motion.div>

            <motion.h1 className="hero-title" variants={fadeUp} custom={1}>
              <span className="hero-title-line">AI-Powered</span>
              <span className="hero-title-line">Gold Trading.</span>
              <span className="hero-title-accent">
                <span className="text-gold-gradient">2% Per Werkdag.</span>
                <Sparkles className="hero-sparkle" size={28} />
              </span>
            </motion.h1>

            <motion.p className="hero-subtitle" variants={fadeUp} custom={2}>
              Stort USDT en onze AI tradeert automatisch op de goudmarkt (XAU/USD).
              Rendement is dagelijks claimbaar na 24 uur. Geen lock-ups, volledig transparant.
            </motion.p>

            {/* Trust indicators */}
            <motion.div className="hero-trust-row" variants={fadeUp} custom={3}>
              <div className="trust-item">
                <ShieldCheck size={14} />
                <span>Verified Contract</span>
              </div>
              <div className="trust-item">
                <Users size={14} />
                <span>{activeUsers.toLocaleString()}+ Users</span>
              </div>
            </motion.div>

            <motion.div className="hero-cta-row" variants={fadeUp} custom={4}>
              <button className="btn btn-primary btn-lg btn-glow" onClick={() => setActiveTab('dashboard')}>
                <Zap size={18} />
                Start Investeren
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
                    <span className="hero-card-label">Protocol Stats</span>
                  </div>
                  <span className="hero-card-live">LIVE</span>
                </div>

                <div className="hero-card-tvl">
                  <span className="hero-card-tvl-label">Total Value Locked</span>
                  <span className="hero-card-tvl-amount">
                    $<CountUp end={tvl} duration={2.5} separator="," decimals={0} />
                  </span>
                </div>

                <div className="hero-card-grid">
                  <div className="hero-card-stat">
                    <div className="hero-card-stat-icon">
                      <TrendingUp size={16} />
                    </div>
                    <span className="hero-card-stat-value gold">2%</span>
                    <span className="hero-card-stat-label">Dagelijks</span>
                  </div>
                  <div className="hero-card-stat">
                    <div className="hero-card-stat-icon">
                      <Users size={16} />
                    </div>
                    <span className="hero-card-stat-value">
                      <CountUp end={activeUsers} duration={2} separator="," />
                    </span>
                    <span className="hero-card-stat-label">Investeerders</span>
                  </div>
                  <div className="hero-card-stat">
                    <div className="hero-card-stat-icon">
                      <Clock size={16} />
                    </div>
                    <span className="hero-card-stat-value">24u</span>
                    <span className="hero-card-stat-label">Claim Cyclus</span>
                  </div>
                </div>

                {/* Mini chart visualization */}
                <div className="hero-card-chart">
                  <div className="hero-card-chart-label">
                    <span>Rendement afgelopen 7 dagen</span>
                    <span className="gold">+14%</span>
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
                <span className="marquee-label">TVL</span>
                <span className="marquee-value">${tvl.toLocaleString('en-US')}</span>
              </div>
              <div className="marquee-divider">•</div>
              <div className="marquee-item">
                <span className="marquee-dot gold" />
                <span className="marquee-label">Uitbetaald</span>
                <span className="marquee-value gold">+${totalYieldClaimed.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="marquee-divider">•</div>
              <div className="marquee-item">
                <span className="marquee-dot gold" />
                <span className="marquee-label">Dagelijks</span>
                <span className="marquee-value gold">2.0%</span>
              </div>
              <div className="marquee-divider">•</div>
              <div className="marquee-item">
                <span className="marquee-dot green" />
                <span className="marquee-label">Investeerders</span>
                <span className="marquee-value">{activeUsers.toLocaleString()}</span>
              </div>
              <div className="marquee-divider">•</div>
              <div className="marquee-item">
                <span className="marquee-dot green" />
                <span className="marquee-label">Status</span>
                <span className="marquee-value green">Operationeel</span>
              </div>
              <div className="marquee-divider">•</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== HOW IT WORKS — VERTICAL TIMELINE ===== */}
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
            { num: '01', icon: <Wallet size={22} />, title: 'Verbind Wallet', desc: 'Verbind MetaMask of Trust Wallet met het BSC netwerk. Binnen een paar klikken klaar.', color: 'var(--blue)' },
            { num: '02', icon: <ArrowDownRight size={22} />, title: 'Stort USDT', desc: 'Kies je gewenste inleg en stort USDT naar het smart contract. Geen minimale inleg vereist.', color: 'var(--emerald)' },
            { num: '03', icon: <BrainCircuit size={22} />, title: 'AI Tradeert', desc: 'De bot analyseert de goudmarkt en voert automatisch trades uit op XAU/USD. Volledig hands-off.', color: 'var(--accent)' },
            { num: '04', icon: <Zap size={22} />, title: 'Claim Winst', desc: 'Na 24 uur claim je je rendement direct naar je wallet. Herhaal elke dag voor compound growth.', color: 'var(--violet)' },
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

      {/* ===== FEATURES — BENTO GRID ===== */}
      <section className="section">
        <motion.div
          className="section-header"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="section-badge">Voordelen</span>
          <h2 className="section-title">Waarom Smart GoldBot</h2>
          <p className="section-subtitle">Gebouwd voor maximale performance en veiligheid.</p>
        </motion.div>

        <div className="bento-grid">
          {/* Large hero feature — spans 2 cols + 2 rows */}
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
              <h3>AI Gold Trading<br /><span className="text-gold-gradient">Engine</span></h3>
              <p>LSTM neural networks getraind op 10+ jaar gouddata. Scalping en swing trading gecombineerd voor consistente winsten.</p>
              <div className="bento-hero-bottom">
                <div className="bento-hero-stat">
                  <span className="bento-hero-stat-num">~520%</span>
                  <span className="bento-hero-stat-label">per jaar</span>
                </div>
                <div className="bento-hero-tags">
                  <span>Neural Network</span>
                  <span>10+ Jaar Data</span>
                  <span>24/5 Live</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Stat tile — XAU/USD */}
          <motion.div className="bento-stat-tile" variants={fadeUp} custom={1} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <TrendingUp size={20} className="bento-stat-icon" />
            <span className="bento-stat-number">$197B</span>
            <span className="bento-stat-desc">Dagelijks volume op de goudmarkt</span>
            <div className="bento-stat-bar">
              <motion.div className="bento-stat-bar-fill" initial={{ width: 0 }} whileInView={{ width: '78%' }} transition={{ duration: 1.2, delay: 0.5 }} viewport={{ once: true }} />
            </div>
          </motion.div>

          {/* Stat tile — Uptime */}
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

          {/* Wide row — Smart Contract info */}
          <motion.div className="bento-wide" variants={fadeUp} custom={3} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-wide-left">
              <ShieldCheck size={22} className="bento-wide-icon" />
              <div>
                <h4>Verified Smart Contract</h4>
                <p>Fondsen beheerd op BSC. Geen tussenpartij, volledig transparant en auditbaar.</p>
              </div>
            </div>
            <div className="bento-wide-stats">
              <div className="bento-wide-stat">
                <span className="bento-wide-stat-val">100%</span>
                <span className="bento-wide-stat-label">On-chain</span>
              </div>
              <div className="bento-wide-stat-divider" />
              <div className="bento-wide-stat">
                <span className="bento-wide-stat-val green">{'<'}$0.10</span>
                <span className="bento-wide-stat-label">Gas fee</span>
              </div>
              <div className="bento-wide-stat-divider" />
              <div className="bento-wide-stat">
                <span className="bento-wide-stat-val gold">BSC</span>
                <span className="bento-wide-stat-label">Network</span>
              </div>
            </div>
          </motion.div>

          {/* Two small inline cards */}
          <motion.div className="bento-inline" variants={fadeUp} custom={4} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-inline-icon" style={{ color: 'var(--emerald)', borderColor: 'rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.06)' }}>
              <Lock size={20} />
            </div>
            <h4>Altijd Opneembaar</h4>
            <p>Neem je inleg op elk moment op. Geen lock-ups of verborgen voorwaarden.</p>
            <span className="bento-inline-badge green">Geen lock-up</span>
          </motion.div>

          <motion.div className="bento-inline" variants={fadeUp} custom={5} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <div className="bento-inline-icon" style={{ color: 'var(--violet)', borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)' }}>
              <Clock size={20} />
            </div>
            <h4>24u Claim Cyclus</h4>
            <p>Na elke storting start een timer. Na 24 uur claim je direct naar je wallet.</p>
            <span className="bento-inline-badge purple">Dagelijks claimbaar</span>
          </motion.div>
        </div>
      </section>

      {/* ===== CALCULATOR ===== */}
      <section className="section">
        <motion.div
          className="section-header"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="section-badge">Rekentool</span>
          <h2 className="section-title">Rendement Calculator</h2>
          <p className="section-subtitle">Bereken je potentiële winst op basis van je investering.</p>
        </motion.div>

        <motion.div
          className="calc-card"
          variants={scaleIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="calc-card-glow" />
          <div className="calc-inner">
            <div className="calc-left">
              <label className="calc-label">Investering (USDT)</label>
              <div className="calc-input-wrap">
                <span className="calc-input-prefix">$</span>
                <input type="number" className="calc-input" value={calcAmount} onChange={(e) => setCalcAmount(Math.max(0, Number(e.target.value)))} />
              </div>
              <div className="calc-presets">
                {[500, 1000, 5000, 10000, 25000].map(val => (
                  <button key={val} className={`calc-preset ${calcAmount === val ? 'active' : ''}`} onClick={() => setCalcAmount(val)}>
                    ${val.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="calc-rate-info">
                <Eye size={14} />
                <span>Rendement: 2% per werkdag (ma-vr)</span>
              </div>
            </div>
            <div className="calc-right">
              <div className="calc-result-row">
                <span className="calc-result-period">Per dag</span>
                <span className="calc-result-amount">
                  $<CountUp end={calcAmount * 0.02} duration={0.5} decimals={2} key={`d-${calcAmount}`} />
                </span>
              </div>
              <div className="calc-result-row">
                <span className="calc-result-period">Per week</span>
                <span className="calc-result-amount">
                  $<CountUp end={calcAmount * 0.02 * 5} duration={0.5} decimals={2} key={`w-${calcAmount}`} />
                </span>
              </div>
              <div className="calc-result-row highlight">
                <span className="calc-result-period">Per maand</span>
                <span className="calc-result-amount gold">
                  $<CountUp end={calcAmount * 0.02 * 22} duration={0.5} decimals={2} key={`m-${calcAmount}`} />
                </span>
              </div>
              <div className="calc-result-row total">
                <span className="calc-result-period">Per jaar</span>
                <span className="calc-result-amount gold big">
                  $<CountUp end={calcAmount * 0.02 * 260} duration={0.8} decimals={2} separator="," key={`y-${calcAmount}`} />
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===== STRATEGY — SIDE BY SIDE SHOWCASE ===== */}
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
              Scalping & Swing op<br />
              <span className="text-gold-gradient">XAU/USD Goud</span>
            </h2>
            <p className="strat-showcase-desc">
              De bot combineert korte scalping trades (1-15 min) met swing trading op grotere trends.
              Een LSTM neural network berekent realtime entry- en exitpunten.
            </p>
            <div className="strat-indicators">
              {['RSI', 'MACD', 'Bollinger Bands', 'Fibonacci', 'LSTM AI', 'Volume'].map(tag => (
                <span key={tag} className="strat-indicator-tag">{tag}</span>
              ))}
            </div>
            <button className="btn btn-glass" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
              Meer over de strategie <ArrowRight size={16} />
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
              { icon: <BarChart3 size={18} />, title: 'Realtime Data', desc: 'Live XAU/USD prijsdata elke seconde.', value: '<1s', color: 'var(--cyan)' },
              { icon: <BrainCircuit size={18} />, title: 'Machine Learning', desc: 'LSTM op 10+ jaar gouddata.', value: '10yr+', color: 'var(--accent)' },
              { icon: <Shield size={18} />, title: 'Risicobeheer', desc: 'Auto stop-loss & take-profit.', value: '2% max', color: 'var(--emerald)' },
              { icon: <Network size={18} />, title: 'Infrastructuur', desc: 'Dedicated servers met failover.', value: '<50ms', color: 'var(--violet)' },
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
        <h2>Klaar om te <span className="text-gold-gradient">verdienen</span>?</h2>
        <p>Sluit je aan bij <strong>{activeUsers.toLocaleString()}+</strong> investeerders die al profiteren van AI gold trading.</p>
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

  // Dashboard tab state
  const [dashTab, setDashTab] = useState('deposit'); // 'deposit' or 'withdraw'

  // Portfolio allocation percentage
  const allocPct = balance + walletUSDT > 0 ? (balance / (balance + walletUSDT)) * 100 : 0;

  // SVG ring for claim timer
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (claimProgress / 100) * ringCircumference;

  const renderDashboard = () => (
    <motion.div
      className="dash-v2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* ===== TOP BENTO: Portfolio Overview ===== */}
      <motion.div className="dash-bento-top" variants={staggerContainer} initial="hidden" animate="visible">

        {/* Big total value card */}
        <motion.div className="dash-total-card" variants={fadeUp} custom={0}>
          <div className="dash-total-card-glow" />
          <div className="dash-total-card-inner">
            <div className="dash-total-header">
              <span className="pulse-dot" />
              <span className="dash-total-tag">Portfolio Actief</span>
            </div>
            <div className="dash-total-amount">
              $<CountUp end={balance + yieldEarned + walletUSDT} duration={1.5} decimals={2} separator="," />
            </div>
            <span className="dash-total-sub">Totale waarde in USDT</span>

            {/* Mini allocation bar */}
            <div className="dash-alloc-bar">
              <motion.div
                className="dash-alloc-fill"
                initial={{ width: 0 }}
                animate={{ width: `${allocPct}%` }}
                transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
              />
            </div>
            <div className="dash-alloc-legend">
              <span><span className="dash-alloc-dot gold" /> Belegd {allocPct.toFixed(0)}%</span>
              <span><span className="dash-alloc-dot gray" /> Wallet {(100 - allocPct).toFixed(0)}%</span>
            </div>
          </div>
        </motion.div>

        {/* Stat cards row */}
        <motion.div className="dash-stat-card" variants={fadeUp} custom={1}>
          <Coins size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Belegd</span>
          <span className="dash-stat-card-value">
            <CountUp end={balance} duration={1} decimals={2} separator="," />
          </span>
          <span className="dash-stat-card-unit">USDT</span>
        </motion.div>

        <motion.div className="dash-stat-card dash-stat-card-accent" variants={fadeUp} custom={2}>
          <TrendingUp size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Beschikbare Rente</span>
          <span className="dash-stat-card-value accent">+{yieldEarned.toFixed(4)}</span>
          <span className="dash-stat-card-unit">USDT</span>
        </motion.div>

        <motion.div className="dash-stat-card" variants={fadeUp} custom={3}>
          <Wallet size={18} className="dash-stat-card-icon" />
          <span className="dash-stat-card-label">Wallet Balans</span>
          <span className="dash-stat-card-value">
            <CountUp end={walletUSDT} duration={1} decimals={2} separator="," />
          </span>
          <span className="dash-stat-card-unit">USDT</span>
        </motion.div>
      </motion.div>

      {/* ===== MIDDLE: Claim + Actions side by side ===== */}
      <div className="dash-mid-grid">

        {/* LEFT: Claim with radial timer */}
        <motion.div className="dash-claim-panel" variants={slideInLeft} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="dash-claim-ring-area">
            <svg className="dash-claim-svg" viewBox="0 0 120 120">
              {/* bg ring */}
              <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
              {/* progress ring */}
              <circle
                cx="60" cy="60" r={ringRadius} fill="none"
                stroke="url(#goldGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
              <defs>
                <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--accent-light)" />
                  <stop offset="100%" stopColor="var(--accent-dark)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="dash-claim-ring-center">
              {lastDepositTime === null ? (
                <>
                  <Clock size={22} color="var(--text-secondary)" />
                  <span className="dash-ring-label">Geen timer</span>
                </>
              ) : claimTimeLeft > 0 ? (
                <>
                  <span className="dash-ring-time">{formatTimeLeft(claimTimeLeft)}</span>
                  <span className="dash-ring-label">{claimProgress.toFixed(0)}%</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={24} color="var(--success)" />
                  <span className="dash-ring-label green">Klaar!</span>
                </>
              )}
            </div>
          </div>

          <div className="dash-claim-info">
            <span className="dash-claim-amount">+{yieldEarned.toFixed(4)} <span>USDT</span></span>
            <span className="dash-claim-sub">Beschikbare rente uit AI Gold Trading</span>

            <button
              className={`btn ${canClaim ? 'btn-primary btn-glow' : 'btn-outline'} dash-claim-btn`}
              onClick={submitClaim}
              disabled={!canClaim}
            >
              {claimTimeLeft > 0 && lastDepositTime !== null ? (
                <><Lock size={16} /> Wacht op timer...</>
              ) : (
                <><Zap size={16} /> Claim Rente</>
              )}
            </button>

            <span className="dash-claim-note">
              <Lock size={10} /> 24 uur interval na storting
            </span>
          </div>
        </motion.div>

        {/* RIGHT: Deposit / Withdraw with tabs */}
        <motion.div className="dash-action-panel" variants={slideInRight} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="dash-action-tabs">
            <button className={`dash-action-tab ${dashTab === 'deposit' ? 'active' : ''}`} onClick={() => setDashTab('deposit')}>
              <ArrowDownRight size={15} /> Storten
            </button>
            <button className={`dash-action-tab ${dashTab === 'withdraw' ? 'active' : ''}`} onClick={() => setDashTab('withdraw')}>
              <ArrowUpRight size={15} /> Opnemen
            </button>
          </div>

          <AnimatePresence mode="wait">
            {dashTab === 'deposit' ? (
              <motion.div key="dep" className="dash-action-body" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                <div className="dash-action-balance">
                  <Wallet size={14} />
                  <span>Beschikbaar:</span>
                  <span className="mono">{walletUSDT.toLocaleString('nl-NL', { minimumFractionDigits: 2 })} USDT</span>
                </div>
                <form onSubmit={handleDeposit}>
                  <div className="input-container">
                    <Coins className="input-icon" size={18} />
                    <input type="number" step="0.01" className="input-field" placeholder="0.00" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                    <button type="button" className="input-max-btn" onClick={() => setDepositAmount(walletUSDT)}>MAX</button>
                    <div className="input-suffix">USDT</div>
                  </div>
                  <div className="dash-action-quick">
                    {[25, 50, 75, 100].map(pct => (
                      <button key={pct} type="button" className="dash-quick-btn" onClick={() => setDepositAmount((walletUSDT * pct / 100).toFixed(2))}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary btn-glow dash-submit-btn">
                    <ArrowDownRight size={16} /> Stort USDT
                  </button>
                </form>
                <div className="dash-action-info-row">
                  <span>Dagelijks rendement</span><span className="gold">2%</span>
                </div>
                <div className="dash-action-info-row">
                  <span>Claim na</span><span>24 uur</span>
                </div>
              </motion.div>
            ) : (
              <motion.div key="wth" className="dash-action-body" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                <div className="dash-action-balance">
                  <Coins size={14} />
                  <span>Belegd:</span>
                  <span className="mono">{balance.toLocaleString('nl-NL', { minimumFractionDigits: 2 })} USDT</span>
                </div>
                <form onSubmit={handleWithdraw}>
                  <div className="input-container">
                    <Lock className="input-icon" size={18} color="var(--text-secondary)" />
                    <input type="number" step="0.01" className="input-field" placeholder="0.00" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
                    <button type="button" className="input-max-btn" onClick={() => setWithdrawAmount(balance)}>MAX</button>
                    <div className="input-suffix">USDT</div>
                  </div>
                  <div className="dash-action-quick">
                    {[25, 50, 75, 100].map(pct => (
                      <button key={pct} type="button" className="dash-quick-btn" onClick={() => setWithdrawAmount((balance * pct / 100).toFixed(2))}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-outline dash-submit-btn">
                    <ArrowUpRight size={16} /> Opnemen
                  </button>
                </form>
                <div className="dash-action-info-row">
                  <span>Opname fee</span><span className="green">0%</span>
                </div>
                <div className="dash-action-info-row">
                  <span>Minimaal</span><span>Geen limiet</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ===== BOTTOM: Protocol + Transaction Timeline ===== */}
      <div className="dash-bottom-grid">

        {/* Protocol info — horizontal */}
        <motion.div className="dash-protocol-bar" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          {[
            { label: 'Rendement', value: '2%', color: 'var(--accent-light)' },
            { label: 'Actief', value: 'Ma-Vr', color: 'var(--text-primary)' },
            { label: 'Claim', value: '24 uur', color: 'var(--text-primary)' },
            { label: 'Netwerk', value: 'BSC', color: '#F0B90B' },
            { label: 'Opnemen', value: 'Altijd', color: 'var(--success)' },
            { label: 'Totaal geclaimd', value: `$${totalYieldClaimed.toFixed(2)}`, color: 'var(--accent-light)' },
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

        {/* Transaction timeline */}
        <motion.div className="dash-tx-panel" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <div className="dash-tx-header">
            <div className="dash-tx-header-left">
              <History size={16} />
              <h3>Activiteit</h3>
            </div>
            <span className="dash-tx-count">{transactions.length} transacties</span>
          </div>

          <div className="dash-tx-list">
            {transactions.map((tx, index) => (
              <motion.div
                className="dash-tx-item"
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <div className={`dash-tx-icon-wrap dash-tx-icon-${tx.type}`}>
                  {tx.type === 'deposit' ? <ArrowDownRight size={16} /> :
                   tx.type === 'withdraw' ? <ArrowUpRight size={16} /> :
                   <Zap size={16} />}
                </div>
                <div className="dash-tx-details">
                  <span className="dash-tx-type">
                    {tx.type === 'deposit' ? 'Storting' : tx.type === 'withdraw' ? 'Opname' : 'Rente Claim'}
                  </span>
                  <span className="dash-tx-date">{tx.date}</span>
                </div>
                <div className="dash-tx-amount-col">
                  <span className={`dash-tx-amount ${tx.type === 'withdraw' ? 'red' : tx.type === 'claim' ? 'gold' : 'green'}`}>
                    {tx.type === 'withdraw' ? '-' : '+'}{tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="dash-tx-unit">USDT</span>
                </div>
                <CheckCircle2 size={14} className="dash-tx-check" />
              </motion.div>
            ))}
            {transactions.length === 0 && (
              <div className="dash-tx-empty">
                <History size={24} />
                <span>Geen transacties gevonden</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
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
              Investeren
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

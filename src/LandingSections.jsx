// Static marketing sections lifted out of App.jsx.
//
// App.jsx re-renders on every price poll (10s) and public-data refresh (30s).
// These sections depend on no state at all, so wrapping them in React.memo
// with no props means they render exactly once instead of on every tick.
import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, Eye, Copy, TrendingUp, ShieldCheck, Zap, BrainCircuit, Cpu, Play } from 'lucide-react';
import { fadeUp, slideInLeft, slideInRight } from './animations';

export const HowItWorksSection = React.memo(function HowItWorksSection() {
  return (
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
        preload="none"
        poster="/howitworks-poster.webp"
        aria-label="Tutorial: how to copy trade on Smart Trading Club"
        // height:auto is required — a height attribute becomes a presentational
        // hint that outranks aspect-ratio and letterboxes the poster.
        style={{ width: '100%', height: 'auto', aspectRatio: '16 / 9', display: 'block', background: '#000' }}
      >
        <source src="/HowItWorks-720.mp4" type="video/mp4" />
      </video>
      <div style={{ padding: '12px 16px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Play size={16} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Watch: How to copy trade in 2 minutes</span>
      </div>
    </motion.div>
  </section>
  );
});

export const FeaturesSection = React.memo(function FeaturesSection() {
  return (
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
        <div className="bento-inline-icon" style={{ color: 'var(--emerald)', borderColor: 'rgba(62,158,110,0.2)', background: 'rgba(62,158,110,0.06)' }}>
          <Wallet size={20} />
        </div>
        <h4>Pay Per Trade</h4>
        <p>No upfront deposit needed. You only pay when you copy a trade — directly from your wallet via MetaMask.</p>
        <span className="bento-inline-badge green">Directly from wallet</span>
      </motion.div>

      <motion.div className="bento-inline" variants={fadeUp} custom={5} initial="hidden" whileInView="visible" viewport={{ once: true }}>
        <div className="bento-inline-icon" style={{ color: 'var(--violet)', borderColor: 'rgba(122,133,139,0.2)', background: 'rgba(122,133,139,0.06)' }}>
          <Copy size={20} />
        </div>
        <h4>1-Click Copy</h4>
        <p>When a signal goes live, just click "Copy Now", choose your amount, and confirm in MetaMask. Done.</p>
        <span className="bento-inline-badge purple">Instant copy</span>
      </motion.div>
    </div>
  </section>
  );
});

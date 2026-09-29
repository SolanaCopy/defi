import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { ArrowRight, ArrowUpRight, Wallet, Check } from 'lucide-react';
import CountUp from 'react-countup';
import { fetchGoldBars } from './goldPrice';
import './landing.css';

// gTrade stores prices with 10 decimals and leverage with 3.
const PRICE_SCALE = 1e10;
const LEV_SCALE = 1000;
// A signal still collecting after this long was abandoned, not live. The
// contract lets anyone cancel it then; the landing page should not call it live.
const COLLECTING_TIMEOUT_S = 24 * 3600;

const usd = (v, d = 2) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usdc = (big) => parseFloat(ethers.formatUnits(big || 0n, 6));
const shortDate = (ts) =>
  new Date(Number(ts) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// gTrade 15m candles; the last one follows the live price between polls.
function useGoldBars(livePrice) {
  const [raw, setRaw] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchGoldBars().then((b) => alive && b.length && setRaw(b)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return useMemo(() => {
    if (!raw.length || !livePrice) return raw;
    const bars = raw.slice();
    const tail = { ...bars[bars.length - 1] };
    tail.c = livePrice;
    tail.h = Math.max(tail.h, livePrice);
    tail.l = Math.min(tail.l, livePrice);
    bars[bars.length - 1] = tail;
    return bars;
  }, [raw, livePrice]);
}

// Candle chart with crosshair. Pure SVG, sized to its container.
function GoldChart({ bars, levels, height = 360 }) {
  const wrap = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);
  const PAD_R = 70;
  const PAD_Y = 16;

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // One wrapper for both states so the observer measures the real width.
  if (!bars.length) {
    return <div ref={wrap} className="gl-chart"><div className="gl-chart-empty" style={{ height }}>Loading market data…</div></div>;
  }

  const prices = bars.flatMap((b) => [b.h, b.l]).concat(levels.map((l) => l.price));
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const plotW = w - PAD_R;
  const y = (p) => PAD_Y + (1 - (p - lo) / (hi - lo)) * (height - PAD_Y * 2);
  const step = plotW / bars.length;
  const bw = Math.max(1, step * 0.6);
  const last = bars[bars.length - 1];
  const up = last.c >= bars[0].o;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 5);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left) / step);
    setHover(i >= 0 && i < bars.length ? i : null);
  };
  const hb = hover != null ? bars[hover] : null;

  return (
    <div ref={wrap} className="gl-chart">
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="XAU/USD 15-minute chart">
        {ticks.map((p) => (
          <g key={p}>
            <line x1="0" x2={plotW} y1={y(p)} y2={y(p)} className="gl-grid" />
            <text x={w - 8} y={y(p) + 4} textAnchor="end" className="gl-axis">{usd(p, 0)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = i * step + step / 2;
          const top = y(Math.max(b.o, b.c));
          const h = Math.max(1, Math.abs(y(b.o) - y(b.c)));
          return (
            <g key={b.t} className={b.c >= b.o ? 'gl-up' : 'gl-dn'}>
              <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} />
              <rect x={x - bw / 2} y={top} width={bw} height={h} rx="1" />
            </g>
          );
        })}
        {levels.map((l) => (
          <g key={l.label}>
            <line x1="0" x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeDasharray="5 5" />
            <text x={plotW + 8} y={y(l.price) + 4} className="gl-axis" style={{ fill: l.color }}>{l.label}</text>
          </g>
        ))}
        <line x1="0" x2={plotW} y1={y(last.c)} y2={y(last.c)} className={up ? 'gl-last gl-last-up' : 'gl-last gl-last-dn'} />
        <rect x={plotW + 2} y={y(last.c) - 11} width={PAD_R - 4} height="22" rx="4" className={up ? 'gl-tag-up' : 'gl-tag-dn'} />
        <text x={plotW + 8} y={y(last.c) + 4} className="gl-axis-tag">{usd(last.c)}</text>
        {hb && (
          <g className="gl-cross">
            <line x1={hover * step + step / 2} x2={hover * step + step / 2} y1="0" y2={height} />
            <line x1="0" x2={plotW} y1={y(hb.c)} y2={y(hb.c)} />
          </g>
        )}
      </svg>
      <div className="gl-ohlc">
        {hb ? (
          <>
            <span>{new Date(hb.t).toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC</span>
            <span>O <b>{usd(hb.o)}</b></span><span>H <b>{usd(hb.h)}</b></span>
            <span>L <b>{usd(hb.l)}</b></span><span>C <b>{usd(hb.c)}</b></span>
          </>
        ) : (
          <span>15-minute candles, last 24 hours</span>
        )}
      </div>
    </div>
  );
}

export default function GoldLanding({
  activeSignal, livePrice, marketStatus, signalHistory, uniqueCopiers,
  feePercent, depositLimits, canSeeLevels, contractAddress, onNavigate,
}) {
  const bars = useGoldBars(livePrice);

  // Pointer parallax on the hero bars. Written to CSS variables so React does
  // not re-render on every mouse move.
  const heroRef = useRef(null);
  const onHeroMove = (e) => {
    const el = heroRef.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const onHeroLeave = () => {
    heroRef.current?.style.setProperty('--px', 0);
    heroRef.current?.style.setProperty('--py', 0);
  };

  const stats = useMemo(() => {
    const closed = signalHistory
      .filter((s) => s.closed && s.originalDeposited > 0n)
      .sort((a, b) => b.id - a.id);
    // Refunded signals never reached gTrade; they are listed but not counted.
    const settled = closed.filter((s) => !s.refunded);
    const volume = settled.reduce((sum, s) => sum + usdc(s.originalDeposited), 0);
    const entries = settled.reduce((sum, s) => sum + Number(s.copierCount), 0);
    const won = settled.filter((s) => s.tradePct > 0).length;
    return { closed, settled, volume, entries, won, lost: settled.length - won, refunded: closed.length - settled.length };
  }, [signalHistory]);

  const now = Date.now() / 1000;
  const live =
    activeSignal &&
    (activeSignal.phase === 2 ||
      (activeSignal.phase === 1 && now - Number(activeSignal.timestamp) < COLLECTING_TIMEOUT_S))
      ? activeSignal
      : null;

  const levels = live && canSeeLevels
    ? [
        { label: 'TP', price: Number(live.tp) / PRICE_SCALE, color: '#4FD69C' },
        { label: 'Entry', price: Number(live.entryPrice) / PRICE_SCALE, color: '#A39A8C' },
        { label: 'SL', price: Number(live.sl) / PRICE_SCALE, color: '#F07167' },
      ]
    : [];

  const dayOpen = bars.length ? bars[0].o : null;
  const change = livePrice && dayOpen ? ((livePrice - dayOpen) / dayOpen) * 100 : null;
  const fee = (feePercent / 100).toFixed(0);
  const arbiscan = `https://arbiscan.io/address/${contractAddress}`;

  return (
    <div className="gl">
      {/* ===== HERO ===== */}
      <section className="gl-hero" onPointerMove={onHeroMove} onPointerLeave={onHeroLeave} ref={heroRef}>
        <div className="gl-stage" aria-hidden="true">
          <div className="gl-stage-float">
            <img src="/gold-hero.webp" alt="" width="1920" height="1200" />
            <span className="gl-sheen" />
          </div>
        </div>
        <div className="gl-hero-copy">
          <h1 className="gl-h1"><span>Gold, traded</span><span>in the open.</span></h1>
          <p className="gl-lede">
            Copy our gold trades from your own wallet. Every position is opened and
            settled by smart contract on Arbitrum, so every result — good or bad — is on the record.
          </p>
          <div className="gl-ctas">
            <button className="gl-btn" onClick={() => onNavigate('dashboard')}>Start copying <ArrowRight size={17} /></button>
            <button className="gl-textlink" onClick={() => onNavigate('results')}>See every trade</button>
          </div>
        </div>
        <dl className="gl-figures">
          <div><dd>{livePrice ? `$${usd(livePrice)}` : '—'}</dd><dt>Gold spot, live{change != null && <em className={change >= 0 ? 'gl-pos' : 'gl-neg'}> {change >= 0 ? '+' : ''}{change.toFixed(2)}%</em>}</dt></div>
          <div><dd>{stats.settled.length ? <CountUp end={stats.settled.length} duration={1.4} /> : '—'}</dd><dt>Trades executed on-chain</dt></div>
          <div><dd>{stats.volume ? <CountUp end={stats.volume / 1000} decimals={1} prefix="$" suffix="K" duration={1.4} /> : '—'}</dd><dt>Copied by members</dt></div>
          <div><dd>{stats.entries ? <CountUp end={stats.entries} duration={1.4} /> : '—'}</dd><dt>Copy entries</dt></div>
        </dl>
      </section>

      {/* ===== PRODUCT ===== */}
      <section className="gl-section">
        <div className="gl-head gl-head-center">
          <h2>One screen. One market.</h2>
          <p>XAU/USD at the exact price gTrade executes, with the desk's entry, target and stop drawn on top while a trade is live.</p>
        </div>
        <div className="gl-app">
          <div className="gl-app-bar">
            <div className="gl-app-pair">
              <span className="gl-coin" aria-hidden="true" />
              <div><b>XAU/USD</b><small>Gold · gTrade · Arbitrum</small></div>
            </div>
            <div className="gl-app-price">
              <b>{livePrice ? `$${usd(livePrice)}` : '—'}</b>
              {change != null && <span className={change >= 0 ? 'gl-pos' : 'gl-neg'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% 24h</span>}
            </div>
            <span className={marketStatus.open ? 'gl-status gl-status-on' : 'gl-status'}>
              {marketStatus.open ? 'Market open' : 'Market closed'}
            </span>
          </div>
          <GoldChart bars={bars} levels={levels} />
          <div className="gl-app-foot">
            {live ? (
              <>
                <span className={live.long ? 'gl-pill gl-pill-long' : 'gl-pill gl-pill-short'}>{live.long ? 'Long' : 'Short'} {(Number(live.leverage) / LEV_SCALE).toFixed(0)}x</span>
                <span>Signal #{live.id} · {live.phase === 1 ? 'open for copiers' : 'position open'}</span>
                <button className="gl-btn gl-btn-sm" onClick={() => onNavigate('dashboard')}>Copy this trade <ArrowRight size={15} /></button>
              </>
            ) : (
              <>
                <span className="gl-pill">No open position</span>
                <span>The next signal is posted on the dashboard and in Telegram.</span>
                <a className="gl-btn gl-btn-sm gl-btn-ghost" href="https://t.me/SmartTradingClubDapp" target="_blank" rel="noopener noreferrer">Get alerts <ArrowUpRight size={15} /></a>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ===== RECORD ===== */}
      <section className="gl-section gl-record">
        <div className="gl-record-side">
          <h2>The record, unedited.</h2>
          <p>Read straight from the contract, after gTrade fees and before our {fee}% performance fee.{stats.refunded ? ` ${stats.refunded} signals never opened and were refunded in full; they are not counted.` : ''}</p>
          <dl className="gl-tally">
            <div><dd>{stats.settled.length || '—'}</dd><dt>trades</dt></div>
            <div><dd className="gl-pos">{stats.settled.length ? stats.won : '—'}</dd><dt>closed in profit</dt></div>
            <div><dd className="gl-neg">{stats.settled.length ? stats.lost : '—'}</dd><dt>closed at a loss</dt></div>
          </dl>
          <div className="gl-record-foot">
            <button className="gl-textlink" onClick={() => onNavigate('results')}>Full track record</button>
            <a className="gl-textlink" href={arbiscan} target="_blank" rel="noopener noreferrer">Verify on Arbiscan</a>
          </div>
        </div>
        <div className="gl-trades">
          {stats.settled.slice(0, 8).map((s) => (
            <div className={s.refunded ? 'gl-trade gl-trade-refund' : 'gl-trade'} key={s.id}>
              <span className="gl-trade-id">#{s.id}</span>
              <span className="gl-trade-date">{shortDate(s.closedAt || s.timestamp)}</span>
              <span className={s.long ? 'gl-pill gl-pill-long' : 'gl-pill gl-pill-short'}>{s.long ? 'Long' : 'Short'} {(Number(s.leverage) / LEV_SCALE).toFixed(0)}x</span>
              <span className="gl-trade-pool">${usd(usdc(s.originalDeposited), 0)} · {Number(s.copierCount)} copiers</span>
              {s.refunded ? (
                <span className="gl-trade-res gl-trade-note">Cancelled, refunded</span>
              ) : (
                <span className={s.tradePct > 0 ? 'gl-trade-res gl-pos' : 'gl-trade-res gl-neg'}>
                  {s.tradePct > 0 ? '+' : ''}{s.tradePct.toFixed(1)}%
                </span>
              )}
            </div>
          ))}
          {!stats.settled.length && <div className="gl-trade gl-trade-empty">Reading trades from Arbitrum…</div>}
        </div>
      </section>

      {/* ===== HOW ===== */}
      <section className="gl-section">
        <div className="gl-head">
          <h2>Three moves, no account.</h2>
          <p>No sign-up and no deposit account. Your USDC only leaves your wallet when you copy a trade.</p>
        </div>
        <div className="gl-flow">
          <figure className="gl-move">
            <div className="gl-ui">
              <div className="gl-ui-row"><span className="gl-ui-muted">Network</span><b>Arbitrum One</b></div>
              <div className="gl-ui-row"><span className="gl-ui-muted">Asset</span><b>USDC</b></div>
              <span className="gl-ui-btn"><Wallet size={15} /> Connect wallet</span>
            </div>
            <figcaption><b>Connect.</b> MetaMask on Arbitrum with some USDC. On another chain? Bridge inside the app.</figcaption>
          </figure>
          <figure className="gl-move">
            <div className="gl-ui">
              <div className="gl-ui-row"><span className="gl-pill gl-pill-long">Long XAU/USD</span><span className="gl-ui-muted">new signal</span></div>
              <div className="gl-ui-input"><span className="gl-ui-muted">Amount</span><b>USDC</b></div>
              <div className="gl-ui-row gl-ui-small"><span className="gl-ui-muted">Take-profit &amp; stop-loss</span><span>set at entry</span></div>
              <span className="gl-ui-btn gl-ui-btn-gold">Copy trade</span>
            </div>
            <figcaption><b>Copy.</b> When a signal goes out, choose an amount from {depositLimits.min || 5} USDC and confirm in your wallet.</figcaption>
          </figure>
          <figure className="gl-move">
            <div className="gl-ui">
              <div className="gl-ui-row"><span className="gl-ui-check"><Check size={14} /></span><b>Trade closed</b></div>
              <div className="gl-ui-row gl-ui-small"><span className="gl-ui-muted">Your share of the pool</span><span>ready</span></div>
              <span className="gl-ui-btn">Claim to wallet</span>
            </div>
            <figcaption><b>Claim.</b> Take-profit or stop-loss closes the trade. Claim your share straight back to your wallet.</figcaption>
          </figure>
        </div>
      </section>

      {/* ===== CLOSE ===== */}
      <section className="gl-close">
        <div className="gl-close-copy">
          <h2>Pull up a chair.</h2>
          <p>{uniqueCopiers ? `${uniqueCopiers} wallets have auto-copy set up. ` : ''}Refer a friend and keep half of the fee on their winning trades.</p>
          <div className="gl-ctas">
            <button className="gl-btn" onClick={() => onNavigate('dashboard')}>Open the app <ArrowRight size={17} /></button>
            <button className="gl-textlink" onClick={() => onNavigate('referral')}>Referral program</button>
          </div>
          <div className="gl-socials">
            <a href="https://t.me/SmartTradingClubDapp" target="_blank" rel="noopener noreferrer">Telegram</a>
            <a href="https://x.com/STCprotocol" target="_blank" rel="noopener noreferrer">X</a>
            <a href={arbiscan} target="_blank" rel="noopener noreferrer">Contract</a>
          </div>
        </div>
      </section>
    </div>
  );
}

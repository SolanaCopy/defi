import React from 'react';
import {
  useCurrentFrame, useVideoConfig, interpolate, spring,
  Sequence, Easing, AbsoluteFill, Img, staticFile, Audio,
} from 'remotion';
import { theme } from './theme.js';

// ===== ANIMATION HELPERS =====
const ease = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const easeBack = Easing.out(Easing.back(1.4));
const easePow = Easing.out(Easing.poly(4));

const fade = (frame, start, dur = 15) =>
  interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const fadeOut = (frame, start, dur = 12) =>
  interpolate(frame, [start, start + dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const slideUp = (frame, start, from = 40, dur = 22) =>
  interpolate(frame, [start, start + dur], [from, 0], { extrapolateRight: 'clamp', easing: ease });
const slideX = (frame, start, from = 80, dur = 22) =>
  interpolate(frame, [start, start + dur], [from, 0], { extrapolateRight: 'clamp', easing: ease });
const pop = (frame, fps, start) =>
  spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 120 } });

// Blur-in reveal (cinematic)
const blurReveal = (frame, start, dur = 20) => ({
  opacity: fade(frame, start, dur),
  filter: `blur(${interpolate(frame, [start, start + dur], [14, 0], { extrapolateRight: 'clamp', easing: ease })}px)`,
  transform: `scale(${interpolate(frame, [start, start + dur], [1.06, 1], { extrapolateRight: 'clamp', easing: ease })})`,
});

// Bounce reveal from bottom
const bounceUp = (frame, start, from = 60, dur = 25) => ({
  opacity: fade(frame, start, Math.min(dur, 15)),
  transform: `translateY(${interpolate(frame, [start, start + dur], [from, 0], { extrapolateRight: 'clamp', easing: easeBack })}px)`,
});

// Glow pulse on element
const glowPulse = (frame, color = 'rgba(212,168,67,0.3)') =>
  `0 0 ${20 + Math.sin(frame / 5) * 10}px ${color}`;

// Typewriter counter
const countTo = (frame, start, to, dur = 40, decimals = 0) =>
  interpolate(frame, [start, start + dur], [0, to], { extrapolateRight: 'clamp', easing: easeInOut }).toFixed(decimals);

// ===== CURSOR =====
const Cursor = ({ frame, movements }) => {
  let x = movements[0]?.x || 0;
  let y = movements[0]?.y || 0;
  let clicking = false;

  for (const m of movements) {
    if (frame >= m.at) {
      const progress = interpolate(frame, [m.at, m.at + (m.dur || 20)], [0, 1], {
        extrapolateRight: 'clamp', easing: easeInOut,
      });
      x = (m.fromX ?? x) + (m.x - (m.fromX ?? x)) * progress;
      y = (m.fromY ?? y) + (m.y - (m.fromY ?? y)) * progress;
      if (m.click && frame >= m.at + (m.dur || 20) && frame < m.at + (m.dur || 20) + 8) clicking = true;
    }
  }

  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 100, transform: `scale(${clicking ? 0.8 : 1})`, pointerEvents: 'none' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M5 2L20 12L12 13L9 22L5 2Z" fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="1.5" />
      </svg>
      {clicking && <div style={{ position: 'absolute', left: -10, top: -10, width: 48, height: 48, borderRadius: '50%', border: `2px solid ${theme.accent}`, opacity: 0.7 }} />}
    </div>
  );
};

// ===== HIGHLIGHT BOX (animated pulsing border) =====
const Highlight = ({ frame, start, x, y, w, h, label, dur = 60 }) => {
  const opacity = fade(frame, start, 12);
  const pulse = 0.7 + Math.sin((frame - start) / 4) * 0.3;
  // Expanding ring animation
  const ringScale = interpolate((frame - start) % 30, [0, 30], [1, 1.15], { extrapolateRight: 'clamp' });
  const ringOp = interpolate((frame - start) % 30, [0, 30], [0.4, 0], { extrapolateRight: 'clamp' });

  return frame >= start && frame < start + dur ? (
    <>
      {/* Main highlight box */}
      <div style={{
        position: 'absolute', left: x - 5, top: y - 5, width: w + 10, height: h + 10,
        border: `2px solid ${theme.accent}`, borderRadius: 14,
        boxShadow: `0 0 25px ${theme.accentGlow}, inset 0 0 15px ${theme.accentGlow}`,
        opacity: opacity * pulse, zIndex: 50, pointerEvents: 'none',
      }} />
      {/* Expanding ring pulse */}
      <div style={{
        position: 'absolute', left: x - 5, top: y - 5, width: w + 10, height: h + 10,
        border: `1px solid ${theme.accent}`, borderRadius: 14,
        transform: `scale(${ringScale})`, opacity: ringOp * opacity,
        zIndex: 49, pointerEvents: 'none',
      }} />
      {/* Label with bounce-in */}
      {label && (
        <div style={{
          position: 'absolute', left: x, top: y - 40, zIndex: 55,
          ...bounceUp(frame, start, 15, 14),
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
            color: theme.bg, padding: '7px 16px',
            borderRadius: 10, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            boxShadow: `0 6px 20px rgba(0,0,0,0.5), 0 0 15px ${theme.accentGlow}`,
          }}>
            {label}
            <div style={{
              position: 'absolute', left: 18, bottom: -6, width: 0, height: 0,
              borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
              borderTop: `6px solid ${theme.accent}`,
            }} />
          </div>
        </div>
      )}
    </>
  ) : null;
};

// ===== BROWSER FRAME WITH SCREENSHOT =====
const BrowserScreen = ({ src, frame, zoomTo, zoomAt, zoomDur = 30, children, style, wide }) => {
  let scale = 1;
  let tx = 0;
  let ty = 0;

  if (zoomTo && frame >= zoomAt) {
    const p = interpolate(frame, [zoomAt, zoomAt + zoomDur], [0, 1], { extrapolateRight: 'clamp', easing: easeInOut });
    scale = 1 + (zoomTo.scale - 1) * p;
    tx = zoomTo.x * p;
    ty = zoomTo.y * p;
  }

  // wide mode = fills most of the screen (for full-page views)
  const w = wide ? 1680 : 1200;
  const h = wide ? 880 : 620;

  return (
    <div style={{
      width: w, background: '#0c0f15', borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden',
      boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
      ...style,
    }}>
      {/* Chrome bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 10,
        background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={{
          flex: 1, padding: '6px 14px', borderRadius: 8,
          background: 'rgba(255,255,255,0.05)', fontSize: 13, color: 'rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 11 }}>🔒</span> smarttradingclub.io
        </div>
      </div>
      {/* Screenshot */}
      <div style={{
        position: 'relative', height: h, overflow: 'hidden',
        transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        transformOrigin: 'center center',
      }}>
        <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        {children}
      </div>
    </div>
  );
};

// ===== ANIMATED CHECKMARK =====
const AnimatedCheck = ({ frame, start, size = 18 }) => {
  const progress = interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const scale = interpolate(frame, [start, start + 8], [0, 1], { extrapolateRight: 'clamp', easing: easeBack });

  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0, marginTop: 3,
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `scale(${scale})`,
      boxShadow: `0 0 10px ${theme.accentGlow}`,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none">
        <path
          d="M2 6L5 9L10 3"
          stroke={theme.bg}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={12}
          strokeDashoffset={12 - 12 * progress}
        />
      </svg>
    </div>
  );
};

// ===== SIDE PANEL (explanation) =====
const SidePanel = ({ frame, start, icon, title, points }) => {
  const pointDelay = 18; // frames between each point appearing
  // Which point is currently "active" (most recently appeared)
  const activeIdx = Math.min(
    points.length - 1,
    Math.max(0, Math.floor((frame - start - 20) / pointDelay))
  );

  return (
    <div style={{
      width: 400,
      ...bounceUp(frame, start, 50, 28),
      transform: `translateX(${interpolate(frame, [start, start + 25], [40, 0], { extrapolateRight: 'clamp', easing: easeBack })}px)`,
    }}>
      <div style={{
        background: 'rgba(8,10,14,0.95)', borderRadius: 22, padding: 30,
        border: `1px solid ${theme.borderAccent}`, backdropFilter: 'blur(24px)',
        boxShadow: `0 24px 70px rgba(0,0,0,0.4), 0 0 30px rgba(212,168,67,0.03)`,
      }}>
        {/* Header with icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 24,
            background: `${theme.accent}12`, border: `1px solid ${theme.borderAccent}`,
            boxShadow: `0 0 15px ${theme.accentGlow}`,
          }}>{icon}</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{title}</span>
        </div>

        {/* Animated progress line on left */}
        <div style={{ position: 'relative', paddingLeft: 8 }}>
          {/* Vertical connector line */}
          <div style={{
            position: 'absolute', left: 8, top: 12, bottom: 12, width: 2,
            background: 'rgba(255,255,255,0.04)', borderRadius: 1,
          }}>
            <div style={{
              width: '100%', borderRadius: 1,
              background: `linear-gradient(180deg, ${theme.accent}, ${theme.accentLight})`,
              height: `${interpolate(frame, [start + 20, start + 20 + points.length * pointDelay], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`,
              boxShadow: `0 0 8px ${theme.accentGlow}`,
            }} />
          </div>

          {/* Points */}
          {points.map((p, i) => {
            const pointStart = start + 20 + i * pointDelay;
            const isVisible = frame >= pointStart;
            const isActive = i === activeIdx && frame >= pointStart;
            const isPast = frame >= pointStart + pointDelay * 2;

            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                marginBottom: i < points.length - 1 ? 14 : 0,
                paddingLeft: 20,
                opacity: isVisible ? interpolate(frame, [pointStart, pointStart + 10], [0, 1], { extrapolateRight: 'clamp' }) : 0,
                transform: `translateX(${isVisible ? interpolate(frame, [pointStart, pointStart + 12], [20, 0], { extrapolateRight: 'clamp', easing: easeBack }) : 20}px)`,
              }}>
                <AnimatedCheck frame={frame} start={pointStart} />
                <span style={{
                  fontSize: 14, lineHeight: 1.65,
                  color: isActive ? 'rgba(255,255,255,0.9)' : isPast ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'color 0.3s, font-weight 0.3s',
                }}>{p}</span>
              </div>
            );
          })}
        </div>

        {/* Progress counter */}
        <div style={{
          marginTop: 18, paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          opacity: fade(frame, start + 20 + points.length * pointDelay - 10),
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
            {Math.min(points.length, Math.max(0, activeIdx + 1))}/{points.length} points
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {points.map((_, i) => (
              <div key={i} style={{
                width: 16, height: 3, borderRadius: 2,
                background: frame >= start + 20 + i * pointDelay
                  ? `linear-gradient(90deg, ${theme.accent}, ${theme.accentLight})`
                  : 'rgba(255,255,255,0.06)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== STEP BADGE =====
const StepBadge = ({ frame, start, step, title }) => (
  <div style={{
    position: 'absolute', top: 28, left: '50%', zIndex: 80,
    ...bounceUp(frame, start, 25, 18),
    transform: `translateX(-50%) translateY(${interpolate(frame, [start, start + 18], [25, 0], { extrapolateRight: 'clamp', easing: easeBack })}px)`,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 28px',
      background: 'rgba(8,10,14,0.95)', borderRadius: 16,
      border: `1px solid ${theme.borderAccent}`, backdropFilter: 'blur(24px)',
      boxShadow: `0 10px 40px rgba(0,0,0,0.4), 0 0 20px ${theme.accentGlow}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
        background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`, color: theme.bg,
        boxShadow: `0 0 12px ${theme.accentGlow}`,
      }}>{step}</div>
      <span style={{ fontSize: 17, fontWeight: 700, color: theme.text, letterSpacing: 0.3 }}>{title}</span>
    </div>
  </div>
);

// ===== BACKGROUND =====
const Background = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#040506', overflow: 'hidden' }}>
      {/* Moving nebula orbs */}
      {[
        { x: -300, y: -350, s: 900, sp: 100, op: 0.1 },
        { x: 1100, y: 500, s: 700, sp: 75, op: 0.06 },
        { x: 400, y: 700, s: 500, sp: 110, op: 0.04 },
      ].map((o, i) => (
        <div key={i} style={{
          position: 'absolute', width: o.s, height: o.s, borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.accent}, transparent 65%)`,
          left: o.x + Math.sin(frame / o.sp + i) * 35,
          top: o.y + Math.cos(frame / o.sp + i * 2) * 30,
          filter: 'blur(120px)', opacity: o.op,
        }} />
      ))}

      {/* Floating gold particles */}
      {Array.from({ length: 25 }).map((_, i) => {
        const x = (i * 137.5 + 13) % 100;
        const speed = 0.07 + (i % 5) * 0.025;
        const y = ((i * 73.7 + 27) % 100 + frame * speed) % 118 - 8;
        const size = 1.5 + (i % 4) * 0.7;
        const op = interpolate(y, [0, 15, 85, 110], [0, 0.35, 0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            width: size, height: size, borderRadius: '50%',
            background: i % 3 === 0 ? theme.accentLight : theme.accent,
            opacity: op * 0.25,
            boxShadow: `0 0 ${size * 5}px rgba(212,168,67,0.12)`,
          }} />
        );
      })}

      {/* Subtle vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.6) 100%)',
      }} />

      {/* Film grain overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.018, mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 1: INTRO — What is Smart Trading Club (590 frames, ~19.7s)
// Voice: "Welcome to STC..." (0-120) "...copy professional signals..." (120-300) "...on-chain on Arbitrum..." (300-450) "Let's get started" (450-530)
// ===================================================================
const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Gold flash at start
  const flashOpacity = interpolate(frame, [0, 8, 25], [0, 0.4, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: 60,
    }}>
      {/* Opening flash */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at center, ${theme.accent}40, transparent 60%)`,
        opacity: flashOpacity, pointerEvents: 'none',
      }} />

      {/* Logo — blur reveal synced with "Welcome to Smart Trading Club" */}
      <div style={{
        marginBottom: 20,
        ...blurReveal(frame, 10, 25),
      }}>
        <Img src={staticFile('logo.png')} style={{
          width: 70, height: 70, borderRadius: 16,
          boxShadow: glowPulse(frame),
        }} />
      </div>

      {/* Badge — slides in after logo */}
      <div style={{
        padding: '8px 24px', borderRadius: 24,
        background: theme.accentGlow, border: `1px solid ${theme.borderAccent}`,
        color: theme.accent, fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase',
        ...bounceUp(frame, 30, 30),
      }}>
        Complete Tutorial
      </div>

      {/* Main title — word by word blur reveal */}
      <div style={{ margin: '24px 0 0', ...blurReveal(frame, 50, 30) }}>
        <h1 style={{
          fontSize: 78, fontWeight: 800, color: theme.text, lineHeight: 1.05, letterSpacing: -3, margin: 0,
        }}>
          How to use{' '}
          <span style={{
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
            backgroundSize: `${interpolate(frame, [50, 100], [300, 100], { extrapolateRight: 'clamp' })}% 100%`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Smart Trading Club</span>
        </h1>
      </div>

      {/* Animated gold underline */}
      <div style={{
        width: interpolate(frame, [80, 110], [0, 280], { extrapolateRight: 'clamp', easing: ease }),
        height: 3, borderRadius: 2, margin: '16px auto 0',
        background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
      }} />

      {/* Voice: "copy professional gold trading signals automatically" */}
      <p style={{
        fontSize: 22, color: 'rgba(255,255,255,0.5)', maxWidth: 600, margin: '24px 0 0', lineHeight: 1.7,
        ...bounceUp(frame, 120, 40, 28),
      }}>
        Copy professional gold (XAU/USD) trading signals automatically. Trades execute on a decentralized exchange, fully on-chain on Arbitrum.
      </p>

      {/* Voice: "on-chain on Arbitrum" — flow diagram with sequential reveal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 50 }}>
        {[
          { icon: '🔗', label: 'Connect' },
          null,
          { icon: '✅', label: 'Approve' },
          null,
          { icon: '⚡', label: 'Auto-Copy' },
          null,
          { icon: '📈', label: 'Trade' },
          null,
          { icon: '💰', label: 'Profit' },
        ].map((item, i) => {
          if (!item) {
            const arrowFrame = 260 + i * 8;
            const arrowSlide = interpolate(frame, [arrowFrame, arrowFrame + 12], [-20, 0], { extrapolateRight: 'clamp', easing: ease });
            return <div key={i} style={{ fontSize: 22, color: theme.accent, opacity: fade(frame, arrowFrame, 8), transform: `translateX(${arrowSlide}px)` }}>→</div>;
          }
          const itemFrame = 255 + i * 10;
          const isActive = frame > itemFrame + 30 && frame < itemFrame + 80;
          return (
            <div key={i} style={{
              textAlign: 'center',
              transform: `scale(${pop(frame, fps, itemFrame)})`,
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: 18, margin: '0 auto 8px',
                background: isActive ? `${theme.accent}12` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? theme.borderAccent : theme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                boxShadow: isActive ? glowPulse(frame) : 'none',
                transition: 'all 0.3s',
              }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? theme.accent : 'rgba(255,255,255,0.5)' }}>{item.label}</div>
            </div>
          );
        })}
      </div>

      {/* Mini preview — slides in from right with parallax */}
      {frame > 350 && frame < 520 && (
        <div style={{
          position: 'absolute', right: 50, bottom: 110,
          width: 420, borderRadius: 18, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
          opacity: Math.min(fade(frame, 355, 18), fadeOut(frame, 490, 20)),
          transform: `translateX(${interpolate(frame, [350, 385], [80, 0], { extrapolateRight: 'clamp', easing: easeBack })}px) rotate(${interpolate(frame, [350, 385], [2, 0], { extrapolateRight: 'clamp', easing: ease })}deg)`,
        }}>
          <Img src={staticFile('ss-copytrade.png')} style={{
            width: '100%', display: 'block',
            transform: `scale(${interpolate(frame, [355, 520], [1, 1.05], { extrapolateRight: 'clamp' })})`, // Ken Burns
          }} />
        </div>
      )}

      {/* Voice: "Let's get started" — stats with animated counters */}
      <div style={{ display: 'flex', gap: 36, marginTop: 40 }}>
        {[
          { to: 17, lbl: 'Total Signals', suf: '', dec: 0, start: 425 },
          { to: 40.3, lbl: 'Total PnL', pre: '+', suf: '%', dec: 1, color: theme.success, start: 440 },
          { to: 52.9, lbl: 'Win Rate', suf: '%', dec: 1, start: 455 },
          { to: 565, lbl: 'Active Volume', pre: '$', suf: '', dec: 0, start: 470 },
        ].map((s, i) => (
          <div key={s.lbl} style={{
            textAlign: 'center',
            ...bounceUp(frame, s.start, 50, 22),
          }}>
            <div style={{
              fontSize: 32, fontWeight: 800, color: s.color || theme.accent,
              textShadow: `0 0 20px ${(s.color || theme.accent)}30`,
            }}>
              {frame > s.start ? `${s.pre || ''}${countTo(frame, s.start, s.to, 35, s.dec)}${s.suf}` : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6, letterSpacing: 1, textTransform: 'uppercase' }}>{s.lbl}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 2: What You Need (650 frames, ~21.7s)
// Voice: "Before we begin..." (0-60) "MetaMask wallet" (60-180) "Arbitrum network" (180-280) "USDC on Arbitrum" (280-400) "ETH for gas" (400-530)
// ===================================================================
const RequirementsScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const items = [
    { icon: '🦊', title: 'MetaMask Wallet', desc: 'Free browser extension wallet. Download at metamask.io. Or use Rabby, Coinbase Wallet, etc.', tip: 'Install it and create an account before starting' },
    { icon: '💎', title: 'Arbitrum Network', desc: 'A fast & cheap Layer 2 network on Ethereum. Our site adds it to MetaMask automatically.', tip: 'Gas fees are only a few cents per transaction' },
    { icon: '💵', title: 'USDC on Arbitrum', desc: 'The stablecoin used for all trades. Minimum $5 per trade, recommended $50+.', tip: 'Use our Bridge tab to transfer USDC from other chains' },
    { icon: '⛽', title: 'ETH for Gas', desc: 'A small amount of ETH on Arbitrum for transaction fees. About $0.50 is enough for 50+ transactions.', tip: 'Bridge ETH from Ethereum or buy on a centralized exchange' },
  ];

  // Each card appears when the voice mentions it
  const cardStarts = [60, 180, 280, 400];

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 70,
    }}>
      <div style={{
        fontSize: 13, color: theme.accent, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase',
        marginBottom: 14,
        ...bounceUp(frame, 5, 20),
      }}>Before You Start</div>

      <h2 style={{
        fontSize: 52, fontWeight: 800, color: theme.text, margin: '0 0 16px',
        ...blurReveal(frame, 12, 22),
      }}>
        What You'll Need
      </h2>

      {/* Animated underline */}
      <div style={{
        width: interpolate(frame, [25, 50], [0, 180], { extrapolateRight: 'clamp', easing: ease }),
        height: 3, borderRadius: 2, margin: '0 auto 36px',
        background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 940 }}>
        {items.map((item, i) => {
          const isActive = frame >= cardStarts[i] && (i === items.length - 1 || frame < cardStarts[i + 1]);
          return (
            <div key={item.title} style={{
              background: isActive ? 'rgba(212,168,67,0.03)' : 'rgba(255,255,255,0.02)',
              borderRadius: 20, padding: 28,
              border: `1px solid ${isActive ? 'rgba(212,168,67,0.2)' : theme.border}`,
              boxShadow: isActive ? glowPulse(frame, 'rgba(212,168,67,0.08)') : 'none',
              ...bounceUp(frame, cardStarts[i], 40, 25),
              transition: 'border-color 0.4s, background 0.4s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 26,
                  background: isActive ? `${theme.accent}18` : `${theme.accent}08`,
                  border: `1px solid ${isActive ? theme.accent : theme.borderAccent}`,
                  boxShadow: isActive ? `0 0 20px ${theme.accentGlow}` : 'none',
                  transform: `scale(${isActive ? 1.05 + Math.sin(frame / 8) * 0.02 : 1})`,
                  transition: 'all 0.3s',
                }}>{item.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: isActive ? theme.accent : theme.text }}>{item.title}</div>
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 10 }}>{item.desc}</div>
              <div style={{
                fontSize: 12, color: theme.accent, display: 'flex', alignItems: 'center', gap: 6,
                opacity: fade(frame, cardStarts[i] + 50, 15),
                transform: `translateX(${interpolate(frame, [cardStarts[i] + 50, cardStarts[i] + 65], [-10, 0], { extrapolateRight: 'clamp', easing: ease })}px)`,
              }}>
                💡 {item.tip}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 3: CONNECT WALLET (500 frames, ~16.7s)
// Phase 1 (0-50): Website fades in full-screen with floating particles
// Phase 2 (50-180): Cursor glides to Connect Wallet, spotlight follows, highlight pulses
// Phase 3 (180-250): Click — ripple effect, screenshot dims + blurs
// Phase 4 (250-380): MetaMask popup builds up element by element from center
// Phase 5 (380-500): "Connected" success + confetti particles
// ===================================================================
const ConnectScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clicked = frame > 180;
  const showMetaMask = frame > 240;
  const connected = frame > 380;

  // Website dims and blurs after click
  const siteDim = clicked
    ? interpolate(frame, [180, 250], [1, 0.3], { extrapolateRight: 'clamp', easing: ease })
    : 1;
  const siteBlur = clicked
    ? interpolate(frame, [180, 250], [0, 6], { extrapolateRight: 'clamp', easing: ease })
    : 0;
  const siteScale = clicked
    ? interpolate(frame, [180, 260], [1, 0.92], { extrapolateRight: 'clamp', easing: ease })
    : interpolate(frame, [15, 40], [0.94, 1], { extrapolateRight: 'clamp', easing: ease });

  // Click ripple
  const rippleProgress = clicked ? interpolate(frame, [180, 210], [0, 1], { extrapolateRight: 'clamp' }) : 0;

  // MetaMask popup
  const popupScale = showMetaMask ? pop(frame, fps, 245) : 0;

  // Success burst
  const burstProgress = connected ? interpolate(frame, [380, 420], [0, 1], { extrapolateRight: 'clamp' }) : 0;

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <StepBadge frame={frame} start={5} step="1" title="Connect Your Wallet" />

      {/* Ambient floating particles */}
      {Array.from({ length: 15 }).map((_, i) => {
        const x = (i * 137.5 + 20) % 100;
        const speed = 0.04 + (i % 5) * 0.015;
        const y = ((i * 73.7 + 10) % 100 + frame * speed) % 110 - 5;
        const size = 2 + (i % 3);
        return (
          <div key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            width: size, height: size, borderRadius: '50%',
            background: i % 2 === 0 ? theme.accent : 'rgba(3,125,214,0.6)',
            opacity: 0.15, pointerEvents: 'none',
            boxShadow: `0 0 ${size * 4}px ${i % 2 === 0 ? theme.accentGlow : 'rgba(3,125,214,0.2)'}`,
          }} />
        );
      })}

      {/* Website screenshot — full screen, dims after click */}
      <div style={{
        position: 'absolute',
        opacity: Math.min(fade(frame, 15, 20), siteDim),
        filter: `blur(${siteBlur}px)`,
        transform: `scale(${siteScale})`,
      }}>
        <BrowserScreen
          src="ss-connect-highlight.png"
          frame={frame}
          wide
          zoomTo={{ scale: 1.5, x: -400, y: 10 }}
          zoomAt={120}
          zoomDur={50}
        >
          {/* Connect Wallet highlight — measured: x:1493 y:13 w:145 h:31 (wide 0.875) */}
          <Highlight frame={frame} start={60} x={1493} y={13} w={145} h={31}
            label="Click Connect Wallet" dur={160} />

          {/* Spotlight glow following cursor path */}
          {frame > 60 && frame < 200 && (
            <div style={{
              position: 'absolute',
              left: interpolate(frame, [60, 130], [700, 1565], { extrapolateRight: 'clamp', easing: easeInOut }) - 100,
              top: interpolate(frame, [60, 130], [350, 28], { extrapolateRight: 'clamp', easing: easeInOut }) - 100,
              width: 200, height: 200, borderRadius: '50%',
              background: `radial-gradient(circle, rgba(212,168,67,0.12), transparent 70%)`,
              filter: 'blur(20px)', pointerEvents: 'none',
            }} />
          )}

          {/* Cursor */}
          <Cursor frame={frame} movements={[
            { at: 0, x: 700, y: 350, dur: 1 },
            { at: 60, x: 1565, y: 28, fromX: 700, fromY: 350, dur: 70, click: true },
          ]} />

          {/* Click ripple effect */}
          {clicked && rippleProgress < 1 && (
            <>
              <div style={{
                position: 'absolute', left: 1565 - 40 * rippleProgress, top: 28 - 40 * rippleProgress,
                width: 80 * rippleProgress, height: 80 * rippleProgress, borderRadius: '50%',
                border: `2px solid rgba(212,168,67,${0.6 * (1 - rippleProgress)})`,
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', left: 1565 - 70 * rippleProgress, top: 28 - 70 * rippleProgress,
                width: 140 * rippleProgress, height: 140 * rippleProgress, borderRadius: '50%',
                border: `1px solid rgba(212,168,67,${0.3 * (1 - rippleProgress)})`,
                pointerEvents: 'none',
              }} />
            </>
          )}
        </BrowserScreen>
      </div>

      {/* Center glow behind MetaMask popup */}
      {showMetaMask && (
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: connected
            ? 'radial-gradient(circle, rgba(52,211,153,0.12), transparent 70%)'
            : 'radial-gradient(circle, rgba(3,125,214,0.1), transparent 70%)',
          filter: 'blur(50px)', opacity: fade(frame, 245),
          transform: `scale(${1 + Math.sin(frame / 18) * 0.04})`,
        }} />
      )}

      {/* MetaMask Connect Popup — premium version */}
      {showMetaMask && (
        <div style={{
          width: 420, position: 'relative',
          transform: `scale(${popupScale})`,
          opacity: fade(frame, 248, 12),
        }}>
          {/* Success burst ring */}
          {connected && (
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 500 * burstProgress, height: 500 * burstProgress,
              borderRadius: '50%',
              border: `3px solid rgba(52,211,153,${0.5 * (1 - burstProgress)})`,
              transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            }} />
          )}

          <div style={{
            background: 'linear-gradient(145deg, #1e2230, #171b28)', borderRadius: 24,
            border: `1px solid ${connected ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.08)'}`,
            boxShadow: connected
              ? '0 30px 100px rgba(0,0,0,0.7), 0 0 50px rgba(52,211,153,0.08)'
              : '0 30px 100px rgba(0,0,0,0.7), 0 0 50px rgba(3,125,214,0.05)',
            overflow: 'hidden',
          }}>
            {/* Header bar */}
            <div style={{
              padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #E8821E, #F5A623)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, boxShadow: '0 4px 12px rgba(232,130,30,0.3)',
                }}>🦊</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>MetaMask</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Connection Request</div>
                </div>
              </div>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: connected ? theme.success : '#F5A623',
                boxShadow: `0 0 8px ${connected ? 'rgba(52,211,153,0.4)' : 'rgba(245,166,35,0.4)'}`,
              }} />
            </div>

            <div style={{ padding: '22px 24px 20px' }}>
              {/* Site info */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.05)', marginBottom: 16,
                opacity: fade(frame, 260),
              }}>
                <Img src={staticFile('logo.png')} style={{ width: 36, height: 36, borderRadius: 10 }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>Smart Trading Club</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>https://smarttradingclub.io</div>
                </div>
              </div>

              {/* What this site can do */}
              <div style={{
                marginBottom: 16, opacity: fade(frame, 275),
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: 1.5, fontWeight: 700 }}>
                  THIS SITE WILL BE ABLE TO
                </div>
                {['View your wallet address', 'Request transaction approval', 'View your token balances'].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                    opacity: fade(frame, 280 + i * 12),
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M2 5L4 7L8 3" stroke={theme.success} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* Account selector */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'rgba(255,255,255,0.02)', borderRadius: 12, marginBottom: 18,
                border: '1px solid rgba(255,255,255,0.04)',
                opacity: fade(frame, 310),
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #e17076, #7b68ee)',
                  boxShadow: '0 4px 12px rgba(123,104,238,0.2)',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Account 1</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>0x1a2b...9f3e</div>
                </div>
                <div style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'rgba(212,168,67,0.08)', color: theme.accent,
                  border: `1px solid ${theme.borderAccent}`,
                }}>Arbitrum</div>
              </div>

              {/* Buttons or Connected state */}
              {!connected ? (
                <div style={{ display: 'flex', gap: 12, opacity: fade(frame, 320) }}>
                  <div style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, textAlign: 'center',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: 600,
                  }}>Cancel</div>
                  <div style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, textAlign: 'center',
                    background: 'linear-gradient(135deg, #037DD6, #1098FC)',
                    color: 'white', fontSize: 15, fontWeight: 700,
                    boxShadow: '0 8px 24px rgba(3,125,214,0.3)',
                    // Pulse when about to be clicked
                    transform: frame > 340 && frame < 380
                      ? `scale(${1 + Math.sin(frame / 3) * 0.02})`
                      : 'scale(1)',
                    border: frame > 340 && frame < 380
                      ? '1px solid rgba(16,152,252,0.5)'
                      : '1px solid transparent',
                  }}>Connect</div>
                </div>
              ) : (
                <div style={{
                  padding: '16px 0', borderRadius: 14, textAlign: 'center',
                  background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
                  boxShadow: '0 8px 24px rgba(52,211,153,0.08)',
                  transform: `scale(${pop(frame, fps, 380)})`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" stroke={theme.success} strokeWidth="2" opacity="0.3" />
                      <path d="M6 10L9 13L14 7" stroke={theme.success} strokeWidth="2" strokeLinecap="round"
                        strokeDasharray="14"
                        strokeDashoffset={interpolate(frame, [380, 400], [14, 0], { extrapolateRight: 'clamp' })}
                      />
                    </svg>
                    <span style={{ color: theme.success, fontSize: 15, fontWeight: 700 }}>Wallet Connected</span>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'rgba(52,211,153,0.5)', marginTop: 6,
                    opacity: fade(frame, 400),
                  }}>Ready to trade on Arbitrum One</div>
                </div>
              )}
            </div>
          </div>

          {/* Cursor inside popup — clicks Connect */}
          {!connected && frame > 330 && (
            <Cursor frame={frame} movements={[
              { at: 330, x: 210, y: 200, dur: 1 },
              { at: 345, x: 315, y: 395, fromX: 210, fromY: 200, dur: 25, click: true },
            ]} />
          )}
        </div>
      )}

      {/* Success confetti particles */}
      {connected && Array.from({ length: 20 }).map((_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const speed = 2 + (i % 4) * 1.5;
        const dist = (frame - 380) * speed;
        const x = 960 + Math.cos(angle) * dist;
        const y = 540 + Math.sin(angle) * dist - (frame - 380) * 0.3;
        const size = 3 + (i % 3) * 2;
        const colors = [theme.success, theme.accent, '#1098FC', theme.accentLight];
        const opacity = interpolate(frame, [380, 420], [0.8, 0], { extrapolateRight: 'clamp' });

        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y,
            width: size, height: size,
            borderRadius: i % 2 === 0 ? '50%' : 1,
            background: colors[i % colors.length],
            opacity, pointerEvents: 'none',
            transform: `rotate(${frame * (3 + i)}deg)`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 4: APPROVE USDC (500 frames, ~16.7s)
// Phase 1 (0-60): Scene title zoom in
// Phase 2 (60-250): MetaMask popup builds up, website dimmed behind
// Phase 3 (250-320): Cursor clicks approve, success burst
// Phase 4 (320-500): Side panel explains
// ===================================================================
const ApproveScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const approved = frame > 300;
  const showPanel = frame > 330;

  // Popup entrance
  const popupScale = frame < 60 ? 0 : pop(frame, fps, 60);
  const popupY = interpolate(frame, [60, 90], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeBack });

  // Success burst ring
  const burstProgress = approved ? interpolate(frame, [300, 340], [0, 1], { extrapolateRight: 'clamp' }) : 0;

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <StepBadge frame={frame} start={5} step="2" title="Approve USDC Spending" />

      {/* Background glow behind popup */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: approved
          ? `radial-gradient(circle, rgba(52,211,153,0.15), transparent 70%)`
          : `radial-gradient(circle, rgba(3,125,214,0.12), transparent 70%)`,
        filter: 'blur(60px)',
        opacity: fade(frame, 50),
        transform: `scale(${1 + Math.sin(frame / 20) * 0.05})`,
      }} />

      {/* Dimmed website screenshot behind — adds depth */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: interpolate(frame, [0, 40, 60, 90], [0, 0.15, 0.15, 0.06], { extrapolateRight: 'clamp' }),
        filter: 'blur(3px)',
        transform: 'scale(1.05)',
      }}>
        <Img src={staticFile('ss-dashboard.png')} style={{ width: 1400, borderRadius: 16 }} />
      </div>

      {/* Main content: popup left, panel right */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 50,
        transform: `translateX(${showPanel ? interpolate(frame, [330, 370], [0, -40], { extrapolateRight: 'clamp', easing: ease }) : 0}px)`,
      }}>
        {/* MetaMask Popup — cinematic version */}
        <div style={{
          width: 420, position: 'relative',
          opacity: fade(frame, 55, 15),
          transform: `scale(${popupScale}) translateY(${popupY}px)`,
        }}>
          {/* Success burst ring */}
          {approved && (
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 500 * burstProgress, height: 500 * burstProgress,
              borderRadius: '50%',
              border: `3px solid rgba(52,211,153,${0.4 * (1 - burstProgress)})`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }} />
          )}

          <div style={{
            background: 'linear-gradient(145deg, #1e2230, #171b28)', borderRadius: 24, padding: 0,
            border: `1px solid ${approved ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.08)'}`,
            boxShadow: approved
              ? '0 30px 100px rgba(0,0,0,0.6), 0 0 40px rgba(52,211,153,0.1)'
              : '0 30px 100px rgba(0,0,0,0.6), 0 0 40px rgba(3,125,214,0.05)',
            overflow: 'hidden',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}>
            {/* MetaMask header bar */}
            <div style={{
              padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #E8821E, #F5A623)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, boxShadow: '0 4px 12px rgba(232,130,30,0.3)',
                }}>🦊</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>MetaMask</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Spending Approval</div>
                </div>
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: 'rgba(52,211,153,0.1)', color: theme.success, letterSpacing: 0.5,
              }}>ARBITRUM</div>
            </div>

            <div style={{ padding: '24px 24px 20px' }}>
              {/* Site requesting */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.05)', marginBottom: 18,
                opacity: fade(frame, 75),
              }}>
                <Img src={staticFile('logo.png')} style={{ width: 32, height: 32, borderRadius: 8 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Smart Trading Club</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>smarttradingclub.io</div>
                </div>
              </div>

              {/* Permission details */}
              <div style={{
                background: 'rgba(255,255,255,0.02)', borderRadius: 14, padding: '16px 18px',
                border: '1px solid rgba(255,255,255,0.04)', marginBottom: 16,
                opacity: fade(frame, 90),
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8, letterSpacing: 1.5, fontWeight: 700 }}>PERMISSION REQUEST</div>
                <div style={{ fontSize: 15, color: theme.text, fontWeight: 600, marginBottom: 8 }}>
                  Allow spending of your USDC
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['ERC-20 Token', 'One-Time', 'Revocable'].map((tag, i) => (
                    <div key={tag} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: 'rgba(212,168,67,0.08)', color: theme.accent,
                      border: `1px solid ${theme.borderAccent}`,
                      opacity: fade(frame, 105 + i * 10),
                    }}>{tag}</div>
                  ))}
                </div>
              </div>

              {/* Wallet info */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'rgba(255,255,255,0.02)', borderRadius: 12, marginBottom: 18,
                opacity: fade(frame, 130),
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #e17076, #7b68ee)',
                  boxShadow: '0 4px 12px rgba(123,104,238,0.2)',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Account 1</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>0x1a2b...9f3e</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.accent }}>$127.50 USDC</div>
              </div>

              {/* Gas estimate */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginBottom: 18,
                borderTop: '1px solid rgba(255,255,255,0.04)',
                opacity: fade(frame, 145),
              }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Estimated gas fee</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>~$0.02</span>
              </div>

              {/* Buttons */}
              {!approved ? (
                <div style={{ display: 'flex', gap: 12, opacity: fade(frame, 155) }}>
                  <div style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, textAlign: 'center',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: 600,
                  }}>Reject</div>
                  <div style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, textAlign: 'center',
                    background: 'linear-gradient(135deg, #037DD6, #1098FC)',
                    color: 'white', fontSize: 15, fontWeight: 700,
                    boxShadow: '0 8px 24px rgba(3,125,214,0.3)',
                    // Pulse glow when cursor is near
                    animation: frame > 230 && frame < 300 ? undefined : undefined,
                    border: frame > 230 && frame < 300
                      ? '1px solid rgba(16,152,252,0.5)'
                      : '1px solid transparent',
                    transform: frame > 230 && frame < 300
                      ? `scale(${1 + Math.sin(frame / 3) * 0.02})`
                      : 'scale(1)',
                  }}>Approve</div>
                </div>
              ) : (
                <div style={{
                  padding: '16px 0', borderRadius: 14, textAlign: 'center',
                  background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
                  boxShadow: '0 8px 24px rgba(52,211,153,0.1)',
                  transform: `scale(${pop(frame, fps, 300)})`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="9" r="8" stroke={theme.success} strokeWidth="2" opacity="0.3" />
                      <path d="M5 9L8 12L13 6" stroke={theme.success} strokeWidth="2" strokeLinecap="round"
                        strokeDasharray="14"
                        strokeDashoffset={interpolate(frame, [300, 318], [14, 0], { extrapolateRight: 'clamp' })}
                      />
                    </svg>
                    <span style={{ color: theme.success, fontSize: 15, fontWeight: 700 }}>Approved Successfully</span>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'rgba(52,211,153,0.5)', marginTop: 6,
                    opacity: fade(frame, 315),
                  }}>Transaction confirmed on Arbitrum</div>
                </div>
              )}
            </div>
          </div>

          {/* Cursor clicks Approve button */}
          <Cursor frame={frame} movements={[
            { at: 0, x: 210, y: 150, dur: 1 },
            { at: 230, x: 315, y: 410, fromX: 210, fromY: 150, dur: 40, click: true },
          ]} />
        </div>

        {/* Side panel — slides in after approval */}
        {showPanel && (
          <div style={{
            opacity: fade(frame, 335, 15),
            transform: `translateX(${interpolate(frame, [330, 365], [50, 0], { extrapolateRight: 'clamp', easing: easeBack })}px)`,
          }}>
            <SidePanel frame={frame} start={340} icon="✅" title="Why approve?"
              points={[
                'Smart contract needs permission to use USDC when copying trades',
                'Standard ERC-20 approval — every DeFi protocol requires it',
                'One-time only — stays approved for all future trades',
                'Funds stay in YOUR wallet until a trade is copied',
                'Revoke anytime via MetaMask or revoke.cash',
              ]}
            />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 5: ENABLE AUTO-COPY (670 frames, ~22.3s)
// Voice timing (relative to scene start):
//   0-90:   "Step three: enable auto-copy"
//   90-200:  "Choose how much USDC you want to invest per trade"
//   200-400: "bot automatically executes... on gTrade... decentralized exchange"
//   400-600: "USDC plus profit or loss returns to your wallet automatically"
//
// Phase 1 (0-120):  Dashboard appears full-screen, overview
// Phase 2 (120-220): Zoom to amount buttons, cursor clicks $50
// Phase 3 (220-350): Pan to Enable button, cursor clicks it
// Phase 4 (350-670): Dashboard dims, side panel explains how it works
// ===================================================================
const AutoCopyScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showPanel = frame > 370;

  // Dashboard zoom — slow Ken Burns into the auto-copy area
  // Amount buttons are at x:~550, Enable button at x:~1250 (on 1680px image)
  // Phase 1: overview
  // Phase 2: zoom to amount buttons (left-center area)
  // Phase 3: pan right to Enable button (right side)
  // Phase 4: zoom out for side panel
  const dashZoom = interpolate(frame,
    [0, 60, 120, 220, 280, 350, 400],
    [1, 1, 1.5, 1.5, 1.5, 1.5, 1],
    { extrapolateRight: 'clamp', easing: easeInOut });

  const dashPanX = interpolate(frame,
    [0, 120, 220, 280, 350, 400],
    [0, -150, -150, 100, 100, 0],
    { extrapolateRight: 'clamp', easing: easeInOut });

  const dashPanY = interpolate(frame,
    [0, 120, 350, 400],
    [0, -120, -120, 0],
    { extrapolateRight: 'clamp', easing: easeInOut });

  // Dashboard dims when panel appears
  const dashOpacity = showPanel
    ? interpolate(frame, [370, 420], [1, 0.25], { extrapolateRight: 'clamp' })
    : 1;
  const dashBlur = showPanel
    ? interpolate(frame, [370, 420], [0, 5], { extrapolateRight: 'clamp' })
    : 0;
  const dashScale = showPanel
    ? interpolate(frame, [370, 420], [1, 0.85], { extrapolateRight: 'clamp', easing: ease })
    : 1;

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <StepBadge frame={frame} start={5} step="3" title="Enable Auto-Copy" />

      {/* Dashboard screenshot — full-screen with zoom/pan */}
      <div style={{
        position: 'absolute',
        opacity: Math.min(fade(frame, 15, 25), dashOpacity),
        filter: `blur(${dashBlur}px)`,
        transform: `scale(${dashScale})`,
      }}>
        <div style={{
          width: 1680, background: '#0c0f15', borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden',
          boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
        }}>
          {/* Chrome bar */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 10,
            background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
                <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <div style={{
              flex: 1, padding: '6px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', fontSize: 13, color: 'rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 11 }}>🔒</span> smarttradingclub.io
            </div>
            <div style={{
              padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: 'rgba(212,168,67,0.1)', color: theme.accent,
            }}>Dashboard</div>
          </div>

          {/* Screenshot with zoom/pan */}
          <div style={{ height: 880, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', width: '100%',
              transform: `scale(${dashZoom}) translate(${dashPanX}px, ${dashPanY}px)`,
              transformOrigin: 'center top',
            }}>
              <Img src={staticFile('ss-dashboard.png')} style={{ width: '100%', display: 'block' }} />

              {/* Cursor INSIDE the zoom/pan container so it moves with the image
                  Positions are on the 1680px-wide image (1920 × 0.875)
                  Amount buttons: $10(466,487) $25(520,487) $50(574,487) $100(631,487)
                  Enable Auto-Copy: (1250,487) */}
              <Cursor frame={frame} movements={[
                { at: 0, x: 840, y: 300, dur: 1 },
                // Voice: "Choose how much USDC" — cursor glides to amount area
                { at: 100, x: 466, y: 487, fromX: 840, fromY: 300, dur: 50 },
                // Hover $10
                { at: 155, x: 520, y: 487, fromX: 466, fromY: 487, dur: 20 },
                // Hover $50
                { at: 180, x: 574, y: 487, fromX: 520, fromY: 487, dur: 20, click: true },
                // Hover $100
                { at: 210, x: 631, y: 487, fromX: 574, fromY: 487, dur: 20 },
                // Voice: "bot automatically executes" — cursor to Enable Auto-Copy
                { at: 260, x: 1250, y: 487, fromX: 631, fromY: 487, dur: 60, click: true },
              ]} />
            </div>
          </div>
        </div>
      </div>

      {/* Side panel — slides up from bottom center after Enable is clicked */}
      {showPanel && (
        <div style={{
          position: 'absolute',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          opacity: fade(frame, 375, 20),
          transform: `translateY(${interpolate(frame, [370, 410], [60, 0], { extrapolateRight: 'clamp', easing: easeBack })}px)`,
        }}>
          <SidePanel frame={frame} start={380} icon="⚡" title="How Auto-Copy Works"
            points={[
              'Choose how much USDC to invest per trade ($25 - $500+)',
              'When a new signal is posted, the bot automatically executes the trade for you',
              'USDC is pulled from your wallet at that moment',
              'The trade runs on gTrade — a decentralized exchange for gold trading',
              'When the trade closes, USDC + profit (or loss) returns to your wallet',
              'Trading involves risk — you can lose money',
            ]}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 6: RESULTS PAGE (620 frames, ~20.7s)
// Full-screen real website — zooms into each section with floating labels
// Uses results-data.png (has real trading data)
// Sections: Stats bar → Daily Performance → Monthly → Trade Log → On-Chain badge
// ===================================================================
const ResultsScene = () => {
  const frame = useCurrentFrame();

  // Camera movement — zooms and pans to each section
  // 0-80: full page overview
  // 80-180: zoom into stats bar (top row of numbers)
  // 180-280: pan down + zoom to Daily Performance
  // 280-380: pan right to Monthly Breakdown
  // 380-480: zoom out, scroll down to Trade Log
  // 480-620: zoom into trades + on-chain badge

  const zoom = interpolate(frame,
    [0, 30, 80, 180, 280, 380, 480, 560],
    [1, 1, 1.6, 1.8, 1.7, 1, 1.4, 1.4],
    { extrapolateRight: 'clamp', easing: easeInOut });

  const panX = interpolate(frame,
    [0, 80, 180, 280, 380],
    [0, 0, -100, 200, 0],
    { extrapolateRight: 'clamp', easing: easeInOut });

  const panY = interpolate(frame,
    [0, 80, 180, 280, 380, 480, 560],
    [0, -80, -30, -30, 50, -100, -100],
    { extrapolateRight: 'clamp', easing: easeInOut });

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <StepBadge frame={frame} start={5} step="4" title="Track Your Results" />

      {/* Browser frame */}
      <div style={{
        width: 1680, background: '#0c0f15', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden',
        boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
        opacity: fade(frame, 15, 20),
        transform: `scale(${interpolate(frame, [10, 35], [0.93, 1], { extrapolateRight: 'clamp', easing: ease })})`,
      }}>
        {/* Chrome bar */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 10,
          background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
            ))}
          </div>
          <div style={{
            flex: 1, padding: '6px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', fontSize: 13, color: 'rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 11 }}>🔒</span> smarttradingclub.io
          </div>
          <div style={{
            padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: 'rgba(52,211,153,0.1)', color: theme.success,
          }}>Results Tab</div>
        </div>

        {/* Screenshot area with zoom/pan */}
        <div style={{ height: 880, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', width: '100%',
            transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
            transformOrigin: 'center top',
          }}>
            <Img src={staticFile('results-data.png')} style={{
              width: '100%', display: 'block',
            }} />
          </div>

          {/* Cursor moves to each element as the voice talks about it
              Positions scaled to wide mode (×0.875 from 1920px measurements):
              Total PnL: (380, 218)  |  Total Trades: (533, 218)  |  Win Rate: (687, 218)
              Daily Perf: (410, 446) |  Monthly: (955, 446)       |  Trade Log: (382, 661) */}
          <Cursor frame={frame} movements={[
            { at: 0, x: 840, y: 300, dur: 1 },
            { at: 50, x: 840, y: 69, fromX: 840, fromY: 300, dur: 30 },
            { at: 85, x: 380, y: 218, fromX: 840, fromY: 69, dur: 25 },
            { at: 120, x: 533, y: 218, fromX: 380, fromY: 218, dur: 20 },
            { at: 145, x: 687, y: 218, fromX: 533, fromY: 218, dur: 20 },
            { at: 185, x: 410, y: 446, fromX: 687, fromY: 218, dur: 30 },
            { at: 285, x: 955, y: 446, fromX: 410, fromY: 446, dur: 30 },
            { at: 420, x: 382, y: 661, fromX: 955, fromY: 446, dur: 35 },
          ]} />

        </div>
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 7: IMPORTANT TIPS (620 frames, ~20.7s)
// Voice: "important tips" (0-60) "trading involves risk" (60-180) "keep USDC" (180-260)
// "ETH for gas" (260-340) "join Telegram" (340-430) rest stays visible
// Shows bridge screenshot when mentioning bridge tab
// ===================================================================
const TipsScene = () => {
  const frame = useCurrentFrame();

  const tips = [
    { icon: '⚠️', title: 'Trading = Risk', desc: 'With 25x leverage, a small move against you can mean significant losses. Only invest what you can afford to lose.', color: theme.danger },
    { icon: '💰', title: 'Keep USDC Ready', desc: 'Auto-copy pulls USDC from your wallet each signal. If your balance is too low, the trade is skipped for you.', color: theme.accent },
    { icon: '⛽', title: 'ETH for Gas', desc: 'Keep ~$0.50 in ETH on Arbitrum. Fees are cheap but you still need some for approvals and claims.', color: theme.accent },
    { icon: '📱', title: 'Join Telegram', desc: 'Get real-time notifications: new signals, trade closures, daily recaps, and performance milestones.', color: theme.accent },
    { icon: '🌉', title: 'Use Bridge Tab', desc: 'Need USDC on Arbitrum? Use our built-in Li.Fi bridge to transfer from Ethereum, BSC, Polygon, etc.', color: theme.accent },
    { icon: '🔄', title: 'Auto Profits', desc: 'After each trade, profits return to your wallet automatically. No manual claiming needed on the new contract.', color: theme.success },
  ];

  const tipStarts = [60, 180, 260, 340, 410, 470];
  // Show bridge screenshot when bridge tip appears
  const showBridge = frame > 400 && frame < 560;

  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, padding: '60px 50px',
    }}>
      {/* Left: Tips grid */}
      <div style={{ flex: '1 1 auto', maxWidth: showBridge ? 600 : 1050 }}>
        <div style={{ fontSize: 13, color: theme.accent, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12, opacity: fade(frame, 5) }}>
          Good to Know
        </div>
        <h2 style={{
          fontSize: 46, fontWeight: 800, color: theme.text, margin: '0 0 36px',
          opacity: fade(frame, 15), transform: `translateY(${slideUp(frame, 15)}px)`,
        }}>
          Important Tips
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: showBridge ? '1fr 1fr' : '1fr 1fr 1fr', gap: 16 }}>
          {tips.map((tip, i) => (
            <div key={tip.title} style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 22,
              border: `1px solid ${i === 0 ? 'rgba(248,113,113,0.15)' : theme.border}`,
              opacity: fade(frame, tipStarts[i], 20),
              transform: `translateY(${slideUp(frame, tipStarts[i], 30)}px)`,
            }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{tip.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: tip.color, marginBottom: 8 }}>{tip.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>{tip.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Bridge screenshot when mentioned */}
      {showBridge && (
        <div style={{
          flex: '0 0 500px',
          opacity: fade(frame, 405, 15),
          transform: `translateX(${interpolate(frame, [400, 425], [60, 0], { extrapolateRight: 'clamp', easing: ease })}px)`,
        }}>
          <BrowserScreen src="ss-dashboard.png" frame={frame} style={{ width: 500 }}>
            {/* Bridge button in the wallet section — top left area */}
            <Highlight frame={frame} start={420} x={95} y={108} w={100} h={18} label="Use Bridge to get USDC" dur={100} />
          </BrowserScreen>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 8: OUTRO (600 frames, ~20s)
// Voice: "you're all set" (0-90) "connect, approve, enable" (90-250)
// "smarttradingclub.io" (250-400) "see you on the next trade" (400-500)
// ===================================================================
const OutroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center',
      opacity: fade(frame, 0),
    }}>
      <Img src={staticFile('logo.png')} style={{
        width: 70, height: 70, borderRadius: 18, marginBottom: 20,
        transform: `scale(${pop(frame, fps, 10)})`,
      }} />

      {/* Voice: "you're all set" */}
      <h1 style={{
        fontSize: 56, fontWeight: 800, margin: 0, lineHeight: 1.1,
        opacity: fade(frame, 25), transform: `translateY(${slideUp(frame, 25)}px)`,
      }}>
        <span style={{
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>You're Ready!</span>
      </h1>

      {/* Voice: "Connect, approve, enable auto-copy" */}
      <p style={{
        fontSize: 20, color: 'rgba(255,255,255,0.5)', margin: '16px 0 32px', maxWidth: 480, lineHeight: 1.6,
        opacity: fade(frame, 100), transform: `translateY(${slideUp(frame, 100, 18)}px)`,
      }}>
        Connect your wallet, approve USDC, enable auto-copy, and let the bot handle the rest.
      </p>

      {/* Steps recap — pop in one by one */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 36, opacity: fade(frame, 130) }}>
        {[
          { s: '1', t: 'Connect' },
          { s: '2', t: 'Approve' },
          { s: '3', t: 'Auto-Copy' },
          { s: '4', t: 'Profit' },
        ].map((item, i) => (
          <div key={item.s} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px',
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${theme.border}`, borderRadius: 12,
            transform: `scale(${pop(frame, fps, 140 + i * 15)})`,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`, color: theme.bg,
            }}>{item.s}</div>
            <span style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{item.t}</span>
          </div>
        ))}
      </div>

      {/* Voice: "smarttradingclub.io" — CTA appears */}
      <div style={{
        padding: '16px 44px', borderRadius: 14, fontSize: 19, fontWeight: 700,
        background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
        color: theme.bg, boxShadow: `0 4px 30px ${theme.accentGlow}`,
        opacity: fade(frame, 260), transform: `translateY(${slideUp(frame, 260, 15)}px)`,
      }}>
        Start at smarttradingclub.io →
      </div>

      {/* Voice: "see you on the next trade" */}
      <div style={{ marginTop: 18, fontSize: 15, color: 'rgba(255,255,255,0.35)', opacity: fade(frame, 350) }}>
        Join our Telegram for real-time trade notifications
      </div>
    </AbsoluteFill>
  );
};

// ===== PROGRESS BAR =====
const ProgressBar = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = (frame / durationInFrames) * 100;

  // Scene markers for visual reference
  const scenes = [
    { at: 0, label: 'Intro' },
    { at: 570 / durationInFrames * 100, label: 'Setup' },
    { at: 1200 / durationInFrames * 100, label: 'Connect' },
    { at: 1870 / durationInFrames * 100, label: 'Approve' },
    { at: 2500 / durationInFrames * 100, label: 'Copy' },
    { at: 3150 / durationInFrames * 100, label: 'Results' },
    { at: 3750 / durationInFrames * 100, label: 'Tips' },
    { at: 4350 / durationInFrames * 100, label: 'End' },
  ];

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, zIndex: 100,
      background: 'rgba(255,255,255,0.03)',
    }}>
      <div style={{
        width: `${progress}%`, height: '100%',
        background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentLight})`,
        boxShadow: `0 0 16px ${theme.accentGlow}, 0 -2px 8px ${theme.accentGlow}`,
        borderRadius: '0 2px 2px 0',
      }} />
      {/* Glow dot at end of progress */}
      <div style={{
        position: 'absolute', left: `${progress}%`, top: -3, width: 10, height: 10,
        borderRadius: '50%', background: theme.accentLight,
        boxShadow: `0 0 12px ${theme.accent}`,
        transform: 'translateX(-50%)',
      }} />
    </div>
  );
};

// ===== LETTERBOX =====
const Letterbox = () => (
  <>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 55, background: 'linear-gradient(180deg, #000 60%, transparent)', zIndex: 90 }} />
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 55, background: 'linear-gradient(0deg, #000 60%, transparent)', zIndex: 90 }} />
  </>
);

// ===== SCENE TRANSITION (blur + zoom + fade) =====
const SceneTransition = ({ children, fadeInDur = 25, fadeOutStart, fadeOutDur = 22 }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, fadeInDur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOutVal = fadeOutStart != null
    ? interpolate(frame, [fadeOutStart, fadeOutStart + fadeOutDur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const scaleIn = interpolate(frame, [0, fadeInDur], [1.06, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const scaleOut = fadeOutStart != null
    ? interpolate(frame, [fadeOutStart, fadeOutStart + fadeOutDur], [1, 0.97], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const blurIn = interpolate(frame, [0, fadeInDur * 0.6], [6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const blurOut = fadeOutStart != null
    ? interpolate(frame, [fadeOutStart, fadeOutStart + fadeOutDur], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill style={{
      opacity: Math.min(fadeIn, fadeOutVal),
      transform: `scale(${scaleIn * scaleOut})`,
      filter: `blur(${blurIn + blurOut}px)`,
    }}>
      {children}
    </AbsoluteFill>
  );
};

// ===== SUBTITLES =====
// Subtitle timings — synced via subtitle-editor tool
const subtitleData = [
  { from: 12, to: 62, text: "Welcome to Smart Trading Club." },
  { from: 88, to: 234, text: "In this tutorial, you'll learn how to copy professional gold trading signals automatically." },
  { from: 236, to: 439, text: "Every trade is executed on-chain on Arbitrum, fully transparent and verifiable." },
  { from: 441, to: 479, text: "Let's get started." },
  { from: 489, to: 553, text: "Before we begin, here's what you'll need." },
  { from: 556, to: 668, text: "First, a MetaMask wallet — it's a free browser extension." },
  { from: 671, to: 798, text: "Second, the Arbitrum network, which our site adds automatically." },
  { from: 800, to: 960, text: "Third, some USDC on Arbitrum — that's the stablecoin used for all trades." },
  { from: 961, to: 1151, text: "And finally, a tiny bit of Ethereum for gas fees — about fifty cents is enough for dozens of transactions." },
  { from: 1153, to: 1236, text: "Step one: connect your wallet." },
  { from: 1238, to: 1338, text: "Click the Connect Wallet button in the top right corner." },
  { from: 1341, to: 1509, text: "MetaMask will ask you to confirm the connection. No funds are moved — it's just a handshake." },
  { from: 1510, to: 1679, text: "The site can now see your address and balances. Make sure you're on the Arbitrum One network." },
  { from: 1680, to: 1786, text: "Step two: approve USDC spending." },
  { from: 1786, to: 1960, text: "This is a one-time approval that lets the smart contract use your USDC when copying trades." },
  { from: 1961, to: 2131, text: "Click Approve in the MetaMask popup. This is standard for every DeFi protocol." },
  { from: 2131, to: 2251, text: "Your funds stay in your wallet until a trade is actually copied." },
  { from: 2252, to: 2337, text: "You can revoke this approval at any time." },
  { from: 2338, to: 2426, text: "Step three: enable auto-copy." },
  { from: 2428, to: 2529, text: "Choose how much USDC you want to invest per trade." },
  { from: 2529, to: 2763, text: "When a new signal is posted, the bot automatically executes the trade for you on gTrade, a decentralized exchange." },
  { from: 2763, to: 2971, text: "When the trade closes, your USDC plus any profit — or minus any loss — returns to your wallet automatically." },
  { from: 2971, to: 3037, text: "Now let's look at the results page." },
  { from: 3037, to: 3266, text: "Every trade is recorded on the Arbitrum blockchain. Anyone can verify the results — it's fully transparent." },
  { from: 3277, to: 3427, text: "You can see the total profit and loss, win rate, and complete trade history." },
  { from: 3427, to: 3584, text: "Each signal shows the entry price, take profit, stop loss, and final result." },
  { from: 3584, to: 3647, text: "Here are some important tips." },
  { from: 3648, to: 3848, text: "Remember, trading involves risk — with twenty-five x leverage, even small moves can mean significant losses." },
  { from: 3848, to: 3980, text: "That's why every trade uses a stop-loss to prevent large losses." },
  { from: 3980, to: 4064, text: "Only invest what you can afford to lose." },
  { from: 4064, to: 4253, text: "Keep enough USDC in your wallet so trades aren't skipped. Keep a small amount of Ethereum for gas fees." },
  { from: 4253, to: 4414, text: "And join our Telegram for real-time notifications on every signal and trade closure." },
  { from: 4414, to: 4497, text: "And that's it — you're all set!" },
  { from: 4497, to: 4700, text: "Connect your wallet, approve USDC, enable auto-copy, and let the bot handle the rest." },
  { from: 4700, to: 4805, text: "Head over to smarttradingclub.io to get started." },
  { from: 4805, to: 4863, text: "See you on the next trade!", fadeOut: true },
];

const Subtitles = () => {
  const frame = useCurrentFrame();
  const current = subtitleData.find(s => frame >= s.from && frame < s.to);
  if (!current) return null;

  const progress = (frame - current.from) / (current.to - current.from);
  const isFadeOut = current.fadeOut;
  const opacity = progress < 0.08 ? progress / 0.08
    : isFadeOut && progress > 0.5 ? interpolate(progress, [0.5, 1], [1, 0])
    : progress > 0.92 ? (1 - progress) / 0.08
    : 1;
  const slideY = progress < 0.1 ? interpolate(progress, [0, 0.1], [8, 0]) : 0;

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%',
      transform: `translateX(-50%) translateY(${slideY}px)`,
      zIndex: 95, textAlign: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        display: 'inline-block', padding: '14px 32px', borderRadius: 14,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(212,168,67,0.1)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      }}>
        <span style={{
          fontSize: 22, fontWeight: 600, color: '#fff', opacity,
          textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 30px rgba(0,0,0,0.3)',
          letterSpacing: 0.3,
        }}>
          {/* Highlight key words in gold */}
          {current.text.split(/(\bSmart Trading Club\b|\bMetaMask\b|\bArbitrum\b|\bUSDS\b|\bUSDC\b|\bauto-copy\b|\bConnect Wallet\b|\bApprove\b|\bP&L\b|\bTelegram\b)/gi).map((part, idx) =>
            /Smart Trading Club|MetaMask|Arbitrum|USDC|auto-copy|Connect Wallet|Approve|P&L|Telegram/i.test(part)
              ? <span key={idx} style={{ color: theme.accent, fontWeight: 700 }}>{part}</span>
              : part
          )}
        </span>
      </div>
    </div>
  );
};

// ===== MAIN COMPOSITION =====
// Scene timing (matched to ~156s voiceover at 30fps = 4680 frames + buffer)
export const HowItWorks = () => (
  <AbsoluteFill style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
    <Background />

    {/* Scene 1: Intro (0-570, ~19s) */}
    <Sequence from={0} durationInFrames={590}>
      <SceneTransition fadeOutStart={550}><IntroScene /></SceneTransition>
    </Sequence>

    {/* Scene 2: Requirements (570-1200, ~21s) */}
    <Sequence from={570} durationInFrames={650}>
      <SceneTransition fadeOutStart={610}><RequirementsScene /></SceneTransition>
    </Sequence>

    {/* Scene 3: Connect Wallet (1200-1680, ~16s) */}
    <Sequence from={1200} durationInFrames={500}>
      <SceneTransition fadeOutStart={460}><ConnectScene /></SceneTransition>
    </Sequence>

    {/* Scene 4: Approve USDC (1680-2180, ~16.7s) — voice says "step 2" at 0:56 */}
    <Sequence from={1680} durationInFrames={500}>
      <SceneTransition fadeOutStart={460}><ApproveScene /></SceneTransition>
    </Sequence>

    {/* Scene 5: Auto-Copy (2160-, ~22s) */}
    <Sequence from={2160} durationInFrames={670}>
      <SceneTransition fadeOutStart={630}><AutoCopyScene /></SceneTransition>
    </Sequence>

    {/* Scene 6: Results (2810-, ~20s) */}
    <Sequence from={2810} durationInFrames={620}>
      <SceneTransition fadeOutStart={580}><ResultsScene /></SceneTransition>
    </Sequence>

    {/* Scene 7: Tips (3410-, ~20s) */}
    <Sequence from={3410} durationInFrames={620}>
      <SceneTransition fadeOutStart={580}><TipsScene /></SceneTransition>
    </Sequence>

    {/* Scene 8: Outro (4010-, ~20s) */}
    <Sequence from={4010} durationInFrames={600}>
      <SceneTransition><OutroScene /></SceneTransition>
    </Sequence>

    {/* Voiceover — single continuous track */}
    <Sequence from={30}>
      <Audio src={staticFile('voiceover/tutorial-voiceover.mp3')} volume={0.9} />
    </Sequence>

    {/* Subtitles */}
    <Subtitles />

    {/* Cinematic letterbox */}
    <Letterbox />

    {/* Progress bar */}
    <ProgressBar />
  </AbsoluteFill>
);

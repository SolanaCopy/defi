import React from 'react';
import {
  useCurrentFrame, useVideoConfig, interpolate, spring,
  Sequence, Easing, AbsoluteFill, Img, staticFile,
} from 'remotion';
import { theme } from './theme.js';
import { HeroCoinScene, GoldBarsScene, ChartScene, ParticleBackground } from './3d/Scene3D.jsx';

// ===== ANIMATION ENGINE =====
const ease = Easing.out(Easing.cubic);
const easeBack = Easing.out(Easing.back(1.4));
const easeInOut = Easing.inOut(Easing.cubic);
const easePow = Easing.out(Easing.poly(4));

const fade = (f, s, d = 12) => interpolate(f, [s, s + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const fadeOut = (f, s, d = 8) => interpolate(f, [s, s + d], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const pop = (f, fps, s) => spring({ frame: f - s, fps, config: { damping: 8, stiffness: 90, mass: 0.6 } });

// Reveal from bottom with scale
const reveal = (frame, start, dur = 25) => ({
  opacity: fade(frame, start, Math.min(dur, 15)),
  transform: `translateY(${interpolate(frame, [start, start + dur], [80, 0], { extrapolateRight: 'clamp', easing: easePow })}px) scale(${interpolate(frame, [start, start + dur], [0.92, 1], { extrapolateRight: 'clamp', easing: easeBack })})`,
});

// Blur reveal
const blurReveal = (frame, start, dur = 20) => ({
  opacity: fade(frame, start, dur),
  filter: `blur(${interpolate(frame, [start, start + dur], [12, 0], { extrapolateRight: 'clamp', easing: ease })}px)`,
  transform: `scale(${interpolate(frame, [start, start + dur], [1.08, 1], { extrapolateRight: 'clamp', easing: ease })})`,
});

// ===== CINEMATIC BACKGROUND =====
const CineBackground = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#020304', overflow: 'hidden' }}>
      {/* Main gold nebula */}
      <div style={{
        position: 'absolute', width: 1200, height: 1200, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(212,168,67,${0.18 * intensity}), rgba(212,168,67,0.02) 50%, transparent 70%)`,
        left: -300 + Math.sin(frame / 120) * 60,
        top: -400 + Math.cos(frame / 100) * 50,
        filter: 'blur(80px)',
      }} />
      {/* Secondary orb */}
      <div style={{
        position: 'absolute', width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(240,208,120,${0.06 * intensity}), transparent 60%)`,
        right: -200 + Math.cos(frame / 90) * 40,
        bottom: -300 + Math.sin(frame / 110) * 35,
        filter: 'blur(100px)',
      }} />
      {/* Accent blue tint */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.04), transparent 60%)',
        left: '40%', top: '30%', filter: 'blur(120px)',
      }} />

      {/* Floating dust */}
      {Array.from({ length: 40 }).map((_, i) => {
        const x = (i * 97.3 + 17) % 100;
        const speed = 0.06 + (i % 7) * 0.025;
        const y = ((i * 61.7 + 33) % 100 + frame * speed) % 120 - 10;
        const size = 1 + (i % 5) * 0.6;
        const op = interpolate(y, [0, 20, 80, 110], [0, 0.35, 0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            width: size, height: size, borderRadius: '50%',
            background: i % 3 === 0 ? theme.accentLight : theme.accent,
            opacity: op * 0.3,
            boxShadow: `0 0 ${size * 6}px rgba(212,168,67,0.15)`,
          }} />
        );
      })}

      {/* Film grain */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
      }} />
    </AbsoluteFill>
  );
};

// ===== TEXT REVEAL (word by word) =====
const WordReveal = ({ text, frame, start, interval = 4, style }) => {
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((w, i) => (
        <span key={i} style={{
          display: 'inline-block', marginRight: '0.3em',
          opacity: fade(frame, start + i * interval, 6),
          transform: `translateY(${interpolate(frame, [start + i * interval, start + i * interval + 8], [20, 0], { extrapolateRight: 'clamp', easing: ease })}px)`,
        }}>{w}</span>
      ))}
    </span>
  );
};

// ===== COUNTER =====
const Counter = ({ frame, start, to, dur = 45, prefix = '', suffix = '', decimals = 0, style }) => {
  const val = interpolate(frame, [start, start + dur], [0, to], { extrapolateRight: 'clamp', easing: easeInOut });
  return <span style={style}>{prefix}{val.toFixed(decimals)}{suffix}</span>;
};

// ===== GLOW PULSE =====
const GlowPulse = ({ frame, color = theme.accent, size = 300 }) => (
  <div style={{
    position: 'absolute', width: size, height: size, borderRadius: '50%',
    background: `radial-gradient(circle, ${color}30, transparent 60%)`,
    opacity: 0.5 + Math.sin(frame / 6) * 0.3,
    filter: 'blur(40px)', pointerEvents: 'none',
    left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  }} />
);

// ===================================================================
// SCENE 1: COLD OPEN — One powerful line (0-90)
// ===================================================================
const ColdOpen = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: Math.min(1, fadeOut(frame, 72)),
    }}>
      {/* 3D Gold coin behind text */}
      <HeroCoinScene />

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        {/* Main text */}
        <div style={{
          fontSize: 120, fontWeight: 900, lineHeight: 0.9, letterSpacing: -5,
          ...blurReveal(frame, 10, 25),
        }}>
          <span style={{
            background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentLight} 40%, ${theme.accent} 80%)`,
            backgroundSize: '200% 100%',
            backgroundPosition: `${interpolate(frame, [10, 70], [100, 0], { extrapolateRight: 'clamp' })}% 0`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>GOLD</span>
        </div>

        <div style={{
          fontSize: 120, fontWeight: 900, lineHeight: 0.9, letterSpacing: -5,
          color: theme.text,
          ...blurReveal(frame, 18, 25),
        }}>
          TRADING
        </div>

        {/* Accent line */}
        <div style={{
          width: interpolate(frame, [35, 55], [0, 300], { extrapolateRight: 'clamp', easing: ease }),
          height: 4, borderRadius: 2, margin: '20px auto',
          background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
        }} />

        <div style={{
          fontSize: 28, fontWeight: 500, color: 'rgba(255,255,255,0.4)', letterSpacing: 8, textTransform: 'uppercase',
          ...blurReveal(frame, 40, 20),
        }}>
          On Autopilot
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 2: THE PITCH — Fast impactful lines (90-220)
// ===================================================================
const PitchScene = () => {
  const frame = useCurrentFrame();

  const lines = [
    { text: 'Professional signals', start: 5 },
    { text: 'Copied automatically', start: 25 },
    { text: 'Verified on-chain', start: 45 },
  ];

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: Math.min(fade(frame, 0), fadeOut(frame, 110)),
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          fontSize: 58, fontWeight: 700, marginBottom: 14, textAlign: 'center',
          color: i === 2 ? theme.accent : theme.text,
          ...reveal(frame, line.start, 20),
        }}>
          {line.text}
        </div>
      ))}

      {/* Decorative elements */}
      <div style={{
        position: 'absolute', bottom: 120, display: 'flex', gap: 40,
        opacity: fade(frame, 75),
      }}>
        {['XAU/USD', 'Arbitrum', '25x Leverage', 'USDC'].map((tag, i) => (
          <div key={tag} style={{
            padding: '8px 20px', borderRadius: 10,
            border: `1px solid rgba(212,168,67,0.15)`, background: 'rgba(212,168,67,0.04)',
            color: 'rgba(212,168,67,0.6)', fontSize: 14, fontWeight: 600, letterSpacing: 1,
            ...reveal(frame, 78 + i * 5, 12),
          }}>{tag}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 3: BIG NUMBER — +40.3% PnL (220-370)
// ===================================================================
const BigNumberScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: Math.min(fade(frame, 0), fadeOut(frame, 130)),
    }}>
      {/* 3D Chart background */}
      <ChartScene />

      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: 5, textTransform: 'uppercase',
        color: 'rgba(52,211,153,0.6)', marginBottom: 16, zIndex: 2, position: 'relative',
        ...reveal(frame, 5),
      }}>
        Total Performance
      </div>

      {/* Giant number */}
      <div style={{
        fontSize: 160, fontWeight: 900, lineHeight: 1, color: theme.success, letterSpacing: -6,
        textShadow: `0 0 80px rgba(52,211,153,0.3), 0 0 160px rgba(52,211,153,0.1)`,
        zIndex: 2, position: 'relative',
        ...blurReveal(frame, 12, 30),
      }}>
        <Counter frame={frame} start={15} to={40.3} dur={50} prefix="+" suffix="%" decimals={1} />
      </div>

      <div style={{
        fontSize: 18, color: 'rgba(255,255,255,0.3)', marginTop: 10, letterSpacing: 3,
        zIndex: 2, position: 'relative',
        ...reveal(frame, 50),
      }}>
        VERIFIED ON ARBITRUM
      </div>

      {/* Sub stats */}
      <div style={{ display: 'flex', gap: 50, marginTop: 50, zIndex: 2, position: 'relative' }}>
        {[
          { val: 17, suf: '', label: 'Trades', color: theme.text },
          { val: 52.9, suf: '%', label: 'Win Rate', color: theme.accent, dec: 1 },
          { val: 565, suf: '', label: 'Volume', color: theme.text, pre: '$' },
          { val: 5, suf: '', label: 'Copiers', color: theme.text },
        ].map((s, i) => (
          <div key={s.label} style={{
            textAlign: 'center',
            ...reveal(frame, 65 + i * 8),
          }}>
            <div style={{ fontSize: 38, fontWeight: 800, color: s.color }}>
              <Counter frame={frame} start={65 + i * 8} to={s.val} dur={35}
                prefix={s.pre || ''} suffix={s.suf} decimals={s.dec || 0} />
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6, letterSpacing: 2, textTransform: 'uppercase' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 4: PLATFORM SHOWCASE — Cinematic screenshots (370-560)
// ===================================================================
const ShowcaseScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slow Ken Burns zoom on screenshots
  const dashScale = interpolate(frame, [0, 190], [1, 1.08], { extrapolateRight: 'clamp', easing: easeInOut });
  const resScale = interpolate(frame, [70, 190], [1, 1.06], { extrapolateRight: 'clamp', easing: easeInOut });
  const showResults = frame > 80;

  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: Math.min(fade(frame, 0, 20), fadeOut(frame, 170)),
    }}>
      <div style={{ position: 'relative', width: 1500, height: 850 }}>
        {/* Dashboard — primary */}
        <div style={{
          position: 'absolute',
          left: showResults ? 0 : 80,
          top: showResults ? 80 : 40,
          width: showResults ? 850 : 1050,
          borderRadius: 20, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.7)',
          opacity: fade(frame, 5, 20),
          transform: `scale(${dashScale}) perspective(1500px) rotateY(${showResults ? 4 : 0}deg)`,
          transition: 'all 0.8s cubic-bezier(0.25, 0.1, 0.25, 1)',
          zIndex: 1,
        }}>
          <Img src={staticFile('dashboard.png')} style={{ width: '100%', display: 'block' }} />
          {/* Reflection */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
          }} />
        </div>

        {/* Results — slides in */}
        {showResults && (
          <div style={{
            position: 'absolute', right: 0, top: 20,
            width: 850, borderRadius: 20, overflow: 'hidden',
            border: '1px solid rgba(212,168,67,0.12)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.7), 0 0 60px rgba(212,168,67,0.04)',
            transform: `scale(${resScale}) perspective(1500px) rotateY(-3deg) translateX(${interpolate(frame, [80, 115], [100, 0], { extrapolateRight: 'clamp', easing: ease })}px)`,
            opacity: fade(frame, 82, 20),
            zIndex: 2,
          }}>
            <Img src={staticFile('results.png')} style={{ width: '100%', display: 'block' }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 50%)',
            }} />
          </div>
        )}

        {/* Floating labels */}
        <div style={{
          position: 'absolute', left: 20, bottom: showResults ? 10 : 40,
          padding: '10px 22px', borderRadius: 12,
          background: 'rgba(5,7,9,0.9)', border: `1px solid ${theme.borderAccent}`,
          backdropFilter: 'blur(20px)', zIndex: 5,
          opacity: fade(frame, 20),
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>Dashboard</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>Live positions & auto-copy</span>
        </div>

        {showResults && (
          <div style={{
            position: 'absolute', right: 20, bottom: 10,
            padding: '10px 22px', borderRadius: 12,
            background: 'rgba(5,7,9,0.9)', border: `1px solid ${theme.borderAccent}`,
            backdropFilter: 'blur(20px)', zIndex: 5,
            opacity: fade(frame, 100),
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: theme.accent }}>Results</span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>Verified on-chain</span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 5: 3 STEPS — Minimal & clean (560-740)
// ===================================================================
const StepsScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = [
    { num: '01', icon: '🔗', word: 'Connect', time: 10 },
    { num: '02', icon: '⚡', word: 'Copy', time: 50 },
    { num: '03', icon: '💰', word: 'Earn', time: 90 },
  ];

  const activeIdx = frame < 45 ? 0 : frame < 85 ? 1 : 2;

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: Math.min(fade(frame, 0), fadeOut(frame, 160)),
    }}>
      {/* 3D particle background */}
      <ParticleBackground opacity={0.25} count={150} />

      {/* Section title */}
      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: 5, color: 'rgba(212,168,67,0.5)',
        textTransform: 'uppercase', marginBottom: 50, zIndex: 2, position: 'relative',
        ...reveal(frame, 3),
      }}>
        How It Works
      </div>

      <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
        {steps.map((s, i) => {
          const isActive = i === activeIdx;
          const scale = isActive ? 1.08 : 1;
          const glowOpacity = isActive ? 0.15 + Math.sin(frame / 5) * 0.05 : 0;

          return (
            <React.Fragment key={s.num}>
              {i > 0 && (
                <div style={{
                  width: 60, height: 2,
                  background: i <= activeIdx
                    ? `linear-gradient(90deg, ${theme.accent}, ${theme.accent}60)`
                    : 'rgba(255,255,255,0.05)',
                  opacity: fade(frame, s.time - 15),
                  borderRadius: 1,
                }} />
              )}

              <div style={{
                width: 280, textAlign: 'center', position: 'relative',
                ...reveal(frame, s.time, 22),
              }}>
                {/* Glow behind */}
                {isActive && (
                  <div style={{
                    position: 'absolute', left: '50%', top: '50%',
                    width: 200, height: 200, borderRadius: '50%',
                    background: `radial-gradient(circle, ${theme.accent}20, transparent 70%)`,
                    transform: 'translate(-50%, -60%)', opacity: glowOpacity,
                    filter: 'blur(30px)',
                  }} />
                )}

                {/* Number */}
                <div style={{
                  fontSize: 13, fontWeight: 800, letterSpacing: 5,
                  color: isActive ? theme.accent : 'rgba(255,255,255,0.15)',
                  marginBottom: 16, transition: 'color 0.3s',
                }}>{s.num}</div>

                {/* Icon circle */}
                <div style={{
                  width: 90, height: 90, borderRadius: 28, margin: '0 auto 18px',
                  background: isActive ? `${theme.accent}12` : 'rgba(255,255,255,0.02)',
                  border: `2px solid ${isActive ? `${theme.accent}50` : 'rgba(255,255,255,0.04)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38,
                  boxShadow: isActive ? `0 0 40px ${theme.accentGlow}` : 'none',
                  transform: `scale(${scale})`, transition: 'all 0.3s',
                }}>{s.icon}</div>

                {/* Word */}
                <div style={{
                  fontSize: 34, fontWeight: 800,
                  color: isActive ? theme.text : 'rgba(255,255,255,0.25)',
                  transition: 'color 0.3s',
                }}>{s.word}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom tagline */}
      <div style={{
        marginTop: 50, fontSize: 18, color: 'rgba(255,255,255,0.3)',
        ...reveal(frame, 120),
      }}>
        Set it once. Earn on every signal.
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 6: TRUST STRIP (740-870)
// ===================================================================
const TrustScene = () => {
  const frame = useCurrentFrame();

  const items = [
    { icon: '🔗', text: 'On-Chain Verified' },
    { icon: '🛡️', text: 'Non-Custodial' },
    { icon: '📊', text: 'Public Results' },
    { icon: '🤖', text: 'Fully Automated' },
    { icon: '⛓️', text: 'Arbitrum L2' },
  ];

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: Math.min(fade(frame, 0), fadeOut(frame, 110)),
    }}>
      <div style={{
        fontSize: 48, fontWeight: 800, color: theme.text, textAlign: 'center', marginBottom: 10,
        ...blurReveal(frame, 5, 22),
      }}>
        Built on <span style={{
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Trust</span>
      </div>

      <div style={{
        fontSize: 18, color: 'rgba(255,255,255,0.3)', marginBottom: 50,
        ...reveal(frame, 20),
      }}>
        Every trade. Every result. Verified on the blockchain.
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {items.map((item, i) => (
          <div key={item.text} style={{
            padding: '20px 30px', borderRadius: 18,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
            textAlign: 'center',
            ...reveal(frame, 30 + i * 8, 18),
          }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>{item.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
              {item.text}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ===================================================================
// SCENE 7: CTA — Final screen (870-1020)
// ===================================================================
const CTAScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center',
    }}>
      {/* 3D Gold bars background */}
      <GoldBarsScene />

      {/* Epic glow */}
      <div style={{
        position: 'absolute', left: '50%', top: '40%',
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${theme.accent}25, transparent 60%)`,
        transform: 'translate(-50%, -50%)',
        opacity: interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' }),
        filter: 'blur(60px)', zIndex: 1,
      }} />

      {/* Logo */}
      <div style={{ ...blurReveal(frame, 5, 20), marginBottom: 28, zIndex: 2, position: 'relative' }}>
        <Img src={staticFile('logo.png')} style={{
          width: 90, height: 90, borderRadius: 24,
          boxShadow: `0 0 60px ${theme.accentGlow}`,
        }} />
      </div>

      {/* Brand name */}
      <div style={{
        fontSize: 72, fontWeight: 900, lineHeight: 1, letterSpacing: -2, marginBottom: 16,
        zIndex: 2, position: 'relative',
        ...blurReveal(frame, 15, 25),
      }}>
        <span style={{
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Smart Trading Club</span>
      </div>

      <div style={{
        fontSize: 20, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 44,
        zIndex: 2, position: 'relative',
        ...reveal(frame, 30),
      }}>
        Professional Gold Trading · Fully Automated · On-Chain
      </div>

      {/* CTA Button */}
      <div style={{
        padding: '22px 60px', borderRadius: 18, zIndex: 2, position: 'relative',
        background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
        fontSize: 22, fontWeight: 800, color: theme.bg, letterSpacing: 0.5,
        boxShadow: `0 8px 50px rgba(212,168,67,0.3), 0 0 100px rgba(212,168,67,0.1)`,
        transform: `scale(${pop(frame, fps, 42)})`,
        opacity: fade(frame, 40),
      }}>
        Start Trading Now →
      </div>

      {/* URL */}
      <div style={{
        marginTop: 22, fontSize: 18, fontWeight: 600,
        color: theme.accent, letterSpacing: 1.5, zIndex: 2, position: 'relative',
        opacity: fade(frame, 55),
      }}>
        smarttradingclub.io
      </div>
    </AbsoluteFill>
  );
};

// ===== MAIN =====
export const PromoClip = () => (
  <AbsoluteFill style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
    <CineBackground />
    <Sequence from={0} durationInFrames={100}><ColdOpen /></Sequence>
    <Sequence from={90} durationInFrames={140}><PitchScene /></Sequence>
    <Sequence from={220} durationInFrames={160}><BigNumberScene /></Sequence>
    <Sequence from={370} durationInFrames={200}><ShowcaseScene /></Sequence>
    <Sequence from={560} durationInFrames={190}><StepsScene /></Sequence>
    <Sequence from={740} durationInFrames={140}><TrustScene /></Sequence>
    <Sequence from={870} durationInFrames={150}><CTAScene /></Sequence>
  </AbsoluteFill>
);

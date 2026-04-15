import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#0a0a0a',
        color: '#f5f5f5',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '24px', marginBottom: '12px' }}>Something went wrong</h1>
        <p style={{ color: '#a3a3a3', marginBottom: '24px', maxWidth: '480px' }}>
          The page hit an unexpected error. Please reload — your wallet and on-chain state are unaffected.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #eab308, #ca8a04)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Reload
        </button>
        {import.meta.env?.DEV && (
          <pre style={{
            marginTop: '24px',
            padding: '12px',
            background: '#171717',
            color: '#ef4444',
            borderRadius: '6px',
            maxWidth: '720px',
            overflow: 'auto',
            fontSize: '12px',
            textAlign: 'left',
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}

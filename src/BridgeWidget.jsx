// Bridge widget — isolated in its own module so Vite can code-split it.
//
// @lifi/widget drags in MUI, wagmi, Solana and Sui wallet adapters (~2.5 MB
// of the bundle). It is only ever rendered inside the bridge modal, so it must
// never be part of the initial page load. Keep every LI.FI / react-query
// import in this file — importing any of them from App.jsx pulls the whole
// chunk back into the main bundle.
import React from 'react';
import { LiFiWidget } from '@lifi/widget';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

const WIDGET_CONFIG = {
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
};

export default function BridgeWidget() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiFiWidget integrator="smart-goldbot" config={WIDGET_CONFIG} />
    </QueryClientProvider>
  );
}

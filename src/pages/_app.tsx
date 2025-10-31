import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { ToastProvider } from '@/contexts/ToastContext';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Component {...pageProps} />
    </ToastProvider>
  );
}


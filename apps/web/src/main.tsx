import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth-context';
import { App } from './App';
import './styles.css';
import './intelligence.css';

const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({ onSuccess: () => { void queryClient.invalidateQueries(); } }),
  defaultOptions: { queries: { staleTime: 20_000, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>,
);

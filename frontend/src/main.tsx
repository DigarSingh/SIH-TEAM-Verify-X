import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { createQueryClient } from './api/queryClient';
import { ErrorBoundary } from './components/domain/ErrorBoundary';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { AuthProvider } from './hooks/useAuth';
import { registerServiceWorker } from './offline/register';
import { AppRoutes } from './routes';
import './index.css';

const queryClient = createQueryClient();

// The offline layer: caches the app shell and saved courses, and lets writes queue while the network is away.
registerServiceWorker();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <ErrorBoundary fullPage>
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

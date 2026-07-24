import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { useState, useCallback, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import AccountPage from './pages/account';
import WelcomePage from './pages/welcome';
import { SubscriptionProvider, initializeRevenueCat } from '@/lib/revenuecat';
import { queryClient } from '@/lib/queryClient';
import { BiometricLockProvider } from '@/context/BiometricLockContext';

// ── Initialise RevenueCat once at startup ────────────────────────────────────
try {
  initializeRevenueCat().catch((err) =>
    console.warn("[RevenueCat] Init error (non-fatal):", err)
  );
} catch (err) {
  console.warn("[RevenueCat] Init error (non-fatal):", err);
}

// ── First-launch welcome ──────────────────────────────────────────────────────
const ENTERED_KEY = "garden-entered";

function hasEntered(): boolean {
  try {
    return (
      sessionStorage.getItem(ENTERED_KEY) === "1" ||
      new URLSearchParams(window.location.search).get("preview") === "1"
    );
  } catch {
    return false;
  }
}

function markEntered() {
  try { sessionStorage.setItem(ENTERED_KEY, "1"); } catch {}
}

// ── Router ────────────────────────────────────────────────────────────────────
function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/"         component={WardrobePage}  />
        <Route path="/generate" component={GeneratePage}  />
        <Route path="/saved"    component={SavedPage}     />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/account"  component={AccountPage}   />
        <Redirect to="/" />
      </Switch>
    </AppLayout>
  );
}

// ── App shell — shows welcome on first session, then the app ─────────────────
function AppShell() {
  const [entered, setEntered] = useState<boolean>(hasEntered);

  const handleEnter = useCallback(() => {
    markEntered();
    setEntered(true);
  }, []);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      {entered ? (
        <Router />
      ) : (
        <WelcomePage onEnter={handleEnter} />
      )}
    </WouterRouter>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SubscriptionProvider>
        <BiometricLockProvider>
          <AppShell />
        </BiometricLockProvider>
      </SubscriptionProvider>
    </QueryClientProvider>
  );
}

export default App;

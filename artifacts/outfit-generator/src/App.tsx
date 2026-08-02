import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { useState, useCallback } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import AccountPage from './pages/account';
import WelcomePage from './pages/welcome';
import { SubscriptionProvider } from '@/lib/revenuecat';
import { queryClient } from '@/lib/queryClient';
import { migrateCategories } from '@/lib/localDB';
import { useVisionIndexer } from '@/hooks/useVisionIndexer';

// RevenueCat is initialised in main.tsx before React mounts — no duplicate call here.

// ── Migrate legacy category keys (outfits→tools, beauty→landscaping, etc.) ───
migrateCategories().catch((err) =>
  console.warn("[DB] Category migration error (non-fatal):", err)
);

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
      {/* App always mounts behind the splash so it's live when the gates open */}
      <Router />
      {!entered && <WelcomePage onEnter={handleEnter} />}
    </WouterRouter>
  );
}

// ── Background photo indexer + toast ─────────────────────────────────────────
function VisionIndexer() {
  const { isIndexing } = useVisionIndexer();
  if (!isIndexing) return null;
  return (
    <div className="fixed bottom-24 inset-x-0 flex justify-center z-[90] pointer-events-none">
      <div className="px-4 py-2 bg-black/75 text-white text-xs font-bold rounded-full backdrop-blur-sm shadow-lg">
        Preparing photo search…
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SubscriptionProvider>
        <VisionIndexer />
        <AppShell />
      </SubscriptionProvider>
    </QueryClientProvider>
  );
}

export default App;

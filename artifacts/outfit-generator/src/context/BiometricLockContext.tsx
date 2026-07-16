/**
 * BiometricLockContext
 *
 * Rules:
 *  - Default is OFF. No biometric prompt fires unless the user has explicitly
 *    enabled the lock (localStorage flag = "true").
 *  - checkBiometryAvailable() is intentionally NOT called here — it triggers
 *    the iOS Face ID permission dialog. That check is deferred to the Settings
 *    page, only when the user navigates there.
 *  - On app launch: if lock is ON, show LockedScreen and auto-prompt.
 *  - On foreground resume: same.
 *  - setLockEnabled: always requires a successful auth before persisting.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { authenticate } from "@/lib/biometric";
import { LockedScreen } from "@/components/LockedScreen";

const STORAGE_KEY = "biometric-lock-enabled";

interface BiometricLockContextType {
  isLockEnabled: boolean;
  /** Toggle lock on/off. Requires successful auth. Returns true if changed. */
  setLockEnabled: (enabled: boolean) => Promise<boolean>;
}

const BiometricLockContext = createContext<BiometricLockContextType>({
  isLockEnabled: false,
  setLockEnabled: async () => false,
});

export function useBiometricLock() {
  return useContext(BiometricLockContext);
}

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function BiometricLockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // isLockEnabled: has the user turned the lock on?
  const [isLockEnabled, setIsLockEnabled] = useState<boolean>(readStoredEnabled);
  // isLocked: should the LockedScreen be shown right now?
  // Starts locked only if the user previously enabled the setting.
  const [isLocked, setIsLocked] = useState<boolean>(readStoredEnabled);
  const [isPending, setIsPending] = useState(false);

  // Ref so the appStateChange closure always sees the latest value
  const lockEnabledRef = useRef(isLockEnabled);
  lockEnabledRef.current = isLockEnabled;

  // ── Auth helper ────────────────────────────────────────────────────────────
  const triggerAuth = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    const ok = await authenticate("Unlock My Suitcase");
    setIsPending(false);
    if (ok) setIsLocked(false);
  }, [isPending]);

  // ── On launch: auto-prompt if we're starting locked ───────────────────────
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    // Only fires if the user previously enabled the lock; otherwise isLocked
    // is false and nothing happens — no Face ID prompt on a fresh install.
    if (isLocked) {
      setTimeout(() => triggerAuth(), 300);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-lock when app returns from background ───────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let wentToBackground = false;

    const listenerPromise = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        wentToBackground = true;
      } else if (wentToBackground) {
        wentToBackground = false;
        if (lockEnabledRef.current) {
          setIsLocked(true);
          setIsPending(false);
          setTimeout(async () => {
            setIsPending(true);
            const ok = await authenticate("Unlock My Suitcase");
            setIsPending(false);
            if (ok) setIsLocked(false);
          }, 300);
        }
      }
    });

    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings toggle ────────────────────────────────────────────────────────
  const setLockEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      const reason = enabled
        ? "Enable Face ID / Touch ID lock"
        : "Disable Face ID / Touch ID lock";
      const ok = await authenticate(reason);
      if (!ok) return false;

      setIsLockEnabled(enabled);
      lockEnabledRef.current = enabled;
      try {
        localStorage.setItem(STORAGE_KEY, String(enabled));
      } catch {}
      if (!enabled) setIsLocked(false);
      return true;
    },
    [],
  );

  return (
    <BiometricLockContext.Provider value={{ isLockEnabled, setLockEnabled }}>
      {isLocked ? (
        <LockedScreen onTryAgain={triggerAuth} isPending={isPending} />
      ) : (
        children
      )}
    </BiometricLockContext.Provider>
  );
}

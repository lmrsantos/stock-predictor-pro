import { useEffect, useState } from "react";
import { Smartphone, Download, Share, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const MOMENT_URL = "https://www.quant-forecast.com/moment";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Quant Moment is an installable PWA (manifest at /manifest.webmanifest,
 * start_url /moment). This component surfaces that install path to visitors.
 *
 * - Android / desktop Chrome & Edge fire `beforeinstallprompt`; we capture it
 *   and trigger the native install sheet on click.
 * - iOS Safari never fires that event. There we show a short "Share → Add to
 *   Home Screen" walkthrough instead.
 * - When already running standalone (installed), the affordance hides.
 */
export function InstallQuantMoment({
  variant = "pill",
}: {
  variant?: "pill" | "cta";
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  // iOS Chrome still uses Safari WebKit; the install gesture is the Safari one.

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS exposes a standalone flag Safari sets.
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already installed — nothing to offer.
  if (isStandalone || installed) return null;

  // Android / desktop Chromium: show the install pill once we have a prompt.
  if (deferred && !isIos) {
    const onClick = async () => {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
    };
    if (variant === "pill") {
      return (
        <button
          onClick={onClick}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Download className="h-4 w-4" />
          Install app
        </button>
      );
    }
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
      >
        <Download className="h-4 w-4" />
        Install Quant Moment on your phone
      </button>
    );
  }

  // iOS Safari: no native prompt — open the Share → Add to Home Screen sheet.
  if (isIos) {
    const open = () => setShowIosSheet(true);
    if (variant === "pill") {
      return (
        <>
          <button
            onClick={open}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Download className="h-4 w-4" />
            Install app
          </button>
          {showIosSheet && (
            <IosSheet onClose={() => setShowIosSheet(false)} />
          )}
        </>
      );
    }
    return (
      <>
        <button
          onClick={open}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <Download className="h-4 w-4" />
          Add Quant Moment to your Home Screen
        </button>
        {showIosSheet && <IosSheet onClose={() => setShowIosSheet(false)} />}
      </>
    );
  }

  // Desktop / other browsers without a prompt: show a QR code so the visitor
  // can open /moment on their phone and install it there.
  if (variant === "pill") {
    return (
      <>
        <button
          onClick={() => setShowIosSheet(true)}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Smartphone className="h-4 w-4" />
          Get the mobile app
        </button>
        {showIosSheet && <QrSheet onClose={() => setShowIosSheet(false)} />}
      </>
    );
  }
  return (
    <>
      <button
        onClick={() => setShowIosSheet(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
      >
        <Smartphone className="h-4 w-4" />
        Get Quant Moment on your phone
      </button>
      {showIosSheet && <QrSheet onClose={() => setShowIosSheet(false)} />}
    </>
  );
}

function QrSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xs flex-col overflow-y-auto rounded-2xl bg-card p-5 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <QrCode className="h-5 w-5 shrink-0 text-primary" />
          <h3 className="text-base font-semibold">Get Quant Moment on your phone</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Scan this with your phone camera, then add Quant Moment to your Home
          Screen.
        </p>
        <div className="mx-auto mb-4 flex shrink-0 justify-center rounded-xl bg-white p-3">
          <QRCodeSVG value={MOMENT_URL} size={160} level="M" />
        </div>
        <p className="mb-4 text-center text-xs text-muted-foreground">
          On Android, tap “Install app.” On iPhone, tap Share → Add to Home
          Screen.
        </p>
        <button
          onClick={onClose}
          className="w-full shrink-0 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function IosSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-y-auto rounded-2xl bg-card p-5 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Add Quant Moment to Home Screen</h3>
        </div>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">1.</span>
            <span>
              Tap the{" "}
              <span className="inline-flex items-center gap-1 align-middle font-medium text-foreground">
                <Share className="h-4 w-4" /> Share
              </span>{" "}
              button in Safari's toolbar.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">2.</span>
            <span>
              Choose{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-foreground">3.</span>
            <span>
              Tap <span className="font-medium text-foreground">Add</span>. Quant
              Moment launches from its own icon, full screen.
            </span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

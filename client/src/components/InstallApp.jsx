import { useEffect, useState } from "react";
import { FiDownload } from "react-icons/fi";

const InstallApp = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const aiStatusHandler = (e) => {
      setIsAiOpen(e.detail.open);
    };

    // Listen for app installed event
    const appInstalledHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("AI_STATUS", aiStatusHandler);
    window.addEventListener("appinstalled", appInstalledHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("AI_STATUS", aiStatusHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      console.log("App installed successfully");
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
  };

  // Hide if app is installed or AI is open
  if (isInstalled || isAiOpen) {
    return null;
  }

  // Hide if no install prompt available (on desktop browsers without support)
  if (!deferredPrompt) {
    return null;
  }

  return (
    <button
      onClick={installApp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="Install PPG HUB application"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        padding: "12px 18px",
        background: isHovered ? "#0284c7" : "#0ea5e9",
        color: "white",
        border: "none",
        borderRadius: "10px",
        fontWeight: "600",
        fontSize: "14px",
        cursor: "pointer",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        boxShadow: "0 4px 12px rgba(14, 165, 233, 0.4)",
        transition: "all 0.3s ease",
        transform: isHovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <FiDownload size={18} />
      Install App
    </button>
  );
};

export default InstallApp;

(() => {
  function createContentRuntime({ hostId, storageKey, captureCountKey, bridge }) {
    function shouldInstallBrowserBridge() {
      if (typeof chrome === "undefined" || !document.documentElement || !chrome.runtime?.id) return false;
      if (!/^(https?:|file:)/.test(location.protocol)) return false;
      if (/^(127\.0\.0\.1|localhost):1420$/.test(location.host)) return false;
      return true;
    }

    function syncDesktopPetVisibility() {
      bridge.setDesktopPetHidden(document.visibilityState === "visible" && document.hasFocus());
    }

    function dedupeFloatingHosts() {
      if (!document.documentElement) return true;

      const hosts = Array.from(document.querySelectorAll(`#${hostId}`));
      hosts.slice(1).forEach((node) => node.remove());
      return hosts.length > 0;
    }

    function removeFloatingHosts() {
      if (!document.documentElement) return;
      document.querySelectorAll(`#${hostId}`).forEach((node) => node.remove());
    }

    function readStoredPosition() {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(storageKey, (result) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }

            resolve(result?.[storageKey] || null);
          });
        } catch {
          resolve(null);
        }
      });
    }

    function readStoredCaptureCount() {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(captureCountKey, (result) => {
            void chrome.runtime.lastError;
            resolve(result?.[captureCountKey] || 0);
          });
        } catch {
          resolve(0);
        }
      });
    }

    function saveStoredPosition(position) {
      try {
        chrome.storage.local.set(
          {
            [storageKey]: {
              x: Math.round(position.x),
              y: Math.round(position.y)
            }
          },
          () => {
            void chrome.runtime.lastError;
          }
        );
      } catch {
        // Position persistence is a convenience; capture still works without it.
      }
    }

    return {
      dedupeFloatingHosts,
      readStoredCaptureCount,
      readStoredPosition,
      removeFloatingHosts,
      saveStoredPosition,
      shouldInstallBrowserBridge,
      syncDesktopPetVisibility
    };
  }

  function isValidPosition(position) {
    return Number.isFinite(position?.x) && Number.isFinite(position?.y);
  }

  globalThis.TinyBuContentRuntime = {
    createContentRuntime,
    isValidPosition
  };
})();

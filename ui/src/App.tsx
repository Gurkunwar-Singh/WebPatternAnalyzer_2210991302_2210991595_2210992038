import React, { useState, useRef, useEffect } from "react";
import { ApiResponse } from "./types";
import OverviewPanel from "./components/panels/OverviewPanel";
import ColorsPanel from "./components/panels/ColorsPanel";
import TypographyPanel from "./components/panels/TypographyPanel";
import AccessibilityPanel from "./components/panels/AccessibilityPanel";
import ContentPanel from "./components/panels/ContentPanel";
import LayoutPanel from "./components/panels/LayoutPanel";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Helper functions
function formatColor(c: string): string {
  if (!c) return "—";
  if (c.startsWith("oklch")) return c.slice(0, 22) + "…";
  return c;
}

function wcagLabel(r: number): { text: string; cls: string } {
  if (r >= 7) return { text: "AAA", cls: "badge-aaa" };
  if (r >= 4.5) return { text: "AA", cls: "badge-aa" };
  return { text: "Fail", cls: "badge-fail" };
}

// Toast Component
const Toast: React.FC<{ message: string; type: "success" | "error" | "info"; onClose: () => void }> = ({ 
  message, 
  type, 
  onClose 
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 10L9 12.5L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    error: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 7L13 13M13 7L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    info: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 14V9M10 6V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <div className={`wpa-toast wpa-toast-${type}`}>
      <span className="wpa-toast-icon">{icons[type]}</span>
      <span className="wpa-toast-message">{message}</span>
      <button className="wpa-toast-close" onClick={onClose}>×</button>
    </div>
  );
};

// Health Status Modal/Card Component
const HealthStatusCard: React.FC<{ status: string | null; onClose: () => void }> = ({ status, onClose }) => {
  const isHealthy = status?.toLowerCase().includes("ok") || status?.toLowerCase().includes("healthy");
  
  return (
    <div className="wpa-health-overlay" onClick={onClose}>
      <div className="wpa-health-card" onClick={(e) => e.stopPropagation()}>
        <button className="wpa-health-close" onClick={onClose}>×</button>
        <div className={`wpa-health-icon ${isHealthy ? "healthy" : "unhealthy"}`}>
          {isHealthy ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
              <path d="M16 24L22 30L33 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
              <path d="M18 18L30 30M30 18L18 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <h3 className="wpa-health-title">
          {isHealthy ? "Backend is Online" : "Backend Connection Issue"}
        </h3>
        <p className="wpa-health-message">
          {status || (isHealthy ? "All systems operational" : "Unable to connect to the analysis server")}
        </p>
        <div className="wpa-health-pulse">
          <span className={`wpa-pulse-dot ${isHealthy ? "pulse-green" : "pulse-red"}`} />
          {isHealthy ? "Active" : "Inactive"}
        </div>
        <button className="wpa-health-dismiss" onClick={onClose}>Dismiss</button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [url, setUrl] = useState<string>("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [tab, setTab] = useState<string>("overview");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking" | "unknown">("checking");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    checkInitialHealth();
    // Auto-check every 30 seconds
    const interval = setInterval(checkInitialHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkInitialHealth = async () => {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const newStatus = res.ok ? "online" : "offline";
    
    if (newStatus !== backendStatus) {
      showToast(res.ok ? "Server is online!" : "Server went offline.", res.ok ? "success" : "error");
    }
    setBackendStatus(newStatus);
  } catch {
    if (backendStatus !== "offline") {
      showToast("Cannot connect to Server.", "error");
    }
    setBackendStatus("offline");
  }
};

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const analyze = async () => {
    // Prevent analysis if backend is offline
    if (backendStatus !== "online") {
      showToast("Backend is offline. Please wait for it to become available.", "error");
      return;
    }

    if (!url) return;

    let target = url.trim();
    if (!target.startsWith("http")) {
      target = "https://" + target;
    }

    try {
      setLoading(true);
      setErrorMsg("");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(`${API_BASE}/extract-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json: ApiResponse = await res.json();

      if (!res.ok) {
        throw new Error(json?.content || "Request failed");
      }

      setData(json);
      showToast(`Successfully analyzed ${target}`, "success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to analyze website");
      showToast(err.message || "Failed to analyze website", "error");
      // If analysis fails due to backend, mark it as offline
      if (err.message?.includes("fetch") || err.message?.includes("network")) {
        setBackendStatus("offline");
      }
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    setBackendStatus("checking");
    try {
      const res = await fetch(`${API_BASE}/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      setHealthStatus(json.status || (res.ok ? "OK" : "Error"));
      setBackendStatus(res.ok ? "online" : "offline");
      showToast(res.ok ? "Backend is healthy!" : "⚠️ Backend issue detected", res.ok ? "success" : "error");
    } catch (err: any) {
      console.error(err);
      setHealthStatus("Connection failed");
      setBackendStatus("offline");
      showToast("Cannot connect to backend server", "error");
    }
  };

  const style = data?.style;
  const { typography, accessibility, cssFramework, metadata } = style || {};

  return (
    <div className="wpa-root">
      {/* Toast Container */}
      {toast && (
        <div className="wpa-toast-container">
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        </div>
      )}

      {/* Health Modal */}
      {healthStatus && (
        <HealthStatusCard status={healthStatus} onClose={() => setHealthStatus(null)} />
      )}

      {/* Backend Down Warning Banner */}
      {backendStatus === "offline" && (
        <div className="wpa-warning-banner">
          <span className="wpa-warning-icon">⚠️</span>
          <div className="wpa-warning-content">
            <strong>Server is offline</strong> — Analysis feature is currently unavailable. 
            Please check back later or contact support.
          </div>
          <button className="wpa-warning-retry" onClick={checkHealth}>
            Retry Connection
          </button>
        </div>
      )}

      {/* ── NAV ── */}
      <nav className="wpa-nav">
        <div className="wpa-nav-brand">
          <span className="wpa-dot" />
          Web Pattern Analyzer
        </div>
        <div className="wpa-nav-right">
          <button 
            className={`wpa-health-btn ${backendStatus === "online" ? "online" : backendStatus === "offline" ? "offline" : backendStatus === "checking" ? "checking" : ""}`} 
            onClick={checkHealth} 
            disabled={backendStatus === "checking"}
          >
            <div className="wpa-status-indicator">
              {backendStatus === "checking" ? (
                <>
                  <div className="wpa-check-spinner-small" />
                  <span className="wpa-status-text">Checking...</span>
                </>
              ) : (
                <>
                  <span className={`wpa-status-dot ${
                    backendStatus === "online" ? "pulse-green" : 
                    backendStatus === "offline" ? "pulse-red" : 
                    "pulse-gray"
                  }`} />
                  <span className="wpa-status-text">
                    {backendStatus === "online" ? "Online" : 
                     backendStatus === "offline" ? "Offline" : 
                     "Check Status"}
                  </span>
                </>
              )}
            </div>
          </button>
          <span className="wpa-version-badge">v1.0</span>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="wpa-hero">
        <div className="wpa-hero-grid" aria-hidden="true">
          {Array.from({ length: 120 }).map((_, i) => (
            <div key={i} className="wpa-grid-cell" />
          ))}
        </div>
        <div className="wpa-hero-content">
          <h1 className="wpa-hero-title">
            Analyze any website's
            <br />
            <span className="wpa-hero-accent">design patterns</span>
          </h1>
          <p className="wpa-hero-sub">
            Extract colors, typography, hierarchy, accessibility & layout — instantly.
          </p>
          <form
            className="wpa-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              analyze();
            }}
          >
            <div className="wpa-search-wrap">
              <svg className="wpa-search-icon" viewBox="0 0 20 20" fill="none">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                className="wpa-search-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={loading || backendStatus !== "online"}
                spellCheck={false}
              />
            </div>
            <button 
              className="wpa-search-btn" 
              disabled={loading || !url.trim() || backendStatus !== "online"}
              title={backendStatus !== "online" ? "Backend is offline - Analysis unavailable" : ""}
            >
              {loading ? (
                <>
                  <span className="wpa-btn-spinner" />
                  Analyzing…
                </>
              ) : backendStatus !== "online" ? (
                "Backend Offline"
              ) : (
                "Analyze →"
              )}
            </button>
          </form>
          
          {/* Status message below search */}
          {backendStatus !== "online" && backendStatus !== "checking" && (
            <div className="wpa-status-message offline">
              <span>⚠️</span>
              <span>Server is offline. Analysis is currently unavailable.</span>
            </div>
          )}
          {backendStatus === "checking" && (
            <div className="wpa-status-message checking">
              <div className="wpa-check-spinner-small" />
              <span>Checking backend status...</span>
            </div>
          )}
          {/* {backendStatus === "online" && (
            <div className="wpa-status-message online">
              <span>✅</span>
              <span>Backend is ready! Enter a URL to analyze.</span>
            </div>
          )} */}
        </div>
      </header>

      {/* ── RESULTS ── */}
      <main className="wpa-main">
        {!data && !loading && !errorMsg && (
          <div className="wpa-empty">
            <div className="wpa-empty-icon">
              <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
                <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 18h36" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="14" r="1.5" fill="currentColor" />
                <circle cx="17" cy="14" r="1.5" fill="currentColor" />
                <circle cx="22" cy="14" r="1.5" fill="currentColor" />
                <path d="M14 28h20M14 33h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="wpa-empty-text">Enter a URL above to analyze its design patterns</p>
          </div>
        )}

        {loading && (
          <div className="wpa-loading">
            <div className="wpa-loading-ring" />
            <p>Crawling page and extracting design patterns…</p>
            <p className="wpa-loading-sub">This takes 3–10 seconds depending on the site</p>
          </div>
        )}

        {/* {errorMsg && !loading && (
          <div className="wpa-error">
            <strong>Analysis failed</strong> — {errorMsg}
            <button className="wpa-error-retry" onClick={() => setErrorMsg("")}>
              Try again
            </button>
          </div>
        )} */}

        {data && style && (
          <div className="wpa-results">
            {/* meta strip */}
            <div className="wpa-meta-strip">
              <span className="wpa-meta-dot" />
              <span className="wpa-meta-url">{metadata?.url || "—"}</span>
              <span className="wpa-meta-sep">·</span>
              <span>{metadata?.extractedAt ? new Date(metadata.extractedAt).toLocaleString() : "—"}</span>
              {metadata?.title && (
                <>
                  <span className="wpa-meta-sep">·</span>
                  <em>"{metadata.title.substring(0, 60)}"</em>
                </>
              )}
            </div>

            {/* stat strip */}
            <div className="wpa-stats">
              {[
                {
                  label: "Framework",
                  value: cssFramework?.framework
                    ? cssFramework.framework.charAt(0).toUpperCase() + cssFramework.framework.slice(1)
                    : "Custom",
                },
                { label: "Type scale", value: typography?.scale ? `${typography.scale}×` : "—", sub: "modular ratio" },
                { label: "Base size", value: typography?.baseFontSize ? `${typography.baseFontSize}px` : "—" },
                {
                  label: "Avg contrast",
                  value: accessibility?.averageContrast ? `${Math.round(accessibility.averageContrast)}:1` : "—",
                  sub: accessibility?.averageContrast ? wcagLabel(accessibility.averageContrast).text : "—",
                  highlight: accessibility?.averageContrast ? accessibility.averageContrast >= 7 : false,
                },
                { label: "Color stops", value: style.colorPalette?.length || 0 },
                {
                  label: "Passing pairs",
                  value: accessibility?.accessibleColorPairs?.length || 0,
                  sub: "WCAG ≥4.5",
                },
              ].map((s) => (
                <div className="wpa-stat" key={s.label}>
                  <div className="wpa-stat-label">{s.label}</div>
                  <div className={`wpa-stat-value ${s.highlight ? "wpa-stat-green" : ""}`}>{s.value}</div>
                  {s.sub && <div className="wpa-stat-sub">{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* tabs */}
            <div className="wpa-tabs">
              {["overview", "colors", "typography", "accessibility", "content", "layout"].map((t) => (
                <button
                  key={t}
                  className={`wpa-tab ${tab === t ? "wpa-tab-active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* tab panels */}
            <div className="wpa-panel">
              {tab === "overview" && <OverviewPanel style={style} />}
              {tab === "colors" && <ColorsPanel style={style} />}
              {tab === "typography" && <TypographyPanel style={style} />}
              {tab === "accessibility" && <AccessibilityPanel style={style} />}
              {tab === "content" && <ContentPanel content={data.content} />}
              {tab === "layout" && <LayoutPanel style={style} />}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f4f0; color: #1a1a1a; font-family: 'DM Sans', sans-serif; }

        .wpa-root { min-height: 100vh; }

        /* NAV */
        .wpa-nav { background: #fff; border-bottom: 1px solid #e8e5df; padding: 14px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        .wpa-nav-brand { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; letter-spacing: -0.01em; }
        .wpa-dot { width: 8px; height: 8px; border-radius: 50%; background: #6c5ce7; flex-shrink: 0; }
        .wpa-nav-right { display: flex; align-items: center; gap: 12px; }

        /* Warning Banner */
        .wpa-warning-banner {
          background: linear-gradient(135deg, #fff8e7, #fff3d4);
          border-bottom: 1px solid #f39c12;
          padding: 12px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 13px;
        }
        .wpa-warning-icon { font-size: 20px; }
        .wpa-warning-content { flex: 1; color: #8a6d0c; }
        .wpa-warning-retry {
          background: #f39c12;
          border: none;
          padding: 6px 16px;
          border-radius: 20px;
          color: white;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .wpa-warning-retry:hover { background: #e67e22; transform: scale(0.98); }

        /* Health Button Styles */
        .wpa-health-btn {
          background: #f0eee8;
          border: none;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .wpa-health-btn.online {
          background: linear-gradient(135deg, #e0fdf4, #c8f5e8);
          border: 1px solid #00b894;
          color: #00614a;
        }
        .wpa-health-btn.offline {
          background: linear-gradient(135deg, #ffe0df, #ffd0cf);
          border: 1px solid #e74c3c;
          color: #922;
        }
        .wpa-health-btn.checking {
          background: #f0eee8;
          border: 1px solid #6c5ce7;
          color: #6c5ce7;
        }
        .wpa-health-btn:hover:not(:disabled) { transform: scale(0.98); }
        .wpa-health-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .wpa-status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .wpa-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .wpa-status-dot.pulse-green {
          background: #00b894;
          animation: pulse-green 1.5s infinite;
          box-shadow: 0 0 0 0 #00b894;
        }
        .wpa-status-dot.pulse-red {
          background: #e74c3c;
          animation: pulse-red 1.5s infinite;
          box-shadow: 0 0 0 0 #e74c3c;
        }
        .wpa-status-dot.pulse-gray {
          background: #bdc3c7;
          animation: pulse-gray 2s infinite;
        }
        .wpa-status-text { font-size: 12px; font-weight: 500; }

        .wpa-check-spinner-small {
          width: 10px;
          height: 10px;
          border: 2px solid #6c5ce7;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .wpa-version-badge { font-size: 11px; background: #f0eee8; color: #888; padding: 3px 8px; border-radius: 20px; }

        /* Status Messages */
        .wpa-status-message {
          margin-top: 16px;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          max-width: 100%;
        }
        .wpa-status-message.online {
          background: #e0fdf4;
          color: #00614a;
        }
        .wpa-status-message.offline {
          background: #ffe0df;
          color: #922;
        }
        .wpa-status-message.checking {
          background: #f0eee8;
          color: #6c5ce7;
        }

        /* HERO */
        .wpa-hero { background: #fff; border-bottom: 1px solid #e8e5df; padding: 60px 32px 48px; text-align: center; position: relative; overflow: hidden; }
        .wpa-hero-grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(20, 1fr); pointer-events: none; opacity: 0.04; }
        .wpa-grid-cell { border-right: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; }
        .wpa-hero-content { position: relative; z-index: 1; }
        .wpa-hero-title { font-size: clamp(28px, 4vw, 42px); font-weight: 300; letter-spacing: -0.03em; line-height: 1.15; color: #1a1a1a; margin-bottom: 14px; }
        .wpa-hero-accent { font-weight: 600; background: linear-gradient(135deg, #6c5ce7, #a29bfe); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .wpa-hero-sub { font-size: 15px; color: #777; margin-bottom: 28px; font-weight: 300; }

        /* SEARCH */
        .wpa-search-form { display: flex; gap: 10px; max-width: 560px; margin: 0 auto; }
        .wpa-search-wrap { flex: 1; position: relative; }
        .wpa-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: #aaa; pointer-events: none; }
        .wpa-search-input { width: 100%; height: 44px; padding: 0 14px 0 38px; border: 1.5px solid #ddd; border-radius: 10px; font-size: 14px; font-family: 'DM Mono', monospace; background: #fff; color: #1a1a1a; outline: none; transition: border-color 0.15s; }
        .wpa-search-input:focus { border-color: #6c5ce7; }
        .wpa-search-input:disabled { opacity: 0.6; background: #f5f4f0; cursor: not-allowed; }
        .wpa-search-btn { height: 44px; padding: 0 22px; background: #1a1a1a; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-family: 'DM Sans', sans-serif; font-weight: 500; cursor: pointer; transition: background 0.15s, transform 0.1s; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
        .wpa-search-btn:hover:not(:disabled) { background: #333; }
        .wpa-search-btn:active:not(:disabled) { transform: scale(0.98); }
        .wpa-search-btn:disabled { opacity: 0.5; cursor: not-allowed; background: #999; }
        .wpa-btn-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }

        /* TOAST */
        .wpa-toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 1000; }
        .wpa-toast { display: flex; align-items: center; gap: 12px; background: #fff; border-radius: 12px; padding: 12px 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.02); border: 1px solid #e8e5df; animation: wpa-slidein 0.3s ease; max-width: 380px; }
        .wpa-toast-success .wpa-toast-icon { color: #00b894; }
        .wpa-toast-error .wpa-toast-icon { color: #e74c3c; }
        .wpa-toast-info .wpa-toast-icon { color: #3498db; }
        .wpa-toast-message { font-size: 13px; color: #1a1a1a; flex: 1; }
        .wpa-toast-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #aaa; padding: 0 4px; line-height: 1; }
        .wpa-toast-close:hover { color: #555; }

        /* HEALTH MODAL */
        .wpa-health-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: wpa-fadein 0.2s ease; }
        .wpa-health-card { background: #fff; border-radius: 24px; padding: 32px; max-width: 360px; text-align: center; position: relative; animation: wpa-scalein 0.3s ease; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
        .wpa-health-close { position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 24px; cursor: pointer; color: #aaa; line-height: 1; }
        .wpa-health-close:hover { color: #555; }
        .wpa-health-icon { margin: 0 auto 20px; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
        .wpa-health-icon.healthy { color: #00b894; background: #e0fdf4; }
        .wpa-health-icon.unhealthy { color: #e74c3c; background: #fef0ef; }
        .wpa-health-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #1a1a1a; }
        .wpa-health-message { font-size: 13px; color: #666; margin-bottom: 20px; }
        .wpa-health-pulse { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: #888; margin-bottom: 24px; padding: 8px 12px; background: #f5f4f0; border-radius: 40px; width: fit-content; margin-left: auto; margin-right: auto; }
        .wpa-pulse-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .wpa-health-dismiss { background: #1a1a1a; color: #fff; border: none; padding: 10px 24px; border-radius: 40px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
        .wpa-health-dismiss:hover { background: #333; }

        /* MAIN */
        .wpa-main { max-width: 1040px; margin: 0 auto; padding: 32px 24px 64px; }

        /* EMPTY / LOADING / ERROR */
        .wpa-empty { text-align: center; padding: 80px 20px; color: #aaa; }
        .wpa-empty-icon { margin-bottom: 16px; opacity: 0.4; }
        .wpa-empty-text { font-size: 14px; font-weight: 300; }
        .wpa-loading { text-align: center; padding: 80px 20px; color: #555; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
        .wpa-loading-ring { width: 36px; height: 36px; border: 2.5px solid #e0ddd8; border-top-color: #6c5ce7; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .wpa-loading-sub { font-size: 12px; color: #aaa; font-weight: 300; }
        .wpa-error { background: #fff5f5; border: 1px solid #fcc; border-radius: 12px; padding: 16px 20px; font-size: 14px; color: #c0392b; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .wpa-error-retry { margin-left: auto; background: none; border: 1px solid #c0392b; color: #c0392b; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .wpa-error-retry:hover { background: #c0392b10; }

        /* META STRIP */
        .wpa-meta-strip { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #999; margin-bottom: 18px; flex-wrap: wrap; }
        .wpa-meta-dot { width: 6px; height: 6px; border-radius: 50%; background: #00b894; flex-shrink: 0; }
        .wpa-meta-url { font-family: 'DM Mono', monospace; color: #555; }
        .wpa-meta-sep { color: #ccc; }

        /* STATS */
        .wpa-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 22px; }
        @media (max-width: 700px) { .wpa-stats { grid-template-columns: repeat(3, 1fr); } }
        .wpa-stat { background: #fff; border: 1px solid #e8e5df; border-radius: 10px; padding: 12px 14px; text-align: center; transition: transform 0.15s, box-shadow 0.15s; }
        .wpa-stat:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .wpa-stat-label { font-size: 11px; color: #aaa; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.03em; }
        .wpa-stat-value { font-size: 20px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.02em; }
        .wpa-stat-sub { font-size: 10px; color: #aaa; margin-top: 2px; }
        .wpa-stat-green { color: #00b894; }

        /* TABS */
        .wpa-tabs { display: flex; gap: 0; border-bottom: 1px solid #e8e5df; margin-bottom: 22px; overflow-x: auto; }
        .wpa-tab { padding: 9px 18px; font-size: 13px; color: #888; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: color 0.15s; white-space: nowrap; margin-bottom: -1px; }
        .wpa-tab:hover { color: #555; }
        .wpa-tab-active { color: #6c5ce7; border-bottom-color: #6c5ce7; font-weight: 500; }

        /* PANEL */
        .wpa-panel { animation: wpa-fadein 0.2s ease; }

        /* ANIMATIONS */
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes wpa-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wpa-slidein { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes wpa-scalein { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(0,184,148,0.4); } 70% { box-shadow: 0 0 0 6px rgba(0,184,148,0); } 100% { box-shadow: 0 0 0 0 rgba(0,184,148,0); } }
        @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(231,76,60,0.4); } 70% { box-shadow: 0 0 0 6px rgba(231,76,60,0); } 100% { box-shadow: 0 0 0 0 rgba(231,76,60,0); } }
        @keyframes pulse-gray { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
      `}</style>
    </div>
  );
};

export default App;
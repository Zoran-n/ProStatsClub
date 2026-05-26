import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", e, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "#f87171", fontFamily: "monospace", background: "#0a0a0a", height: "100vh" }}>
          <h2 style={{ color: "#00f2ff", marginBottom: 16 }}>ERREUR — {this.state.error}</h2>
          <p style={{ fontSize: 12, color: "#94a3b8" }}>Ouvre la console DevTools (F12) pour plus de détails.</p>
          <button onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: "8px 20px", background: "#00f2ff22", border: "1px solid #00f2ff", color: "#00f2ff", borderRadius: 6, cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

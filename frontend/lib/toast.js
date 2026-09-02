import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, kind = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
  }, [dismiss]);

  const notifySuccess = useCallback((message) => push(message, "success"), [push]);

  /** Extracts FastAPI's {"detail": "..."} (or a validation array) into one readable string. */
  const notifyError = useCallback((err, fallback = "Something went wrong") => {
    let message = fallback;
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) message = detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
    else if (err?.message) message = err.message;
    push(message, "error");
  }, [push]);

  return (
    <ToastContext.Provider value={{ notifySuccess, notifyError }}>
      {children}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
        {toasts.map((t) => (
          <div key={t.id} onClick={() => dismiss(t.id)} role="alert"
               style={{
                 cursor: "pointer", padding: "0.85rem 1.1rem", borderRadius: 8, fontWeight: 700,
                 color: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,.18)",
                 background: t.kind === "error" ? "var(--sf-red)" : "var(--sf-green)",
               }}>
            {t.kind === "error" ? "⚠ " : "✓ "}{t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Fix for ResizeObserver loop error
// This is a benign error that occurs when ResizeObserver callbacks cause layout changes
// that trigger more observations within the same frame. It doesn't affect functionality.
if (typeof window !== 'undefined') {
  // Debounce ResizeObserver to prevent loop errors
  const debounce = (callback, delay) => {
    let tid;
    return function (...args) {
      const ctx = this;
      clearTimeout(tid);
      tid = setTimeout(() => callback.apply(ctx, args), delay);
    };
  };

  // Store original ResizeObserver
  const OriginalResizeObserver = window.ResizeObserver;

  // Create wrapped ResizeObserver with error suppression
  window.ResizeObserver = class ResizeObserver extends OriginalResizeObserver {
    constructor(callback) {
      super(debounce(callback, 20));
    }
  };

  // Suppress ResizeObserver errors from appearing in UI
  const errorHandler = (e) => {
    if (e.message?.includes('ResizeObserver') || 
        e.message?.includes('ResizeObserver loop')) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return true;
    }
  };
  
  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason?.message?.includes('ResizeObserver')) {
      e.preventDefault();
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

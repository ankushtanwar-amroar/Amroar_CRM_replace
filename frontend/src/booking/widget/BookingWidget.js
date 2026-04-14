import React from 'react';
import ReactDOM from 'react-dom/client';
import PublicBooking from '../pages/PublicBooking';
import { BrowserRouter } from 'react-router-dom';

// This creates an embeddable booking widget
class BookingWidget {
  constructor(config) {
    this.tenantId = config.tenantId;
    this.containerId = config.containerId || 'booking-widget';
    this.theme = config.theme || 'light';
  }

  mount() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container with id "${this.containerId}" not found`);
      return;
    }

    const root = ReactDOM.createRoot(container);
    root.render(
      <BrowserRouter>
        <div className={`booking-widget-theme-${this.theme}`}>
          <PublicBooking tenantId={this.tenantId} />
        </div>
      </BrowserRouter>
    );
  }
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.BookingWidget = BookingWidget;
}

export default BookingWidget;

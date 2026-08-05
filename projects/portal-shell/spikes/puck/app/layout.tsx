import './reset.css';
import '@puckeditor/core/puck.css';
import './fonts.css';
import './portal.css';
import './reyada.css';
import './landing.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Puck RTL Spike' };

/**
 * Without this the mobile browser reports a ~980px virtual viewport and every
 * media query below 768px silently never fires — the page looks "responsive"
 * in devtools and is not on a real handset.
 */
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      {/* No inline fontFamily here: an inline style beats the token-driven
          stylesheet rule in fonts.css and silently wins. Font family is owned
          by the theme token, full stop. */}
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}

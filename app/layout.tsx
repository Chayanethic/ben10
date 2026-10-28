import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Omnitrix Arena', description: 'Multiplayer alien trump-card arena' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

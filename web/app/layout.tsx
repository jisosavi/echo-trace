import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forensic Semiotics',
  description: 'Autonomous comparisons between contemporary authoritarian media and historical dictatorial rhetoric.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

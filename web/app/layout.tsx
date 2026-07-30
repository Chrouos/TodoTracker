import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'TodoTracker',
  description: '專案時間追蹤',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <StoreProvider>
          <TopBar />
          <main className="page">
            <div className="wrap">{children}</div>
          </main>
        </StoreProvider>
      </body>
    </html>
  );
}

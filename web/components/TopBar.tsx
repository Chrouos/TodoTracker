'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';

const LINKS = [
  { href: '/', label: '總覽' },
  { href: '/log', label: '工作日誌' },
  { href: '/projects', label: '專案' },
  { href: '/todos', label: 'Todo' },
  { href: '/reports', label: '報表' },
  { href: '/settings', label: '設定' },
];

export default function TopBar() {
  const path = usePathname();
  const { status } = useStore();

  return (
    <div className="topbar">
      <div className="wrap">
        <div className="topbar-inner">
          <span className="brand">TodoTracker</span>
          <span className="conn">
            <span className={`dot ${status === 'ok' ? 'on' : status === 'disconnected' ? 'off' : ''}`} />
            {status === 'ok' ? '已連線擴充' : status === 'loading' ? '連線中…' : '未連線'}
          </span>
          <nav className="nav">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

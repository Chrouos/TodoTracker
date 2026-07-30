'use client';

import { useEffect, useState } from 'react';

/**
 * 可收合的區塊。
 * 依 DESIGN.md：[+] = 已收合、可展開；[-] = 已展開、可收合。
 * 標記一定要是可點的，不能只當裝飾用的項目符號。
 * 展開狀態記在 localStorage，重新整理不會跑掉。
 */
export default function Section({
  id, title, extra, children, defaultOpen = true,
}: {
  id: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const v = localStorage.getItem(`sec:${id}`);
    if (v !== null) setOpen(v === '1');
  }, [id]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(`sec:${id}`, next ? '1' : '0');
      return next;
    });
  };

  return (
    <section>
      <h2 className="sec">
        <button className="sec-toggle" onClick={toggle} aria-expanded={open}>
          <span className="mark">{open ? '[-]' : '[+]'}</span>
          <span>{title}</span>
        </button>
        {extra}
      </h2>
      {open && children}
    </section>
  );
}

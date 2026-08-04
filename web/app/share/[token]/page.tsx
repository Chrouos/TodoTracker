import SharedNoteView from '@/components/SharedNoteView';

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) return <main className="shared-note"><h1>此工作筆記目前無法查看</h1></main>;
  return <SharedNoteView note={await res.json()} />;
}

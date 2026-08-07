'use client';

import { use } from 'react';
import ProjectWorkspace from '@/components/ProjectWorkspace';

export default function ProjectWorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  return <ProjectWorkspace projectId={use(params).projectId} />;
}

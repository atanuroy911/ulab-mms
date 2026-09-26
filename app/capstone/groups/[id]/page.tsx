'use client';

import { use as usePromise } from 'react';
import { GroupDetailView } from './GroupDetailView';

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  return <GroupDetailView id={id} />;
}

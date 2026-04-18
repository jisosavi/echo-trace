'use client';

import dynamic from 'next/dynamic';

const PropagandaMap = dynamic(
  () => import('@/components/propaganda-map').then((m) => m.PropagandaMap),
  { ssr: false },
);

export function PropagandaMapLoader() {
  return <PropagandaMap />;
}

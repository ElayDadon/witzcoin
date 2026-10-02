'use client';
import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/push-client';

export default function SwRegister() {
  useEffect(() => { void registerServiceWorker(); }, []);
  return null;
}

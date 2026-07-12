'use client';

/** Entry: bounce to the dashboard (auth guard there redirects to /login). */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace('/dashboard'), [router]);
  return null;
}

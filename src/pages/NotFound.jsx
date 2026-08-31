import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { setPageMeta } from '@/lib/seo';

export default function NotFound() {
  const nav = useNavigate();
  useEffect(() => {
    setPageMeta({ title: 'Page not found' });
  }, []);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center">
      <p className="font-display text-8xl font-extrabold uppercase italic leading-none">
        <span className="text-safi-ice">4</span>
        <span className="text-safi-red">0</span>
        <span className="text-stroke-strong">4</span>
      </p>
      <p className="mt-4 text-sm text-safi-steel">
        This page ran off the pitch. The kit you're after is probably still in the shop.
      </p>
      <button
        onClick={() => nav('/')}
        className="mt-7 flex items-center gap-2 rounded-sm bg-safi-red px-7 py-3.5 font-display text-base font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep"
      >
        Back to SAFI SPORT <ArrowRight className="h-4 w-4" />
      </button>
    </main>
  );
}

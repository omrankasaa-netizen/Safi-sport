import { useEffect, useState } from 'react';
import {
  denyConsent,
  grantConsent,
  shouldAskConsent,
} from '@/lib/metaPixel';

/**
 * SAFI consent banner — implied opt-out (default-ON tracking; only an
 * explicit Decline revokes). Hidden entirely when no pixel id is configured.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(shouldAskConsent());
    } catch {
      /* never throw */
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-sm border border-safi-line bg-safi-graphite/95 p-4 shadow-xl backdrop-blur">
      <p className="font-display text-sm font-bold uppercase italic tracking-wide text-safi-ice">
        Cookies &amp; ads <span className="text-safi-red">/</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-safi-steel">
        We use the Meta Pixel to measure ads and improve the shop. Tracking is on unless you
        decline — your choice is remembered on this device.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            grantConsent();
            setVisible(false);
          }}
          className="flex-1 rounded-sm bg-safi-red py-2 font-display text-sm font-bold uppercase italic tracking-wider text-white hover:bg-safi-reddeep"
        >
          Sounds good
        </button>
        <button
          onClick={() => {
            denyConsent();
            setVisible(false);
          }}
          className="flex-1 rounded-sm border border-safi-line py-2 font-display text-sm font-bold uppercase italic tracking-wider text-safi-steel hover:border-safi-steel hover:text-safi-ice"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

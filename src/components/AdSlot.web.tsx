import { useEffect, useRef } from 'react';
import { View } from 'react-native';

const AD_CLIENT = 'ca-pub-6112467165543220';
const SCRIPT_ID = 'adsbygoogle-js';

declare global {
  interface Window {
    adsbygoogle?: object[];
  }
}

function loadAdSenseScript() {
  if (document.getElementById(SCRIPT_ID)) return;
  // Collapse slots AdSense couldn't fill so they don't leave a blank gap.
  const style = document.createElement('style');
  style.textContent = 'ins.adsbygoogle[data-ad-status="unfilled"]{display:none!important}';
  document.head.appendChild(style);
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
  document.head.appendChild(script);
}

/** Responsive AdSense display unit. */
export function AdSlot({ slot }: { slot: string }) {
  const insRef = useRef<HTMLModElement>(null);

  // AdSense rejects slots measured at 0px (e.g. a screen mounted behind a modal), so wait until it's visible.
  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return;
    let requested = false;
    const request = () => {
      if (requested || ins.offsetWidth === 0) return;
      requested = true;
      observer.disconnect();
      loadAdSenseScript();
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // Ad blockers or an already-filled slot; the page works without the ad.
      }
    };
    const observer = new ResizeObserver(request);
    observer.observe(ins);
    request();
    return () => observer.disconnect();
  }, []);

  return (
    <View style={{ marginTop: 18 }}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </View>
  );
}

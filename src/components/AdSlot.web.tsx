import { useEffect, useRef, useState } from 'react';
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
  const requested = useRef(false);
  const [width, setWidth] = useState(0);

  // AdSense rejects slots measured at 0px (e.g. a screen mounted while hidden), so wait for layout.
  useEffect(() => {
    if (width === 0 || requested.current) return;
    requested.current = true;
    loadAdSenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blockers or an already-filled slot; the page works without the ad.
    }
  }, [width]);

  return (
    <View style={{ marginTop: 18 }} onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
      <ins
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

import { useEffect, useState } from 'react';

const FLASH_DURATION_MS = 1600;

interface TakeoverFlashProps {
  /** Bump this number to (re-)trigger the flash. */
  trigger: number;
}

/** Full-screen red pulse — the demo climax visual when the guardian takes over
 * the call. Self-dismisses; pointer-events none so it never blocks input. */
export function TakeoverFlash({ trigger }: TakeoverFlashProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [trigger]);

  if (!visible) return null;
  return <div className="takeover-flash" aria-hidden="true" />;
}

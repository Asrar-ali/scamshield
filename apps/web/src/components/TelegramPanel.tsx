import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type { TelegramStatus } from '../lib/api';
import { TelegramIcon } from './icons';

/** Landing-hero chip: only renders when the server reports an active Telegram
 * bot. Any 404/disabled/failure response upstream already collapses to
 * { enabled: false, botUsername: null } (see lib/api.fetchTelegramStatus), so
 * this component just needs one guard to render nothing instead of a broken
 * empty box. */
export function TelegramPanel({ status }: { status: TelegramStatus }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const link = status.botUsername ? `https://t.me/${status.botUsername}` : null;

  useEffect(() => {
    if (!link || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, link, {
      width: 108,
      margin: 1,
      color: { dark: '#0b0f1a', light: '#ffffff' },
    }).catch(() => {
      // Best-effort: if generation fails the handle/link text is still usable.
    });
  }, [link]);

  if (!status.enabled || !link) return null;

  return (
    <div className="telegram-panel">
      <div className="telegram-panel-copy">
        <span className="telegram-panel-eyebrow">
          <TelegramIcon width={14} height={14} />
          Or text Rose from your own phone
        </span>
        <a className="telegram-panel-handle" href={link} target="_blank" rel="noreferrer">
          @{status.botUsername}
        </a>
        <span className="telegram-panel-link">t.me/{status.botUsername}</span>
      </div>
      <div className="telegram-panel-qr">
        <canvas ref={canvasRef} width={108} height={108} aria-label={`QR code to message @${status.botUsername} on Telegram`} />
      </div>
    </div>
  );
}

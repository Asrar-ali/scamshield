import 'dotenv/config';
import { buildApp } from './app.js';
import { geminiEnabled } from './gemini.js';
import { telegramEnabled } from './telegram.js';
import { imessageEnabled } from './alerts.js';
import { log } from './log.js';

const PORT = Number(process.env.PORT ?? 3001);
const { server } = buildApp();

server.listen(PORT, () => {
  log.info(`ScamShield server on :${PORT} (mode: ${geminiEnabled() ? 'gemini' : 'mock'})`);
  log.info(`Telegram: ${telegramEnabled() ? 'connected' : 'not connected (set TELEGRAM_BOT_TOKEN)'}`);
  log.info(`iMessage family alerts: ${imessageEnabled() ? 'enabled' : 'disabled (set SCAMSHIELD_IMESSAGE_ENABLED=1)'}`);
});

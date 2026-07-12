import 'dotenv/config';
import { buildApp } from './app.js';
import { geminiEnabled } from './gemini.js';
import { discordEnabled } from './discord.js';
import { log } from './log.js';

const PORT = Number(process.env.PORT ?? 3001);
const { server } = buildApp();

server.listen(PORT, () => {
  log.info(`ScamShield server on :${PORT} (mode: ${geminiEnabled() ? 'gemini' : 'mock'})`);
  log.info(`Discord: ${discordEnabled() ? 'configured — bot connecting' : 'not configured (set DISCORD_BOT_TOKEN)'}`);
});

import express from 'express';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { decodeSession } from './lib/session.js';
import { handleMessage, loadCommands } from './lib/handler.js';
import { loadDB } from './lib/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('<h1>SBG Bot is Running</h1><p>The WhatsApp Baileys bot logic is executing on the server.</p>');
});
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

export const messageStore = new Map();

async function startBot() {
    const SESSION_ID = process.env.SESSION_ID || '';
    if (SESSION_ID) {
        decodeSession(SESSION_ID);
    }

    await loadCommands();

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    
    console.log(`Using WA v${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Suppress trace logs
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: Browsers.macOS('Desktop'),
        getMessage: async () => ({ conversation: 'Message not found' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            const db = loadDB();
            let dbType = 'Local JSON File';
            if (process.env.MONGO_URL) dbType = 'MongoDB';
            else if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) dbType = 'Supabase';
            else if (process.env.FIREBASE_CONFIG_BASE64) dbType = 'Firebase Firestore';
            else if (process.env.USE_SQLITE) dbType = 'SQLite';

            db.getSettings().then(settings => {
                console.log(`\n==========================================`);
                console.log(`🔌 CONNECTED    : YES`);
                console.log(`📱 JID          : ${sock.user?.id || 'Unknown'}`);
                console.log(`🤖 PREFIX       : ${settings.prefix || process.env.PREFIX || '!'}`);
                console.log(`📂 DATABASE     : ${dbType}`);
                console.log(`⚙️  MODE         : Public (Responds to all)`);
                console.log(`==========================================\n`);
            }).catch(err => {
                console.log('WhatsApp Bot connected successfully! JID:', sock.user?.id);
            });
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const msg = messages[0];
        if (!msg) return;
        
        // Comprehensive Message Logging
        if (msg.message) {
            const isGroup = !!msg.key.remoteJid?.endsWith('@g.us');
            const isStatus = msg.key.remoteJid === 'status@broadcast';
            const isChannel = !!msg.key.remoteJid?.endsWith('@newsletter');
            const locationStr = isGroup ? 'GROUP' : isStatus ? 'STATUS' : isChannel ? 'CHANNEL' : 'DM';
            const sender = msg.key.participant || msg.key.remoteJid;
            
            let messageContent = msg.message.ephemeralMessage?.message || 
                                 msg.message.viewOnceMessageV2?.message || 
                                 msg.message.viewOnceMessage?.message || 
                                 msg.message.documentWithCaptionMessage?.message?.documentMessage || 
                                 msg.message;

            let msgType = 'MSG';
            if (messageContent.imageMessage) msgType = 'IMG';
            else if (messageContent.videoMessage) msgType = 'VDO';
            else if (messageContent.audioMessage) msgType = 'AUD';
            else if (messageContent.documentMessage) msgType = 'DOC';
            else if (messageContent.stickerMessage) msgType = 'STK';
            
            const textContent = messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '';
            const db = loadDB();
            const settings = await db.getSettings();
            const prefix = settings?.prefix || process.env.PREFIX || '!';
            if (textContent.startsWith(prefix)) msgType = 'CMD';
            
            console.log(`[${locationStr}] [${msgType}] From: ${sender} | To: ${msg.key.remoteJid} | Content: ${textContent.length > 50 ? textContent.substring(0, 50) + '...' : (textContent || '<media>')}`);
        }
        
        // Anti-delete cache
        if (msg.key && msg.message) {
            messageStore.set(msg.key.id, msg);
            if (messageStore.size > 2000) { // prevent memory leak
                const first = messageStore.keys().next().value;
                messageStore.delete(first);
            }
        }

        const db = loadDB();
        const settings = await db.getSettings();

        // Status Handling
        if (msg.key.remoteJid === 'status@broadcast') {
            if (settings.autoViewStatus) {
                try {
                    await sock.readMessages([msg.key]);
                    if (settings.autoLikeStatus) {
                        await sock.sendMessage(
                            msg.key.remoteJid,
                            { react: { text: "🔥", key: msg.key } },
                            { statusJidList: [msg.key.participant] }
                        );
                    }
                    if (settings.autoReplyStatus && settings.autoReplyContent) {
                        await sock.sendMessage(
                            msg.key.participant,
                            { text: settings.autoReplyContent },
                            { quoted: msg }
                        );
                    }
                } catch (e) {
                    console.error('Status handling error:', e);
                }
            }
            return;
        }

        // Auto React
        if (settings.autoReact) {
            try {
                const reactEmojis = ['🔥', '❤️', '👍', '💯', '✨', '😂', '👏'];
                const randomEmoji = reactEmojis[Math.floor(Math.random() * reactEmojis.length)];
                await sock.sendMessage(msg.key.remoteJid, { react: { text: randomEmoji, key: msg.key } });
            } catch (e) {}
        }

        // Check for message revocation (delete)
        if (msg.message?.protocolMessage && (msg.message.protocolMessage.type === 0 || msg.message.protocolMessage.type === 14)) {
            if (settings.antiDelete) {
                const deletedKey = msg.message.protocolMessage.key;
                const originalMsg = messageStore.get(deletedKey.id);
                if (originalMsg) {
                    const jid = originalMsg.key.remoteJid;
                    const participant = originalMsg.key.participant || jid;
                    let text = `*⚠️ ANTIDELETE TRIGGERED ⚠️*\n\n`;
                    text += `*User:* @${participant.split('@')[0]}\n`;
                    text += `*Time:* ${new Date().toLocaleTimeString()}\n\n`;
                    text += `*Message was deleted. Recovering...*`;
                    await sock.sendMessage(jid, { text, mentions: [participant] });
                    await sock.sendMessage(jid, { forward: originalMsg });
                }
            }
        } else {
            // Process commands
            try {
                await handleMessage(sock, msg, loadDB());
            } catch (err) {
                console.error('Message handling error:', err);
            }
        }
    });
}

startBot();

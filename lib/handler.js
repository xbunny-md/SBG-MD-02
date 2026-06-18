import fs from 'fs';
import path from 'path';

export const commands = new Map();
export const aliases = new Map();

export const loadCommands = async (dir = './commands', isRoot = true) => {
    if (isRoot) {
        commands.clear();
        aliases.clear();
    }
    
    // Arrays attached to the function to persist across recusive calls
    if (isRoot) {
        loadCommands.loadedNames = [];
        loadCommands.skippedNames = [];
    }

    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await loadCommands(fullPath, false);
        } else if (entry.name.endsWith('.js')) {
            const fileUrl = 'file://' + path.resolve(fullPath);
            try {
                const cmdModule = await import(fileUrl);
                if (cmdModule.default && cmdModule.default.name) {
                    commands.set(cmdModule.default.name, cmdModule.default);
                    loadCommands.loadedNames.push(cmdModule.default.name);
                    if (cmdModule.default.alias && Array.isArray(cmdModule.default.alias)) {
                        cmdModule.default.alias.forEach(a => aliases.set(a, cmdModule.default.name));
                    }
                }
            } catch (err) {
                console.error(`[SKIP] Failed to load command ${fullPath}:`, err.message);
                loadCommands.skippedNames.push(fullPath.replace(/^(\.\/)?commands\//, ''));
            }
        }
    }
    
    if (isRoot) {
        console.log(`\n--- Command Loader Summary ---`);
        console.log(`✅ Successfully loaded: ${loadCommands.loadedNames.length}`);
        console.log(`📋 Loaded Commands: ${loadCommands.loadedNames.join(', ')}`);
        if (loadCommands.skippedNames.length > 0) {
            console.log(`❌ Skipped: ${loadCommands.skippedNames.length}`);
            console.log(`⏭️ Skipped Files: ${loadCommands.skippedNames.join(', ')}`);
        }
        console.log(`------------------------------\n`);
    }
};

export const handleMessage = async (sock, msg, db) => {
    if (!msg.message) return;
    if (msg.key.remoteJid === 'status@broadcast') return;

    const settings = typeof db.getSettings === 'function' ? await db.getSettings() : db.settings;
    const prefix = settings?.prefix || process.env.PREFIX || '!';
    
    let messageContent = msg.message.ephemeralMessage?.message || 
                         msg.message.viewOnceMessageV2?.message || 
                         msg.message.viewOnceMessage?.message || 
                         msg.message.documentWithCaptionMessage?.message?.documentMessage || 
                         msg.message;

    const text = messageContent.conversation || 
                 messageContent.extendedTextMessage?.text || 
                 messageContent.imageMessage?.caption || 
                 messageContent.videoMessage?.caption || '';

    if (!text || !text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const cmdStr = aliases.get(commandName) || commandName;
    const command = commands.get(cmdStr);
    
    if (!command) return;

    const reply = (textReply) => {
        sock.sendMessage(msg.key.remoteJid, { 
            text: textReply
        }, { quoted: msg });
    };

    try {
        await command.execute({ sock, msg, text, args, prefix, db, settings, reply });
    } catch (err) {
        console.error(`Error executing ${commandName}:`, err);
        reply('❌ An error occurred while executing that command.');
    }
};

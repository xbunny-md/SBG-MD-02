export default {
    name: 'hidetag',
    alias: ['tagall', 'attention'],
    category: 'group management',
    desc: 'Tags everyone in the group silently',
    execute: async ({ sock, msg, args, reply , settings}) => {
        if (!msg.key.remoteJid.endsWith('@g.us')) return reply('⚠️ This command can only be used in groups!');
        
        const footer = settings?.footer || 'Powered by SBG';
        const usage = `*╭───* *〔 HIDETAG USAGE 〕* *───⊷*\n` +
            `*│* *hidetag text*\n` +
            `*│* Tags everyone with text\n` +
            `*╰──────────────────────⊷*\n\n` +
            `> *${footer}*`;

        if (args.length === 0) return reply(usage);

        const meta = await sock.groupMetadata(msg.key.remoteJid);
        const participants = meta.participants.map(p => p.id);
        const tagMsg = args.join(' ');
        sock.sendMessage(msg.key.remoteJid, { text: tagMsg, mentions: participants });
    }
};

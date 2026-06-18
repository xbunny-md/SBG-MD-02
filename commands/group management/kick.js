export default {
    name: 'kick',
    alias: ['remove'],
    category: 'group management',
    desc: 'Removes a user from the group',
    execute: async ({ sock, msg, args, reply , settings}) => {
        if (!msg.key.remoteJid.endsWith('@g.us')) return reply('⚠️ This command can only be used in groups!');

        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedParticipant = msg.message.extendedTextMessage?.contextInfo?.participant;

        const footer = settings?.footer || 'Powered by SBG';
        const usage = `*╭───* *〔 KICK USAGE* *〔* *───⊷*\n` +
            `*│* *kick tag*\n` +
            `*│* Tag someone to kick\n` +
            `*│*\n` +
            `*│* *kick reply*\n` +
            `*│* Reply a Message to kick\n` +
            `*│*\n` +
            `*│* *kick number*\n` +
            `*│* Use number to kick\n` +
            `*╰──────────────────────⊷*\n\n` +
            `> *${footer}*`;

        let targets = [];
        if (mentioned.length > 0) {
            targets = mentioned;
        } else if (quotedParticipant) {
            targets = [quotedParticipant];
        } else if (args.length > 0) {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num) targets = [`${num}@s.whatsapp.net`];
        }

        if (targets.length === 0) return reply(usage);

        try {
            await sock.groupParticipantsUpdate(msg.key.remoteJid, targets, 'remove');
            reply('✅ User(s) successfully kicked.');
        } catch (err) {
            reply('❌ Failed to kick user. Am I a group admin?');
        }
    }
};

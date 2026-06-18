export default {
    name: 'add',
    alias: ['invite'],
    category: 'group management',
    desc: 'Adds a user to the group',
    execute: async ({ sock, msg, args, reply , settings}) => {
        if (!msg.key.remoteJid.endsWith('@g.us')) return reply('⚠️ This command can only be used in groups!');

        const footer = settings?.footer || 'Powered by SBG';
        const usage = `*╭───* *〔 ADD USAGE 〕* *───⊷*\n` +
            `*│* *add number*\n` +
            `*│* Use number to add to group\n` +
            `*╰──────────────────────⊷*\n\n` +
            `> *${footer}*`;

        const num = args[0]?.replace(/[^0-9]/g, '');
        if (!num) return reply(usage);

        try {
            await sock.groupParticipantsUpdate(msg.key.remoteJid, [`${num}@s.whatsapp.net`], 'add');
            reply('✅ User added.');
        } catch (err) {
            reply('❌ Failed to add user. Am I an admin or does privacy restrict it?');
        }
    }
};

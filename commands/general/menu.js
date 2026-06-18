import { commands } from '../../lib/handler.js';

export default {
    name: 'menu',
    alias: ['help', 'list', 'commands'],
    category: 'general',
    desc: 'Displays the bot menu grouped by categories',
    execute: async ({ reply , settings}) => {
        const categories = {};
        for (const cmd of commands.values()) {
            const cat = cmd.category || 'uncategorized';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(cmd.name);
        }

        const footer = settings?.footer || 'Powered by SBG';
        const botName = settings?.botName || 'SBG Bot';

        let menuText = `*╭───* *〔 ${botName.toUpperCase()} MENUS* *〔* *───⊷*\n`;
        for (const [cat, cmds] of Object.entries(categories)) {
            menuText += `*│*\n*│* 🔹 *${cat.toUpperCase()}*\n`;
            for (const cmd of cmds) {
                menuText += `*│*  ${cmd}\n`;
            }
        }
        menuText += `*╰──────────────────────⊷*\n\n> *${footer}*`;
        
        reply(menuText);
    }
};

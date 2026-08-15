const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const app = express();
app.use(express.json());
app.use(cors());

const DB_FILE = './results.json';
const PORT = process.env.PORT || 8080;

// --- خريطة الروم لكل جيم مود مع اسم الرتبة الخاصة به ---
const waitlistConfig = {
    '1535976898893586434': { name: 'Sword', role: 'sword-waitlist' },
    '1538238432730685500': { name: 'Mace', role: 'mace-waitlist' },
    '1538238485016617181': { name: 'Vanilla', role: 'vanilla-waitlist' },
    '1538238536715870258': { name: 'UHC', role: 'uhc-waitlist' },
    '1538238611063963719': { name: 'Pot', role: 'pot-waitlist' },
    '1538238671206223872': { name: 'NethOP', role: 'nethop-waitlist' },
    '1538238713048469567': { name: 'SMP', role: 'smp-waitlist' },
    '1538238766484029590': { name: 'Axe', role: 'axe-waitlist' }
};

// --- نظام حالة قائمة الانتظار لكل روم على حدة ---
let waitlists = {};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! 🚀`);
});

// --- دوال توليد الـ Embed والأزرار لكل روم ---
function getWaitlistState(channelId) {
    if (!waitlists[channelId]) {
        waitlists[channelId] = {
            isOpen: false,
            testerName: null,
            testerId: null,
            maxSeats: 20,
            queue: [],
            messageId: null
        };
    }
    return waitlists[channelId];
}

function generateEmbed(channelId) {
    const state = getWaitlistState(channelId);
    const modeInfo = waitlistConfig[channelId] ? waitlistConfig[channelId].name : 'Test';

    if (!state.isOpen) {
        return new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle(`No Testers Online (${modeInfo})`)
            .setDescription('No testers for this mode are available at this time.\nYou will be pinged when a tester is available.\nCheck back later!')
            .setFooter({ text: `Last testing session: ${new Date().toLocaleDateString()}` })
            .setTimestamp();
    }

    let queueListText = 'No players in queue yet.';
    if (state.queue.length > 0) {
        queueListText = state.queue.map((user, index) => `**${index + 1}.** <@${user.id}>`).join('\n');
    }

    return new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`🟢 ${modeInfo} Testing is Open!`)
        .setDescription(`Tester **${state.testerName}** is now taking tests!\nClick the button below to join the waitlist (Max: ${state.queue.length}/${state.maxSeats}).`)
        .addFields({ name: '📋 Current Queue (Waitlist)', value: queueListText })
        .setTimestamp();
}

function generateComponents(channelId) {
    const state = getWaitlistState(channelId);
    if (!state.isOpen) return [];

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('join_waitlist')
                .setLabel(`Join (${state.queue.length}/${state.maxSeats})`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('leave_waitlist')
                .setLabel('Leave Waitlist (مغادرة)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('next_player')
                .setLabel('Next Player (اختبار التالي)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('close_test')
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger)
        );

    return [row1];
}

// --- معالجة الأوامر ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // أمر !test القديم لتسجيل النتائج
    if (message.content.startsWith('!test')) {
        try {
            const args = message.content.split(' ').slice(1);
            if (args.length < 3) return message.reply('❌ الاستخدام: `!test [الاسم] [الرتبة] [الجيم مود]` مع إرفاق صورة السكن.');

            const attachment = message.attachments.first();
            const skinUrl = attachment ? attachment.url : "https://i.imgur.com/k2Lh4sC.png";

            const newResult = {
                minecraftName: args[0],
                tierLevel: args[1],
                gameMode: args.slice(2).join(' '),
                tester: message.author.username,
                skinUrl: skinUrl,
                date: new Date().toISOString().split('T')[0]
            };

            let results = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : [];
            const existingIndex = results.findIndex(item => 
                item.minecraftName.toLowerCase() === newResult.minecraftName.toLowerCase() &&
                item.gameMode.toLowerCase() === newResult.gameMode.toLowerCase()
            );

            if (existingIndex !== -1) results[existingIndex] = newResult;
            else results.unshift(newResult);

            fs.writeFileSync(DB_FILE, JSON.stringify(results, null, 2));
            await syncResultsToGitHub(results);
            message.reply(`✅ تم تسجيل نتيجة **${newResult.minecraftName}** بنجاح وتحديث الموقع!`);
        } catch (err) {
            message.reply('❌ حدث خطأ: ' + err.message);
        }
    }

    // أمر تجهيز رسالة الويت ليست في الروم (!setupwaitlist)
    if (message.content === '!setupwaitlist') {
        if (!waitlistConfig[message.channel.id]) {
            return message.reply('❌ هذه القناة ليست مسجلة كقناة ويت ليست لأي جيم مود!');
        }

        const state = getWaitlistState(message.channel.id);
        const embed = generateEmbed(message.channel.id);
        const sentMsg = await message.channel.send({ embeds: [embed] });
        state.messageId = sentMsg.id;

        await message.delete().catch(() => {});
    }

    // أمر فتح الويت ليست للتيستر (!opentest)
    if (message.content === '!opentest') {
        if (!waitlistConfig[message.channel.id]) {
            return message.reply('❌ هذه القناة ليست مخصصة للويت ليست!');
        }
        if (!message.member.roles.cache.some(role => role.name === 'Tester')) {
            return message.reply('❌ عذراً، هذا الأمر مخصص للتيسترين فقط!');
        }

        const state = getWaitlistState(message.channel.id);
        state.isOpen = true;
        state.testerName = message.author.username;
        state.testerId = message.author.id;
        state.queue = [];

        const embed = generateEmbed(message.channel.id);
        const components = generateComponents(message.channel.id);

        if (state.messageId) {
            try {
                const msg = await message.channel.messages.fetch(state.messageId);
                await msg.edit({ embeds: [embed], components: components });
            } catch (e) {
                const sentMsg = await message.channel.send({ embeds: [embed], components: components });
                state.messageId = sentMsg.id;
            }
        } else {
            const sentMsg = await message.channel.send({ embeds: [embed], components: components });
            state.messageId = sentMsg.id;
        }

        await message.delete().catch(() => {});
    }
});

// --- إدارة الأزرار التفاعلية ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const channelId = interaction.channel.id;

    if (!waitlistConfig[channelId]) return;
    const state = getWaitlistState(channelId);
    const modeData = waitlistConfig[channelId];

    // 1. الانضمام للويت ليست
    if (interaction.customId === 'join_waitlist') {
        if (!state.isOpen) return interaction.reply({ content: '❌ الاختبار مغلق حالياً!', ephemeral: true });
        if (state.queue.length >= state.maxSeats) return interaction.reply({ content: '⚠️ عذراً، امتلاءت المقاعد!', ephemeral: true });
        if (state.queue.some(u => u.id === interaction.user.id)) return interaction.reply({ content: '⚠️ أنت موجود بالفعل في القائمة!', ephemeral: true });

        state.queue.push({ id: interaction.user.id, tag: interaction.user.tag });

        const embed = generateEmbed(channelId);
        const components = generateComponents(channelId);
        await interaction.update({ embeds: [embed], components: components });
        await interaction.followUp({ content: `✅ تم إضافتك لقائمة انتظار **${modeData.name}** بنجاح! ترتيبك: ${state.queue.length}`, ephemeral: true });
    }

    // 2. مغادرة الويت ليست بنفسه (زر جديد يتيح للاعب الخروج)
    if (interaction.customId === 'leave_waitlist') {
        if (!state.queue.some(u => u.id === interaction.user.id)) {
            return interaction.reply({ content: '⚠️ أنت لست موجوداً في قائمة الانتظار أساساً!', ephemeral: true });
        }

        state.queue = state.queue.filter(u => u.id !== interaction.user.id);

        const embed = generateEmbed(channelId);
        const components = generateComponents(channelId);
        await interaction.update({ embeds: [embed], components: components });
        await interaction.followUp({ content: `✅ لقد قمت بمغادرة قائمة انتظار **${modeData.name}** بنجاح.`, ephemeral: true });
    }

    // 3. اختبار التالي (Next Player) - يعطي رتبة الجيم مود ويسحبها عن السابق
    if (interaction.customId === 'next_player') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isTester = member.roles.cache.some(role => role.name === 'Tester');

        if (!isTester && interaction.user.id !== state.testerId) {
            return interaction.reply({ content: '❌ فقط التيستر المسؤول يمكنه سحب اللاعب التالي!', ephemeral: true });
        }

        if (state.queue.length === 0) {
            return interaction.reply({ content: '⚠️ قائمة الانتظار فارغة تماماً!', ephemeral: true });
        }

        const role = interaction.guild.roles.cache.find(r => r.name === modeData.role);
        if (!role) {
            return interaction.reply({ content: `❌ لم يتم العثور على رتبة الروم في السيرفر باسم: \`${modeData.role}\``, ephemeral: true });
        }

        // سحب الشخص الحالي (المنتهي) من القائمة وإزالة الرتبة عنه
        const finishedUser = state.queue.shift();
        try {
            const finishedMember = await interaction.guild.members.fetch(finishedUser.id);
            await finishedMember.roles.remove(role);
        } catch (e) {}

        // إعطاء الرتبة للشخص الجديد رقم 1
        if (state.queue.length > 0) {
            const nextUser = state.queue[0];
            try {
                const nextMember = await interaction.guild.members.fetch(nextUser.id);
                await nextMember.roles.add(role);

                const embed = generateEmbed(channelId);
                const components = generateComponents(channelId);
                await interaction.update({ embeds: [embed], components: components });

                await interaction.channel.send(`📢 دور اللاعب <@${nextUser.id}> في **${modeData.name}** الآن! وتم منحه رتبة الروم.`);
            } catch (e) {
                await interaction.reply({ content: '❌ حدث خطأ أثناء منح الرتبة للاعب!', ephemeral: true });
            }
        } else {
            const embed = generateEmbed(channelId);
            const components = generateComponents(channelId);
            await interaction.update({ embeds: [embed], components: components });
            await interaction.channel.send(`✅ انتهت قائمة انتظار **${modeData.name}**!`);
        }
    }

    // 4. إغلاق الاختبار
    if (interaction.customId === 'close_test') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isTester = member.roles.cache.some(role => role.name === 'Tester');

        if (!isTester && interaction.user.id !== state.testerId) {
            return interaction.reply({ content: '❌ فقط التيستر المسؤول يمكنه إغلاق الاختبار!', ephemeral: true });
        }

        state.isOpen = false;
        state.testerName = null;
        state.testerId = null;
        state.queue = [];

        const embed = generateEmbed(channelId);
        await interaction.update({ embeds: [embed], components: [] });
    }
});

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
}

// --- دالة المزامنة مع GitHub ---
async function syncResultsToGitHub(data) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return;
    
    const url = `https://api.github.com/repos/gw410551-netizen/speed-tiers/contents/results.json`;

    try {
        const response = await axios.get(url, { headers: { Authorization: `token ${token}` } });
        await axios.put(url, {
            message: `Update results.json automatically`,
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha: response.data.sha
        }, { headers: { Authorization: `token ${token}` } });
    } catch (err) {
        console.error('GitHub Sync Error:', err.message);
    }
}

app.get('/api/results', async (req, res) => {
    try {
        const response = await axios.get(`https://api.github.com/repos/gw410551-netizen/speed-tiers/contents/results.json`, {
            headers: process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}
        });
        const data = JSON.parse(Buffer.from(response.data.content, 'base64').toString('utf8'));
        res.json(data);
    } catch (err) {
        res.json(fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : []);
    }
});

app.use(express.static('public'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

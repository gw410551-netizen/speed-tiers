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

// --- نظام حالة قائمة الانتظار (Waitlist State) ---
let waitlistState = {
    isOpen: false,
    testerName: null,
    testerId: null,
    maxSeats: 20,
    queue: [],
    messageId: null,
    channelId: null
};

// --- إعدادات بوت الديسكورد ---
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

// --- معالجة الرسائل والأوامر والأزرار ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // 1. أمر تسجيل النتائج القديم (!test)
    if (message.content.startsWith('!test')) {
        try {
            const args = message.content.split(' ').slice(1);
            
            if (args.length < 3) {
                return message.reply('❌ الاستخدام الصحيح: `!test [الاسم] [الرتبة] [الجيم مود]` مع إرفاق صورة السكن.');
            }

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

            let results = [];
            if (fs.existsSync(DB_FILE)) {
                results = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            }

            const existingIndex = results.findIndex(item => 
                item.minecraftName.toLowerCase() === newResult.minecraftName.toLowerCase() &&
                item.gameMode.toLowerCase() === newResult.gameMode.toLowerCase()
            );

            if (existingIndex !== -1) {
                results[existingIndex] = newResult;
            } else {
                results.unshift(newResult);
            }

            fs.writeFileSync(DB_FILE, JSON.stringify(results, null, 2));
            await syncResultsToGitHub(results);
            
            message.reply(`✅ تم تسجيل نتيجة **${newResult.minecraftName}** بنجاح وتحديث الموقع!`);
        } catch (err) {
            message.reply('❌ حدث خطأ: ' + err.message);
        }
    }

    // 2. أمر إرسال رسالة الحالة الحمراء الأساسية في الروم (!setupwaitlist)
    if (message.content === '!setupwaitlist') {
        if (!message.member.roles.cache.some(role => role.name === 'Tester') && !message.member.permissions.has('Administrator')) {
            return message.reply('❌ هذا الأمر مخصص للآدمن أو التيسترين فقط!');
        }

        const offlineEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('No Testers Online')
            .setDescription('No testers for your region are available at this time.\nYou will be pinged when a tester is available.\nCheck back later!')
            .setFooter({ text: `Last testing session: ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        const sentMsg = await message.channel.send({ embeds: [offlineEmbed] });
        waitlistState.messageId = sentMsg.id;
        waitlistState.channelId = message.channel.id;

        await message.delete().catch(() => {});
    }

    // 3. أمر فتح قائمة الانتظار (!opentest)
    if (message.content === '!opentest') {
        if (!message.member.roles.cache.some(role => role.name === 'Tester')) {
            return message.reply('❌ عذراً، هذا الأمر مخصص لحاملي رتبة `@Tester` فقط!');
        }

        waitlistState.isOpen = true;
        waitlistState.testerName = message.author.username;
        waitlistState.testerId = message.author.id;
        waitlistState.queue = [];
        waitlistState.channelId = message.channel.id;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🟢 Testing is Open!')
            .setDescription(`Tester **${message.author.username}** is now taking tests!\nClick the button below to join the waitlist (Max: ${waitlistState.maxSeats} seats).`)
            .addFields({ name: 'Current Queue', value: '0 players in queue' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join_waitlist')
                    .setLabel('Join Waitlist (0/20)')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_test')
                    .setLabel('Close Test')
                    .setStyle(ButtonStyle.Danger)
            );

        // إذا كانت رسالة الحالة موجودة مسبقاً، قم بتعديلها (Edit)، وإلا أرسل رسالة جديدة
        if (waitlistState.messageId) {
            try {
                const channel = await client.channels.fetch(waitlistState.channelId);
                const msg = await channel.messages.fetch(waitlistState.messageId);
                await msg.edit({ embeds: [embed], components: [row] });
            } catch (e) {
                const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
                waitlistState.messageId = sentMessage.id;
            }
        } else {
            const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
            waitlistState.messageId = sentMessage.id;
        }
        
        await message.delete().catch(() => {});
    }
});

// --- إدارة التفاعل مع الأزرار (Buttons) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // زر الانضمام لقائمة الانتظار
    if (interaction.customId === 'join_waitlist') {
        if (!waitlistState.isOpen) {
            return interaction.reply({ content: '❌ الاختبار مغلق حالياً!', ephemeral: true });
        }

        if (waitlistState.queue.length >= waitlistState.maxSeats) {
            return interaction.reply({ content: `⚠️ عذراً، لقد امتلاء عدد المقاعد (${waitlistState.maxSeats}/${waitlistState.maxSeats})! انتظر حتى ينتهي التيستر الحالي.`, ephemeral: true });
        }

        if (waitlistState.queue.includes(interaction.user.id)) {
            return interaction.reply({ content: '⚠️ أنت بالفعل موجود في قائمة الانتظار!', ephemeral: true });
        }

        waitlistState.queue.push(interaction.user.id);
        const currentCount = waitlistState.queue.length;

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setFields({ name: 'Current Queue', value: `${currentCount} players in queue` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join_waitlist')
                    .setLabel(`Join Waitlist (${currentCount}/${waitlistState.maxSeats})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_test')
                    .setLabel('Close Test')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.update({ embeds: [embed], components: [row] });
        await interaction.followUp({ content: `✅ تم إضافتك لقائمة الانتظار بنجاح! ترتيبك: ${currentCount}`, ephemeral: true });
    }

    // زر إغلاق الاختبار من قِبل التيستر
    if (interaction.customId === 'close_test') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isTesterRole = member.roles.cache.some(role => role.name === 'Tester');
        
        if (!isTesterRole && interaction.user.id !== waitlistState.testerId) {
            return interaction.reply({ content: '❌ فقط التيستر المسؤول يمكنه إغلاق الاختبار!', ephemeral: true });
        }

        waitlistState.isOpen = false;
        waitlistState.testerName = null;
        waitlistState.testerId = null;
        waitlistState.queue = [];

        const offlineEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('No Testers Online')
            .setDescription('No testers for your region are available at this time.\nYou will be pinged when a tester is available.\nCheck back later!')
            .setFooter({ text: `Last testing session: ${new Date().toLocaleDateString()}` })
            .setTimestamp();

        // تحديث نفس الرسالة وإزالة الأزرار لتعود للشكل الأحمر الصامت
        await interaction.update({ embeds: [offlineEmbed], components: [] });
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

// --- مسارات الـ API للموقع ---
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

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
    queue: [], // سيخزن الكائنات بدلاً من الـ IDs فقط: [{ id: '...', tag: '...' }]
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

// --- دوال مساعدة لتحديث الـ Embed والأسماء ---
function generateWaitlistEmbed() {
    if (!waitlistState.isOpen) {
        return new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('No Testers Online')
            .setDescription('No testers for your region are available at this time.\nYou will be pinged when a tester is available.\nCheck back later!')
            .setFooter({ text: `Last testing session: ${new Date().toLocaleDateString()}` })
            .setTimestamp();
    }

    // تجهيز قائمة الأسماء بالترتيب
    let queueListText = 'No players in queue yet.';
    if (waitlistState.queue.length > 0) {
        queueListText = waitlistState.queue.map((user, index) => `**${index + 1}.** <@${user.id}>`).join('\n');
    }

    return new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🟢 Testing is Open!')
        .setDescription(`Tester **${waitlistState.testerName}** is now taking tests!\nClick the button below to join the waitlist (Max: ${waitlistState.queue.length}/${waitlistState.maxSeats}).`)
        .addFields(
            { name: '📋 Current Queue (Waitlist)', value: queueListText }
        )
        .setTimestamp();
}

function generateWaitlistComponents() {
    if (!waitlistState.isOpen) return [];

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('join_waitlist')
                .setLabel(`Join Waitlist (${waitlistState.queue.length}/${waitlistState.maxSeats})`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('next_player')
                .setLabel('Next Player (اختبار التالي)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('close_test')
                .setLabel('Close Test')
                .setStyle(ButtonStyle.Danger)
        );

    return [row1];
}

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

        const embed = generateWaitlistEmbed();
        const sentMsg = await message.channel.send({ embeds: [embed] });
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

        const embed = generateWaitlistEmbed();
        const components = generateWaitlistComponents();

        if (waitlistState.messageId) {
            try {
                const channel = await client.channels.fetch(waitlistState.channelId);
                const msg = await channel.messages.fetch(waitlistState.messageId);
                await msg.edit({ embeds: [embed], components: components });
            } catch (e) {
                const sentMessage = await message.channel.send({ embeds: [embed], components: components });
                waitlistState.messageId = sentMessage.id;
            }
        } else {
            const sentMessage = await message.channel.send({ embeds: [embed], components: components });
            waitlistState.messageId = sentMessage.id;
        }
        
        await message.delete().catch(() => {});
    }
});

// --- إدارة التفاعل مع الأزرار (Buttons) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // أ. زر الانضمام لقائمة الانتظار
    if (interaction.customId === 'join_waitlist') {
        if (!waitlistState.isOpen) {
            return interaction.reply({ content: '❌ الاختبار مغلق حالياً!', ephemeral: true });
        }

        if (waitlistState.queue.length >= waitlistState.maxSeats) {
            return interaction.reply({ content: `⚠️ عذراً، لقد امتلاء عدد المقاعد (${waitlistState.maxSeats}/${waitlistState.maxSeats})!`, ephemeral: true });
        }

        if (waitlistState.queue.some(u => u.id === interaction.user.id)) {
            return interaction.reply({ content: '⚠️ أنت بالفعل موجود في قائمة الانتظار!', ephemeral: true });
        }

        // إضافة المستخدم للقائمة مع الـ ID والـ Username
        waitlistState.queue.push({ id: interaction.user.id, tag: interaction.user.tag });

        // تحديث الرسالة بالأسماء الجديدة
        const embed = generateWaitlistEmbed();
        const components = generateWaitlistComponents();
        await interaction.update({ embeds: [embed], components: components });
        
        await interaction.followUp({ content: `✅ تم إضافتك لقائمة الانتظار بنجاح! ترتيبك: ${waitlistState.queue.length}`, ephemeral: true });
    }

    // --- داخل interactionCreate ---

    // ب. زر سحب الشخص التالي (Next Player)
    if (interaction.customId === 'next_player') {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isTesterRole = member.roles.cache.some(role => role.name === 'Tester');

        if (!isTesterRole && interaction.user.id !== waitlistState.testerId) {
            return interaction.reply({ content: '❌ فقط التيستر المسؤول يمكنه سحب اللاعب التالي!', ephemeral: true });
        }

        if (waitlistState.queue.length === 0) {
            return interaction.reply({ content: '⚠️ قائمة الانتظار فارغة تماماً!', ephemeral: true });
        }

        const roleName = 'waitlist'; // اسم الرتبة
        const testRoomId = '1535779432776597566'; // آيدي روم الاختبار
        const role = interaction.guild.roles.cache.find(r => r.name === roleName);

        if (!role) {
            return interaction.reply({ content: `❌ لم يتم العثور على رتبة باسم ${roleName}!`, ephemeral: true });
        }

        // 1. سحب الشخص الحالي (الذي انتهى اختباره) من القائمة
        const finishedUser = waitlistState.queue.shift(); 

        // 2. إزالة الرتبة عن الشخص الذي انتهى اختباره
        try {
            const finishedMember = await interaction.guild.members.fetch(finishedUser.id);
            await finishedMember.roles.remove(role);
        } catch (e) {
            console.log('لم استطع إزالة الرتبة (ربما غادر السيرفر)');
        }

        // 3. سحب الشخص الجديد (الذي صار ترتيبه رقم 1)
        if (waitlistState.queue.length > 0) {
            const nextUser = waitlistState.queue[0]; // الشخص الجديد في الترتيب
            
            try {
                const nextMember = await interaction.guild.members.fetch(nextUser.id);
                await nextMember.roles.add(role); // إعطاء الرتبة
                
                // تحديث الرسالة
                const embed = generateWaitlistEmbed();
                const components = generateWaitlistComponents();
                await interaction.update({ embeds: [embed], components: components });

                // منشن للاعب الجديد
                await interaction.channel.send(`📢 دور اللاعب <@${nextUser.id}> الآن! تم منحه صلاحية دخول روم الاختبار.`);
            } catch (e) {
                await interaction.reply({ content: '❌ حدث خطأ أثناء إعطاء الرتبة للمستخدم!', ephemeral: true });
            }
        } else {
            // القائمة أصبحت فارغة
            const embed = generateWaitlistEmbed();
            const components = generateWaitlistComponents();
            await interaction.update({ embeds: [embed], components: components });
            await interaction.channel.send(`✅ انتهت قائمة الانتظار!`);
        }
    }

    // ج. زر إغلاق الاختبار
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

        const offlineEmbed = generateWaitlistEmbed();
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
        const response = argumentCheck = await axios.get(`https://api.github.com/repos/gw410551-netizen/speed-tiers/contents/results.json`, {
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

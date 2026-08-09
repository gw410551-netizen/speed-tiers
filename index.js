const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! 🚀`);
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith('!test') || message.author.bot) return;

    const args = message.content.split(' ').slice(1);

    // 1. استخراج منشن المسؤول
    const member = message.mentions.members.first();

    // 2. استخراج الرتبة
    const validTiers = ['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5'];
    const tierLevel = args.find(arg => validTiers.includes(arg.toUpperCase()))?.toUpperCase();

    // 3. استخراج الجيم مود
    const validModes = ['sword', 'mace', 'axe', 'vanilla', 'uhc', 'pot', 'nethop', 'smp'];
    const foundMode = args.find(arg => validModes.includes(arg.toLowerCase()));
    const gameMode = foundMode ? foundMode.charAt(0).toUpperCase() + foundMode.slice(1).toLowerCase() : '';

    // 4. استخراج اسم ماينكرافت (الكلمة التي ليست منشن وليست رتبة وليست جيم مود)
    const minecraftName = args.find(arg => 
        !arg.includes('@') && 
        !validTiers.includes(arg.toUpperCase()) && 
        !validModes.includes(arg.toLowerCase())
    );

    // 5. التحقق من إرفاق صورة السكن (PNG) مع الأمر
    const attachedImage = message.attachments.first();

    if (!member || !tierLevel || !minecraftName || !gameMode || !attachedImage) {
        return message.reply('❌ صيغة الأمر غير صحيحة أو نسيت إرفاق صورة السكن!\nيجب إرفاق صورة (PNG) مع الأمر هكذا:\n`!test Alpha_Craft @RobotStudio LT5 Vanilla` (مع رفع صورة السكن في نفس رسالة الأمر)');
    }

    // رابط الصورة المرفقة التي رفعها المستخدم
    const skinUrl = attachedImage.url;

    // آيدي روم النتائج
    const resultsChannelId = '1535779240719556618'; 
    const resultsChannel = message.guild.channels.cache.get(resultsChannelId);

    if (!resultsChannel) {
        return message.reply('❌ لم يتم العثور على روم النتائج، تأكد من آيدي الروم في الكود.');
    }

    // إعطاء الرتبة لعضو ديسكورد
    const role = message.guild.roles.cache.find(r => r.name.toUpperCase() === tierLevel);
    if (role) {
        try {
            await member.roles.add(role);
        } catch (err) {
            console.error(err);
            return message.reply('❌ فشل إعطاء الرتبة، تأكد أن رتبة البوت أعلى من رتبة اللاعب!');
        }
    } else {
        return message.reply(`⚠️ الرتبة **${tierLevel}** غير موجودة في رتب السيرفر!`);
    }

    // تصميم الـ Embed مع صورة السكن المرفقة
    const resultEmbed = new EmbedBuilder()
        .setColor('#00FFCC')
        .setTitle('⚡ SpeedTiers - نتيجة اختبار جديدة')
        .addFields(
            { name: '👤 اللاعب (Minecraft)', value: `\`${minecraftName}\``, inline: true },
            { name: '🏆 الرتبة المحققة', value: `**${tierLevel}**`, inline: true },
            { name: '⚔️ النمط', value: `**${gameMode}**`, inline: true },
            { name: '🛡️ المختبر المسؤول', value: `${message.author}`, inline: false }
        )
        .setImage(skinUrl) // استخدام رابط الصورة التي رفَعها المسؤول
        .setTimestamp()
        .setFooter({ text: 'SpeedTiers Testing System' });

    await resultsChannel.send({ embeds: [resultEmbed] });

    // إرسال البيانات لسيرفر الـ Backend لتظهر في الموقع
    try {
        await fetch('http://127.0.0.1:8080/api/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                minecraftName,
                tierLevel,
                gameMode,
                tester: message.author.tag,
                date: new Date().toISOString(),
                skinUrl // حفظنا رابط السكن أيضاً إذا أردت عرضه في الموقع مستقبلاً
            })
        });
        message.reply('✅ تم تسجيل النتيجة وسحب السكن المرفق وإعطاء الرتبة وحفظها في الموقع بنجاح!');
    } catch (err) {
        console.error('فشل إرسال البيانات للموقع:', err);
        message.reply('⚠️ تم إعطاء الرتبة وتسجيل الديسكورد، ولكن حدث خطأ في تحديث الموقع.');
    }
});

client.login(process.env.DISCORD_TOKEN);

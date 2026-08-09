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

    // 2. استخراج الرتبة (يبحث عن أي كلمة مطابقة لقائمة التيرز)
    const validTiers = ['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5'];
    const tierLevel = args.find(arg => validTiers.includes(arg.toUpperCase()))?.toUpperCase();

    // 3. استخراج الجيم مود (يبحث عن أي نمط من الأنماط المتاحة)
    const validModes = ['sword', 'mace', 'axe', 'vanilla', 'uhc', 'pot', 'nethop', 'smp'];
    const foundMode = args.find(arg => validModes.includes(arg.toLowerCase()));
    const gameMode = foundMode ? foundMode.charAt(0).toUpperCase() + foundMode.slice(1).toLowerCase() : '';

    // 4. استخراج اسم ماينكرافت (الكلمة التي ليست منشن وليست رتبة وليست جيم مود)
    const minecraftName = args.find(arg => 
        !arg.includes('@') && 
        !validTiers.includes(arg.toUpperCase()) && 
        !validModes.includes(arg.toLowerCase())
    );

    if (!member || !tierLevel || !minecraftName || !gameMode) {
        return message.reply('❌ صيغة الأمر غير صحيحة! مثال:\n`!test Alpha_Craft @RobotStudio LT5 Vanilla`');
    }
    // آيدي روم النتائج (ضع آيدي رومك هنا)
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

    // تصميم الـ Embed (الاسم وسكن ماينكرافت الحقيقي + منشن ديسكورد)
    const resultEmbed = new EmbedBuilder()
        .setColor('#00FFCC')
        .setTitle('⚡ SpeedTiers - نتيجة اختبار جديدة')
        .addFields(
            { name: '👤 اللاعب (Minecraft)', value: `\`${minecraftName}\``, inline: true },
            { name: '🏆 الرتبة المحققة', value: `**${tierLevel}**`, inline: true },
            { name: '⚔️ النمط', value: `**${gameMode}**`, inline: true },
            { name: '🛡️ المختبر المسؤول', value: `${message.author}`, inline: false }
        )
        .setImage(`https://mc-heads.net/body/${minecraftName}/150`)
        .setTimestamp()
        .setFooter({ text: 'SpeedTiers Testing System' });

    await resultsChannel.send({ embeds: [resultEmbed] });
    message.reply('✅ تم تسجيل النتيجة وسحب السكن وإعطاء الرتبة بنجاح!');
    // إرسال البيانات لسيرفر الـ Backend لتظهر في الموقع
 const fs = require('fs');
// إرسال البيانات لسيرفر الـ Backend لتحديث الموقع وغيت هاب
    try {
        await fetch('http://127.0.0.1:8080/api/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                minecraftName,
                tierLevel,
                gameMode,
                tester: message.author.tag,
                date: new Date().toISOString()
            })
        });
        message.reply('✅ تم تسجيل النتيجة وإعطاء الرتبة وحفظها في الموقع وغيت هاب بنجاح!');
    } catch (err) {
        console.error('فشل إرسال البيانات للسيرفر:', err);
        message.reply('⚠️ تم إعطاء الرتبة وتسجيل الديسكورد، ولكن حدث خطأ في تحديث الموقع.');
    }
});

client.login(process.env.TOKEN);

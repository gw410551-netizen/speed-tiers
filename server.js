const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const app = express(); // التعريف الوحيد لـ app
app.use(express.json());
app.use(cors());

// إعداد البوت
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- وظائف البوت والسيرفر ---
async function syncResultsToGitHub(data) {
    const token = process.env.GITHUB_TOKEN;
    const url = `https://api.github.com/repos/gw410551-netizen/speed-tiers/contents/results.json`;
    try {
        const { data: fileData } = await axios.get(url, { headers: { Authorization: `token ${token}` } });
        await axios.put(url, {
            message: 'Update results',
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha: fileData.sha
        }, { headers: { Authorization: `token ${token}` } });
    } catch (e) { console.error('GitHub Sync Error:', e.message); }
}

client.on('messageCreate', async message => {
    if (!message.content.startsWith('!test') || message.author.bot) return;
    // ... (هنا ضع كود معالجة أمر !test الخاص بك) ...
    // تأكد أنك تستخدم fs.writeFileSync لحفظ results.json محلياً هنا
});

// مسارات السيرفر
app.get('/api/results', (req, res) => {
    res.json(fs.existsSync('./results.json') ? JSON.parse(fs.readFileSync('./results.json', 'utf8')) : []);
});

app.post('/api/results', async (req, res) => {
    // ... (هنا ضع كود معالجة POST الخاص بك) ...
    res.json({ success: true });
});

// التشغيل
client.login(process.env.DISCORD_TOKEN); // تأكد من الاسم الصحيح للمتغير
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

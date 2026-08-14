const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(express.json());
app.use(cors());

const DB_FILE = './results.json';

// --- إعدادات بوت الديسكورد ---
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

// هنا يمكنك وضع كود أوامر البوت الخاصة بك (مثل !test وغيرها)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // مثال لأمر !test للإرسال للسيرفر محلياً
    if (message.content.startsWith('!test')) {
        try {
            // إرسال الطلب مباشرة لسيرفر الـ Express المحلي
            const response = await axios.post(`http://localhost:${PORT}/api/results`, {
                minecraftName: "RobotStudioX",
                tierLevel: "LT3",
                gameMode: "Sword",
                tester: message.author.username,
                skinUrl: "https://minotar.net/avatar/RobotStudioX",
                date: new Date().toISOString().split('T')[0]
            });
            
            message.reply('تم إعطاء الرتبة وتحديث الموقع بنجاح!');
        } catch (err) {
            message.reply('تم إعطاء الرتبة، ولكن حدث خطأ في تحديث الموقع: ' + err.message);
        }
    }
});

// تسجيل دخول البوت باستخدام التوكن من متغيرات البيئة
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error("DISCORD_TOKEN is missing in environment variables!");
}

// --- دالة مزامنة النتائج مع GitHub ---
async function syncResultsToGitHub(data) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return;
    
    const owner = 'gw410551-netizen'; 
    const repo = 'speed-tiers'; 
    const path = 'results.json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    try {
        const { data: fileData } = await axios.get(url, { 
            headers: { Authorization: `token ${token}` } 
        });

        await axios.put(url, {
            message: 'Update results.json automatically',
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha: fileData.sha 
        }, { headers: { Authorization: `token ${token}` } });
        
    } catch (err) { 
        console.error('GitHub Sync Error:', err.message); 
    }
}

// --- مسارات الـ API للموقع ---
app.get('/api/results', (req, res) => {
    if (!fs.existsSync(DB_FILE)) {
        return res.json([]);
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    res.json(data);
});

app.post('/api/results', async (resq, res) => {
    const newResult = resq.body;
    let results = [];
    
    if (fs.existsSync(DB_FILE)) {
        results = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
    
    const existingIndex = results.findIndex(item => 
        item.minecraftName.toLowerCase() === newResult.minecraftName.toLowerCase() &&
        item.gameMode.toLowerCase() === newResult.gameMode.toLowerCase()
    );

    if (existingIndex !== -1) {
        results[existingIndex].tierLevel = newResult.tierLevel;
        results[existingIndex].date = newResult.date;
        results[existingIndex].tester = newResult.tester;
        results[existingIndex].skinUrl = newResult.skinUrl;
    } else {
        results.unshift(newResult);
    }
    
    fs.writeFileSync(DB_FILE, JSON.stringify(results, null, 2));
    await syncResultsToGitHub(results);

    res.json({ success: true, message: 'تم تحديث النتيجة وحفظها في الموقع وغيت هاب بنجاح!' });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

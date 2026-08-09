const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors()); // السماح بالاتصال من أي مكان
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

const DB_FILE = './results.json';

// دالة مزامنة النتائج مع GitHub (موجودة في الأعلى ليراها السيرفر بوضوح)
async function syncResultsToGitHub(data) {
    const owner = 'gw410551-netizen';
    const repo = 'speed-tiers';
    const path = 'results.json';
    const token = process.env.GITHUB_TOKEN;

    try {
        const { data: fileData } = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            headers: { Authorization: `token ${token}` }
        });

        await axios.put(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            message: 'Update results automatically via Bot',
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha: fileData.sha
        }, {
            headers: { Authorization: `token ${token}` }
        });
        console.log('GitHub updated successfully!');
    } catch (error) {
        console.error('Error updating GitHub:', error.message);
    }
}

// مسار جلب النتائج للموقع
app.get('/api/results', (req, res) => {
    if (!fs.existsSync(DB_FILE)) {
        return res.json([]);
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    res.json(JSON.parse(data));
});

// استقبال نتيجة جديدة من البوت
app.post('/api/results', async (req, res) => {
    const newResult = req.body;
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
    } else {
        results.unshift(newResult);
    }

    fs.writeFileSync(DB_FILE, JSON.stringify(results, null, 2));
    await syncResultsToGitHub(results);

    res.json({ success: true, message: 'تم تحديث النتيجة وحفظها بنجاح' });
});

// خدمة ملفات الموقع
app.use(express.static('public'));

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // لا تستخدم require، بل قم بتشغيل البوت مباشرة هنا
    require('./index.js');
});

// إضافة "حافظ للنشاط" لمنع Railway من إغلاق الحاوية
setInterval(() => {
    console.log("System Status: Alive and Running...");
}, 300000); // يطبع رسالة كل 5 دقائق ليخبر Railway أن السيرفر نشط جداً

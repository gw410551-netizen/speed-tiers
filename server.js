const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios'); // تأكد من تثبيتها عبر npm install axios

const app = express();
app.use(express.json());
app.use(cors());

// ملف محلي لتخزين النتائج (قاعدة بيانات مؤقتة وبسيطة)
const DB_FILE = './results.json';

// دالة لرفع التحديثات تلقائياً إلى غيت هاب حتى لا تختفي النتائج عند إعادة تشغيل Railway
async function syncResultsToGitHub(data) {
    const token = process.env.GITHUB_TOKEN; // تأكد من إضافته في متغيرات البيئة في Railway
    if (!token) return;
    
    const owner = 'gw410551-netizen'; 
    const repo = 'speed-tiers'; 
    const path = 'results.json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    try {
        // 1. جلب الـ sha الحالي للملف على غيت هاب
        const { data: fileData } = await axios.get(url, { 
            headers: { Authorization: `token ${token}` } 
        });

        // 2. تحديث الملف بالبيانات الجديدة
        await axios.put(url, {
            message: 'Update results.json automatically',
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha: fileData.sha 
        }, { headers: { Authorization: `token ${token}` } });
        
    } catch (err) { 
        console.error('GitHub Sync Error:', err.message); 
    }
}

// جلب جميع النتائج للموقع
app.get('/api/results', (req, res) => {
    if (!fs.existsSync(DB_FILE)) {
        return res.json([]);
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    res.json(data);
});

// استقبال نتيجة جديدة أو تحديثها للبوت
app.post('/api/results', async (req, res) => {
    const newResult = req.body;
    let results = [];
    
    if (fs.existsSync(DB_FILE)) {
        results = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
    
    // البحث عما إذا كان اللاعب قد اختبر مسبقاً في نفس النمط (GameMode)
    const existingIndex = results.findIndex(item => 
        item.minecraftName.toLowerCase() === newResult.minecraftName.toLowerCase() &&
        item.gameMode.toLowerCase() === newResult.gameMode.toLowerCase()
    );

    if (existingIndex !== -1) {
        // إذا كان موجوداً مسبقاً، يتم تحديث رتبته وتاريخه والسكن بالنتيجة الجديدة
        results[existingIndex].tierLevel = newResult.tierLevel;
        results[existingIndex].date = newResult.date;
        results[existingIndex].tester = newResult.tester;
        results[existingIndex].skinUrl = newResult.skinUrl; // تم إضافة تحديث السكن هنا لضمان عمله
    } else {
        // إذا لم يكن موجوداً، يتم إضافته كجديد في الأعلى
        results.unshift(newResult);
    }
    
    // الحفظ محلياً في السيرفر
    fs.writeFileSync(DB_FILE, JSON.stringify(results, null, 2));

    // مزامنة البيانات وحفظها في غيت هاب فوراً لكي لا تختفي النتائج
    await syncResultsToGitHub(results);

    res.json({ success: true, message: 'تم تحديث النتيجة وحفظها في الموقع وغيت هاب بنجاح!' });
});

// لخدمة ملفات الموقع
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

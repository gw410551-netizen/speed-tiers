const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// ملف محلي لتخزين النتائج (قاعدة بيانات مؤقتة وبسيطة)
const DB_FILE = './results.json';

// جلب جميع النتائج للموقع
app.get('/api/results', (req, res) => {
    if (!fs.existsSync(DB_FILE)) {
        return res.json([]);
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(data);
});

// استقبال نتيجة جديدة من البوت
// استقبال نتيجة جديدة أو تحديثها للبوت
app.post('/api/results', (req, res) => {
    const newResult = req.body;
    let results = [];
    
    if (fs.existsSync(DB_FILE)) {
        results = JSON.parse(fs.readFileSync(DB_FILE));
    }
    
    // البحث عما إذا كان اللاعب قد اختبر مسبقاً في نفس النمط (GameMode)
    const existingIndex = results.findIndex(item => 
        item.minecraftName.toLowerCase() === newResult.minecraftName.toLowerCase() &&
        item.gameMode.toLowerCase() === newResult.gameMode.toLowerCase()
    );

    if (existingIndex !== -1) {
        // إذا كان موجوداً مسبقاً، يتم تحديث رتبته وتاريخه بالنتيجة الجديدة
        results[existingIndex].tierLevel = newResult.tierLevel;
        results[existingIndex].date = newResult.date;
        results[existingIndex].tester = newResult.tester;
    } else {
        // إذا لم يكن موجوداً، يتم إضافته كجديد في الأعلى
        results.unshift(newResult);
    }
    
    fs.writeFileSync(DB_FILE, JSON.stringify(results, null, 2));
    res.json({ success: true, message: 'تم تحديث النتيجة وحفظها بنجاح!' });
});
// لخدمة ملفات الموقع
app.use(express.static('public'));
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT} 🌐`);
});
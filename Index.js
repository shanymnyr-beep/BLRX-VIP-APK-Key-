const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const app      = express();

app.use(express.json());
app.use(cors());

// ─── قاعدة البيانات ───────────────────────────
mongoose.connect(process.env.MONGO_URL);

// ─── نموذج الـ Key ────────────────────────────
const Key = mongoose.model('Key', {
    key:        String,   // B45L97R80X100
    deviceId:   String,   // بصمة الجهاز
    expireDate: Date,
    isActive:   Boolean,
    plan:       String
});

// ═══════════════════════════════════════════════
//  API - تحقق من الـ Key
//  POST /api/verify
// ═══════════════════════════════════════════════
app.post('/api/verify', async (req, res) => {
    const { key, deviceId } = req.body;

    if (!key || !deviceId)
        return res.json({ success:false, code:'MISSING_DATA' });

    const k = await Key.findOne({ key });

    // مو موجود
    if (!k)
        return res.json({ success:false, code:'INVALID_KEY' });

    // معطل
    if (!k.isActive)
        return res.json({ success:false, code:'INVALID_KEY' });

    // منتهي
    if (new Date() > k.expireDate)
        return res.json({ success:false, code:'EXPIRED_KEY' });

    // جهاز مسجل مختلف
    if (k.deviceId && k.deviceId !== deviceId)
        return res.json({ success:false, code:'WRONG_DEVICE' });

    // أول استخدام - نسجل الجهاز
    if (!k.deviceId) {
        k.deviceId = deviceId;
        await k.save();
    }

    // ✅ ناجح
    const days = Math.ceil(
        (k.expireDate - new Date()) / (1000*60*60*24)
    );
    res.json({
        success: true,
        code: 'VALID',
        data: { plan: k.plan, daysLeft: days }
    });
});

// ═══════════════════════════════════════════════
//  لوحة التحكم - توليد Key
//  POST /api/admin/gen
// ═══════════════════════════════════════════════
app.post('/api/admin/gen', async (req, res) => {
    const { secret, plan } = req.body;

    // كلمة سر لوحة التحكم
    if (secret !== process.env.ADMIN_SECRET)
        return res.json({ success:false, msg:'Unauthorized' });

    // توليد key بصيغة B45L97R80X100
    function genKey() {
        const r = () => Math.floor(Math.random()*99)+1;
        return `B${r()}L${r()}R${r()}X${r()}`;
    }

    // تاريخ الانتهاء
    const date = new Date();
    switch(plan) {
        case '1day':    date.setDate(date.getDate()+1);    break;
        case '7days':   date.setDate(date.getDate()+7);    break;
        case '30days':  date.setDate(date.getDate()+30);   break;
        case 'lifetime':date.setFullYear(date.getFullYear()+99); break;
        default:        date.setDate(date.getDate()+30);
    }

    const newKey = await Key.create({
        key:        genKey(),
        deviceId:   null,
        expireDate: date,
        isActive:   true,
        plan:       plan || '30days'
    });

    res.json({ success:true, key: newKey.key });
});

// ═══════════════════════════════════════════════
//  لوحة التحكم - عرض كل الـ Keys
//  POST /api/admin/keys
// ═══════════════════════════════════════════════
app.post('/api/admin/keys', async (req, res) => {
    if (req.body.secret !== process.env.ADMIN_SECRET)
        return res.json({ success:false });

    const keys = await Key.find().sort({ _id:-1 });
    res.json({ success:true, keys });
});

// ═══════════════════════════════════════════════
//  لوحة التحكم - تعطيل Key
//  POST /api/admin/disable
// ═══════════════════════════════════════════════
app.post('/api/admin/disable', async (req, res) => {
    if (req.body.secret !== process.env.ADMIN_SECRET)
        return res.json({ success:false });

    await Key.updateOne(
        { key: req.body.key },
        { isActive: false }
    );
    res.json({ success:true });
});

// ═══════════════════════════════════════════════
//  لوحة التحكم - حذف Key
//  POST /api/admin/delete
// ═══════════════════════════════════════════════
app.post('/api/admin/delete', async (req, res) => {
    if (req.body.secret !== process.env.ADMIN_SECRET)
        return res.json({ success:false });

    await Key.deleteOne({ key: req.body.key });
    res.json({ success:true });
});

// ═══════════════════════════════════════════════
//  لوحة التحكم - ريست جهاز (يسمح باستخدامه على جهاز ثاني)
//  POST /api/admin/reset
// ═══════════════════════════════════════════════
app.post('/api/admin/reset', async (req, res) => {
    if (req.body.secret !== process.env.ADMIN_SECRET)
        return res.json({ success:false });

    await Key.updateOne(
        { key: req.body.key },
        { deviceId: null }
    );
    res.json({ success:true });
});

app.listen(process.env.PORT || 3000,
    () => console.log('Server running'));
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB Peak Performance Active"))
    .catch(err => console.log("DB Error:", err));

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    name: String, studentId: String, pass: String, 
    role: { type: String, enum: ['Student', 'Staff'] }, 
    branch: String, 
    year: { type: Number, default: 0 } 
}));

const Notice = mongoose.model('Notice', new mongoose.Schema({
    senderName: String, branch: String, year: Number, 
    message: String, 
    fileUrl: { type: String, default: "" }, 
    fileType: { type: String, enum: ['pdf', 'image', 'text'], default: 'text' },
    createdAt: { type: Date, default: Date.now }
}));

// --- AWS S3 CONFIG ---
const s3Client = new S3Client({
    region: "ap-south-1",
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY, secretAccessKey: process.env.AWS_SECRET_KEY }
});
const upload = multer({ storage: multer.memoryStorage() });

// --- OPTIMIZED ROUTES ---
app.post('/login', async (req, res) => {
    const user = await User.findOne({ studentId: req.body.studentId, pass: req.body.pass });
    user ? res.json(user) : res.status(401).send("Auth Failed");
});

app.post('/register', async (req, res) => {
    await new User(req.body).save();
    res.json({ status: "Success" });
});

// File Post (Image/PDF)
app.post('/post-notice', upload.single('file'), async (req, res) => {
    try {
        const isPdf = req.file.mimetype === 'application/pdf';
        const fileName = `edu_source/${Date.now()}_${req.file.originalname}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: "image-fragmentation-bucket-123",
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        }));
        const fileUrl = `https://image-fragmentation-bucket-123.s3.ap-south-1.amazonaws.com/${fileName}`;
        const notice = new Notice({ ...req.body, fileUrl, fileType: isPdf ? 'pdf' : 'image' });
        await notice.save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// Text-Only Post
app.post('/post-text-notice', async (req, res) => {
    try {
        await new Notice({ ...req.body, fileType: "text" }).save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// Targeted Feeds
app.get('/notices/:branch/:year', async (req, res) => {
    const data = await Notice.find({ branch: req.params.branch, year: req.params.year }).sort({ createdAt: -1 });
    res.json(data);
});

app.get('/notices-all/:branch', async (req, res) => {
    const data = await Notice.find({ branch: req.params.branch }).sort({ createdAt: -1 });
    res.json(data);
});

app.listen(process.env.PORT || 3000);

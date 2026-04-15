const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require('multer');
require('dotenv').config(); // Ensure you have your .env variables set up

const app = express();
app.use(cors());
app.use(express.json());

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Database Connected Successfully"))
    .catch(err => console.log("DB Connection Error:", err));

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    name: String, 
    studentId: String, 
    pass: String, 
    role: { type: String, enum: ['Student', 'Staff'] }, 
    branch: String, 
    year: { type: Number, default: 0 } 
}));

const Notice = mongoose.model('Notice', new mongoose.Schema({
    senderName: String, 
    branch: String, 
    year: Number, 
    message: String, 
    fileUrl: { type: String, default: "" }, 
    fileType: { type: String, enum: ['pdf', 'image', 'text'], default: 'text' },
    createdAt: { type: Date, default: Date.now }
}));

// --- AWS S3 CONFIG ---
const s3Client = new S3Client({
    region: "ap-south-1",
    credentials: { 
        accessKeyId: process.env.AWS_ACCESS_KEY, 
        secretAccessKey: process.env.AWS_SECRET_KEY 
    }
});
const upload = multer({ storage: multer.memoryStorage() });

// --- ROUTES ---

/**
 * ROOT ROUTE - Fixes the cron-job.org 404 error
 * This gives the cron-job a "200 OK" response to keep the server alive.
 */
app.get('/', (req, res) => {
    res.status(200).send("Edu Source API is live and active.");
});

// User Login
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ studentId: req.body.studentId, pass: req.body.pass });
        user ? res.json(user) : res.status(401).send("Authentication Failed");
    } catch (e) { res.status(500).send(e.message); }
});

// User Registration
app.post('/register', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// Post Notice with Media (Image/PDF)
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
        const notice = new Notice({ 
            ...req.body, 
            fileUrl, 
            fileType: isPdf ? 'pdf' : 'image' 
        });
        await notice.save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// Post Text-Only Notice (Bypasses S3 for speed)
app.post('/post-text-notice', async (req, res) => {
    try {
        const notice = new Notice({ 
            ...req.body, 
            fileType: "text", 
            fileUrl: "" 
        });
        await notice.save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// Get Notices for Students (Filtered by Branch and Year)
app.get('/notices/:branch/:year', async (req, res) => {
    try {
        const data = await Notice.find({ 
            branch: req.params.branch, 
            year: req.params.year 
        }).sort({ createdAt: -1 });
        res.json(data);
    } catch (e) { res.status(500).send(e.message); }
});

// Get All Notices for Staff (Filtered by Branch only)
app.get('/notices-all/:branch', async (req, res) => {
    try {
        const data = await Notice.find({ branch: req.params.branch }).sort({ createdAt: -1 });
        res.json(data);
    } catch (e) { res.status(500).send(e.message); }
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

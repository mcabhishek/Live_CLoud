const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
// If the connection fails, the process exits to prevent zombie deployments
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Database Connected Successfully"))
    .catch(err => {
        console.error("CRITICAL DB ERROR:", err);
        process.exit(1); 
    });

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    name: String, 
    studentId: String, 
    pass: String, 
    role: { type: String, enum: ['Student', 'Staff'] }, 
    branch: { type: String, enum: ['CSE', 'ISE', 'ECE', 'EEE', 'ME'] }, 
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

// 1. ROOT HEARTBEAT (Fixes cron-job.org 404 error)
app.get('/', (req, res) => {
    res.status(200).send("Edu Source API is Live and Active.");
});

// 2. AUTH: Login
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ 
            studentId: req.body.studentId.trim(), 
            pass: req.body.pass 
        });
        user ? res.json(user) : res.status(401).send("Invalid Credentials");
    } catch (e) { res.status(500).send(e.message); }
});

// 3. AUTH: Register
app.post('/register', async (req, res) => {
    try {
        const existingUser = await User.findOne({ studentId: req.body.studentId });
        if (existingUser) return res.status(400).send("User already exists");
        
        await new User(req.body).save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// 4. POST: Notice with Media (Image/PDF)
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

// 5. POST: Text-Only Notice
app.post('/post-text-notice', async (req, res) => {
    try {
        await new Notice({ 
            ...req.body, 
            fileType: "text", 
            fileUrl: "" 
        }).save();
        res.json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

// 6. GET: Targeted Student Feed
app.get('/notices/:branch/:year', async (req, res) => {
    try {
        const data = await Notice.find({ 
            branch: req.params.branch, 
            year: req.params.year 
        }).sort({ createdAt: -1 });
        res.json(data);
    } catch (e) { res.status(500).send(e.message); }
});

// 7. GET: Department Staff Feed
app.get('/notices-all/:branch', async (req, res) => {
    try {
        const data = await Notice.find({ branch: req.params.branch }).sort({ createdAt: -1 });
        res.json(data);
    } catch (e) { res.status(500).send(e.message); }
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Edu Source Server Peak Performance on Port ${PORT}`);
});

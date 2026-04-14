const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require('multer');

const app = express();
app.use(cors()); 
app.use(express.json());

// --- DB CONNECTION ---
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI).then(() => console.log("MongoDB Connected"));

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    name: String, studentId: String, pass: String, 
    role: { type: String, enum: ['Student', 'Staff'] }, branch: String 
}));

const Notice = mongoose.model('Notice', new mongoose.Schema({
    senderName: String, branch: String, message: String, 
    imageUrl: String, createdAt: { type: Date, default: Date.now }
}));

// --- AWS S3 (Fixed) ---
const s3Client = new S3Client({
    region: "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
const upload = multer({ storage: multer.memoryStorage() });

// --- ROUTES ---

// 1. Health Check
app.get('/', (req, res) => res.send("MCE Server is Awake and Running!"));

// 2. Login (RE-ADDED)
app.post('/login', async (req, res) => {
    const { studentId, pass } = req.body;
    const user = await User.findOne({ studentId, pass });
    if (user) res.status(200).json(user);
    else res.status(401).json({ error: "Invalid Credentials" });
});

// 3. Register
app.post('/register', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(200).json({ status: "Success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Post Notice
app.post('/post-notice', upload.single('image'), async (req, res) => {
    try {
        const fileName = `mce/${Date.now()}_${req.file.originalname}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: "image-fragmentation-bucket-123",
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        }));
        const imageUrl = `https://image-fragmentation-bucket-123.s3.ap-south-1.amazonaws.com/${fileName}`;
        const notice = new Notice({ ...req.body, imageUrl });
        await notice.save();
        res.status(200).json({ status: "Success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Get Notices
app.get('/notices/:branch', async (req, res) => {
    const data = await Notice.find({ branch: req.params.branch }).sort({ createdAt: -1 });
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Live`));

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(cors());

// --- DATABASE CONNECTION ---
// We use process.env to keep your MongoDB link private
const mongoURI = process.env.MONGO_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch(err => console.log("DB Connection Error:", err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    name: String,
    studentId: String, 
    pass: String, 
    role: { type: String, enum: ['Student', 'Staff'] }, 
    branch: String 
});
const User = mongoose.model('User', UserSchema);

const NoticeSchema = new mongoose.Schema({
    senderName: String, branch: String, message: String, 
    imageUrl: String, createdAt: { type: Date, default: Date.now }
});
const Notice = mongoose.model('Notice', NoticeSchema);

// --- AWS S3 CONFIGURATION ---
// Access keys are now pulled from Environment Variables
const s3Client = new S3Client({
    region: "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});
const upload = multer({ storage: multer.memoryStorage() });

// --- ROUTES (LOGIN, REGISTER, NOTICES) ---
app.post('/login', async (req, res) => {
    const { studentId, pass } = req.body;
    const user = await User.findOne({ studentId, pass });
    if (user) res.status(200).json(user);
    else res.status(401).send("Invalid Credentials");
});

app.post('/register', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(200).json({ status: "Success" });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/notices/:branch', async (req, res) => {
    try {
        const data = await Notice.find({ branch: req.params.branch }).sort({ createdAt: -1 });
        res.json(data);
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MCE Server Active on Port ${PORT}`));
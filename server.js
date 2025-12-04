const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const progress = require('progress-stream');
const app = express();
const uploadFolder = 'uploads';

// Create uploads folder if it doesn't exist
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder);
}

// Auto delete files after 2 hours (7200000 ms)
const FILE_EXPIRY_TIME = 2 * 60 * 60 * 1000;

function cleanupOldFiles() {
    fs.readdir(uploadFolder, (err, files) => {
        if (err) return console.error('Cleanup error:', err);
        
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(uploadFolder, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                const fileAge = now - stats.mtimeMs;
                if (fileAge > FILE_EXPIRY_TIME) {
                    fs.unlink(filePath, (err) => {
                        if (!err) console.log(`Deleted expired file: ${file}`);
                    });
                }
            });
        });
    });
}

// Run cleanup every 10 minutes
setInterval(cleanupOldFiles, 10 * 60 * 1000);
cleanupOldFiles(); // Run once on startup

// Serve static files like HTML and CSS
app.use(express.static(__dirname));

// Enable compression (gzip)
app.use(compression());

// File size limit: 500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Multer configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadFolder);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE }
});

// Route for file uploads with progress tracking
app.post('/upload', (req, res) => {
    // Increase timeout for large files (30 minutes)
    req.setTimeout(30 * 60 * 1000);
    res.setTimeout(30 * 60 * 1000);

    // Handle connection errors
    req.on('error', (err) => {
        console.error('Request error:', err);
    });

    req.on('aborted', () => {
        console.log('Upload aborted by client');
    });

    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('File upload error:', err.message);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).send('File too large');
            }
            return res.status(500).send('Upload error: ' + err.message);
        }

        if (!req.file) {
            return res.status(400).send('No file selected');
        }

        const sizeMB = (req.file.size / 1024 / 1024).toFixed(2);
        console.log(`File uploaded: ${req.file.originalname} (${sizeMB} MB)`);
        res.status(200).send("Upload complete");
    });
});

// Route to list available files for download with time info
app.get('/files', (req, res) => {
    fs.readdir(uploadFolder, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to list files.' });
        }
        
        const fileInfoPromises = files.map(file => {
            return new Promise((resolve) => {
                const filePath = path.join(uploadFolder, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        resolve(null);
                    } else {
                        const uploadTime = stats.mtimeMs;
                        const expiryTime = uploadTime + FILE_EXPIRY_TIME;
                        resolve({
                            name: file,
                            uploadTime: uploadTime,
                            expiryTime: expiryTime
                        });
                    }
                });
            });
        });
        
        Promise.all(fileInfoPromises).then(fileInfos => {
            res.json(fileInfos.filter(f => f !== null));
        });
    });
});

// Route to download a file
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, uploadFolder, filename);
    res.download(filePath);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

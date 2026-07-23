const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow large JSON payloads
app.use(express.static(__dirname)); // Serve static files (index.html, css, js)

// Ensure data.json exists
if (!fs.existsSync(DATA_FILE)) {
  const initialData = { items: [], records: {}, groups: [], groupRecords: {} };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// API to get data
app.get('/api/data', (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (err) {
    console.error('Error reading data file:', err);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// API to save data
app.post('/api/data', (req, res) => {
  try {
    const newData = req.body;
    fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
    res.json({ success: true, message: 'Data saved successfully' });
  } catch (err) {
    console.error('Error saving data file:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

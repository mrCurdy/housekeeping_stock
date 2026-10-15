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

// Frontend lives in public/ (server.js, data.json and node_modules stay private)
app.use(express.static(path.join(__dirname, 'public')));

// Write to a temp file and rename, so a crash mid-write can't corrupt data.json
const writeData = (data) => {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isValidData = (d) =>
  isPlainObject(d) &&
  Array.isArray(d.items) &&
  isPlainObject(d.records) &&
  Array.isArray(d.groups) &&
  isPlainObject(d.groupRecords) &&
  (d.locations === undefined || Array.isArray(d.locations)) &&
  (d.counts === undefined || isPlainObject(d.counts));

const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// Ensure data.json exists
if (!fs.existsSync(DATA_FILE)) {
  writeData({ items: [], records: {}, groups: [], groupRecords: {}, locations: [], counts: {} });
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

// API to save data. Room counts are written by several people at once through /api/count,
// so a full save keeps the counts already on disk (except when restoring a backup).
app.post('/api/data', (req, res) => {
  const newData = req.body;
  if (!isValidData(newData)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }
  try {
    if (req.query.restore !== '1') {
      newData.counts = readData().counts || {};
    }
    writeData(newData);
    res.json({ success: true, message: 'Data saved successfully' });
  } catch (err) {
    console.error('Error saving data file:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// API to save one room count: { date, locationId, itemId, value } (value null = not counted)
app.post('/api/count', (req, res) => {
  const { date, locationId, itemId, value } = req.body || {};
  const isId = (v) => typeof v === 'string' && v.length > 0;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isId(locationId) || !isId(itemId) ||
      !(value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0))) {
    return res.status(400).json({ error: 'Invalid count' });
  }
  try {
    const data = readData();
    const counts = isPlainObject(data.counts) ? data.counts : {};
    if (value === null) {
      if (counts[date]?.[locationId]) {
        delete counts[date][locationId][itemId];
        if (Object.keys(counts[date][locationId]).length === 0) delete counts[date][locationId];
        if (Object.keys(counts[date]).length === 0) delete counts[date];
      }
    } else {
      counts[date] = counts[date] || {};
      counts[date][locationId] = counts[date][locationId] || {};
      counts[date][locationId][itemId] = value;
    }
    data.counts = counts;
    writeData(data);
    res.json({ success: true, counts: counts[date] || {} });
  } catch (err) {
    console.error('Error saving count:', err);
    res.status(500).json({ error: 'Failed to save count' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

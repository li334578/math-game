const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname);
const dbPath = path.join(dataDir, 'leaderboard.json');

function readDB() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeDB(arr) {
  fs.writeFileSync(dbPath, JSON.stringify(arr, null, 2), 'utf-8');
}

app.get('/api/leaderboard', (req, res) => {
  const data = readDB();
  // 按分数降序，时间升序，最多返回100条
  data.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalTime - b.totalTime;
  });
  res.json(data.slice(0, 100));
});

app.post('/api/leaderboard', (req, res) => {
  const { name, score, totalTime } = req.body || {};
  if (!name || typeof score !== 'number' || typeof totalTime !== 'number') {
    return res.status(400).json({ message: 'Invalid payload' });
  }
  const entry = {
    name: String(name).slice(0, 50),
    score,
    totalTime,
    createdAt: new Date().toISOString()
  };
  const data = readDB();
  data.push(entry);
  writeDB(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  // 确保文件存在
  if (!fs.existsSync(dbPath)) writeDB([]);
  console.log(`Leaderboard server running at http://localhost:${PORT}`);
});
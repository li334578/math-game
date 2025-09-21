# Leaderboard Server (Simple)

Start:
1) cd server
2) npm init -y
3) npm i express cors
4) node index.js

API:
- GET  /api/leaderboard
- POST /api/leaderboard
  body: { "name": "张三", "score": 25, "totalTime": 85 }

Data persisted in server/leaderboard.json.
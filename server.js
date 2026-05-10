const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
app.use(express.static('./'));

// আপনার Aiven MySQL কানেকশন ইনফো এখানে দিন
const dbUri = 'mysql://avnadmin:AVNS_PsYa4FE9fJvITOf4u0Z@mysql-8138310-corruptionbangla24-843b.l.aivencloud.com:15225{"rejectUnauthorized":true}';


app.get('/api/game-data', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbUri);
        const [game] = await conn.execute('SELECT current_multiplier, is_crashed FROM game_state WHERE id = 1');
        const [user] = await conn.execute('SELECT balance FROM users WHERE id = 1');
        await conn.end();
        res.json({ multiplier: game[0].current_multiplier, is_crashed: game[0].is_crashed, balance: user[0].balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running...'));

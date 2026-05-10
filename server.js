const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

app.use(express.static('./'));

// ১. আপনার Aiven MySQL কানেকশন ডিটেইলস
const dbConfig = {
    host: 'mysql-8138310-corruptionbangla24-843b.l.aivencloud.com',
    user: 'avnadmin',
    password: 'AVNS_PsYa4FE9fJvITOf4u0Z',
    database: 'defaultdb',
    port: 15225,
    ssl: { rejectUnauthorized: false }
};

// ২. গেম ডাটা API
app.get('/api/game-data', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [gameRows] = await conn.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        const [userRows] = await conn.execute('SELECT balance FROM aviator_users WHERE id = 1');
        await conn.end();
        res.json({ 
            multiplier: gameRows[0].current_multiplier, 
            is_crashed: gameRows[0].is_crashed, 
            balance: userRows[0].balance 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৩. ডাটাবেস টেবিল তৈরি করার রুট
app.get('/setup-database', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute(`CREATE TABLE IF NOT EXISTS aviator_game_state (id INT PRIMARY KEY, current_multiplier DECIMAL(10,2) DEFAULT 1.00, is_crashed BOOLEAN DEFAULT FALSE)`);
        await conn.execute(`CREATE TABLE IF NOT EXISTS aviator_users (id INT PRIMARY KEY, balance DECIMAL(10,2) DEFAULT 500.00)`);
        await conn.execute('INSERT IGNORE INTO aviator_game_state (id, current_multiplier, is_crashed) VALUES (1, 1.00, false)');
        await conn.execute('INSERT IGNORE INTO aviator_users (id, balance) VALUES (1, 500.00)');
        await conn.end();
        res.send("<h1>সফলভাবে এভিয়েটর টেবিলগুলো তৈরি হয়েছে!</h1>");
    } catch (err) {
        res.status(500).send("ভুল হয়েছে: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running...'));

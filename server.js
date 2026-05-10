const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
app.use(express.static('./'));

// আপনার Aiven MySQL কানেকশন ইনফো এখানে দিন
const dbUri = 'mysql://avnadmin:AVNS_PsYa4FE9fJvITOf4u0Z@mysql-8138310-corruptionbangla24-843b.l.aivencloud.com:15225{"rejectUnauthorized":true}';

app.get('/api/game-data', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbUri);
        
        // নতুন টেবিল নাম অনুযায়ী ডেটা আনা
        const [gameRows] = await conn.execute('SELECT current_multiplier, is_crashed FROM aviator_game_state WHERE id = 1');
        const [userRows] = await conn.execute('SELECT balance FROM aviator_users WHERE id = 1');
        
        await conn.end();

        // সঠিক ভেরিয়েবল দিয়ে ডেটা পাঠানো
        res.json({ 
            multiplier: gameRows[0].current_multiplier, 
            is_crashed: gameRows[0].is_crashed, 
            balance: userRows[0].balance 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



const PORT = process.env.PORT || 3000;
// টেবিল তৈরি করার অটোমেটিক রুট
app.get('/setup-database', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbUri);
        
        // ১. গেম স্টেট টেবিল তৈরি
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS aviator_game_state (
                id INT PRIMARY KEY,
                current_multiplier DECIMAL(10,2) DEFAULT 1.00,
                is_crashed BOOLEAN DEFAULT FALSE
            )
        `);

        // ২. ইউজার টেবিল তৈরি
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS aviator_users (
                id INT PRIMARY KEY,
                balance DECIMAL(10,2) DEFAULT 500.00
            )
        `);

        // ৩. প্রাথমিক ডাটা ইনসার্ট করা
        await conn.execute('INSERT IGNORE INTO aviator_game_state (id, current_multiplier, is_crashed) VALUES (1, 1.00, false)');
        await conn.execute('INSERT IGNORE INTO aviator_users (id, balance) VALUES (1, 500.00)');

        await conn.end();
        res.send("<h1>সফলভাবে এভিয়েটর টেবিলগুলো তৈরি হয়েছে!</h1>");
    } catch (err) {
        res.status(500).send("ভুল হয়েছে: " + err.message);
    }
});

app.listen(PORT, () => console.log('Server running...'));

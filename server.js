const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

app.post('/api/chat', async (req, res) => {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                model: 'llama3', 
                messages: req.body.messages,
                stream: false 
            })
        });
        const data = await response.json();
        res.json({ reply: data.message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to local AI" });
    }
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));

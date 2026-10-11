const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

app.post('/api/chat', async (req, res) => {
    const messages = req.body.messages;
    const lastMessage = messages[messages.length - 1].content;

    // Intercept the /imagine command and use the free API
    if (lastMessage.startsWith('/imagine ')) {
        const prompt = lastMessage.replace('/imagine ', '').trim();
        // Generate a 512x512 image URL based on the prompt
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;
        
        return res.json({ 
            reply: 'Here is your image:', 
            image: imageUrl 
        });
    }

    // Standard text chat routed to your local Llama 3
    try {
        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama3', messages: messages, stream: false })
        });
        const data = await response.json();
        res.json({ reply: data.message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to local AI" });
    }
});

app.listen(PORT, () => console.lo`Running on port ${PORT}`));

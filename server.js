const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3030;
const MEMORY_FILE = 'memory.json';

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.json());
app.use(cors());

let memoryStore = [];
if (fs.existsSync(MEMORY_FILE)) {
    memoryStore = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text) {
    const response = await fetch('http://127.0.0.1:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', input: text })
    });
    const data = await response.json();
    return data.embeddings[0];
}

app.post('/api/chat', async (req, res) => {
    const messages = req.body.messages;
    const lastMessage = messages[messages.length - 1].content;

    try {
        const currentEmbedding = await getEmbedding(lastMessage);
        let relevantContext = "";
        
        if (memoryStore.length > 0) {
            const scoredMemories = memoryStore.map(mem => ({
                text: mem.text,
                score: cosineSimilarity(currentEmbedding, mem.embedding)
            })).sort((a, b) => b.score - a.score);
            relevantContext = scoredMemories.slice(0, 2).map(m => m.text).join(" | ");
        }

        const finalMessages = [
            { role: "system", content: `You are a helpful AI. Use this context from past conversations to help answer: ${relevantContext}` },
            ...messages
        ];

        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama3', messages: finalMessages, stream: false })
        });
        
        const data = await response.json();
        const aiReply = data.message.content;

        memoryStore.push({ text: `User said: ${lastMessage}. AI replied: ${aiReply}`, embedding: currentEmbedding });
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryStore, null, 2));

        res.json({ reply: aiReply });
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to local AI" });
    }
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));

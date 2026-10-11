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
    try {
        const response = await fetch('http://127.0.0.1:11434/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'nomic-embed-text', input: text })
        });
        const data = await response.json();
        return data.embeddings[0];
    } catch (e) {
        return new Array(768).fill(0);
    }
}

app.post('/api/chat', async (req, res) => {
    const messages = req.body.messages;
    const requestedModel = req.body.model || 'socialnetwooky/llama3.2-abliterated:3b_q4';
    let lastMessage = messages[messages.length - 1].content;
    let liveWebContext = "";

    if (requestedModel === 'image') {
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(lastMessage)}?width=1024&height=1024&nologo=true`;
        return res.json({ reply: 'Here is your image:', image: imageUrl });
    }
    
    // NEW: Deep Study Interceptor (Permanent Memory)
    if (lastMessage.toLowerCase().startsWith('/study ')) {
        const query = lastMessage.substring(7).trim();
        try {
            const searchRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
            const searchData = await searchRes.json();
            
            if (searchData.extract) {
                const studyContent = `[DEEP STUDY ARCHIVE - Topic: ${query}]: ${searchData.extract}`;
                const studyEmbedding = await getEmbedding(studyContent);
                
                memoryStore.push({ text: studyContent, embedding: studyEmbedding });
                fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryStore, null, 2));
                
                return res.json({ reply: `📚 **Study Complete.** I have researched "${query}" and permanently committed the data to my vector memory. I will now reference this in our future conversations.` });
            } else {
                return res.json({ reply: `⚠️ I attempted to study "${query}", but could not find comprehensive data.` });
            }
        } catch (e) {
            return res.json({ reply: `⚠️ Network error while attempting to study.` });
        }
    }

    // Standard Search Interceptor (Temporary Memory)
    if (lastMessage.toLowerCase().startsWith('/search ')) {
        const query = lastMessage.substring(8).trim();
        try {
            const searchRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
            const searchData = await searchRes.json();
            if (searchData.extract) {
                liveWebContext = `\n\nLIVE WEB SEARCH RESULTS FOR "${query}": ${searchData.extract}`;
            } else {
                liveWebContext = `\n\nLIVE WEB SEARCH RESULTS: No data found for "${query}".`;
            }
            lastMessage = `I just searched the web for "${query}". Based on the live results provided in your system prompt, explain this to me.`;
        } catch (e) {
            liveWebContext = `\n\nLIVE WEB SEARCH FAILED.`;
        }
    }

    try {
        const currentEmbedding = await getEmbedding(lastMessage);
        let relevantContext = "";
        
        if (memoryStore.length > 0) {
            const scoredMemories = memoryStore.map(mem => ({
                text: mem.text,
                score: cosineSimilarity(currentEmbedding, mem.embedding)
            })).sort((a, b) => b.score - a.score);
            
            relevantContext = scoredMemories.slice(0, 3).map(m => m.text).join(" | ");
        }

        const finalMessages = [
            { role: "system", content: `You are a helpful AI. Context: ${relevantContext}${liveWebContext}` },
            ...messages.slice(0, -1),
            { role: "user", content: lastMessage }
        ];

        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: requestedModel, messages: finalMessages, stream: false })
        });
        
        const data = await response.json();
        const aiReply = data.message.content;

        const userMemoryText = req.body.messages[req.body.messages.length - 1].content;
        memoryStore.push({ text: `User said: ${userMemoryText}. AI replied: ${aiReply}`, embedding: currentEmbedding });
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryStore, null, 2));

        res.json({ reply: aiReply });
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to local AI." });
    }
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));

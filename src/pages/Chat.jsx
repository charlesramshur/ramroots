// src/pages/Chat.jsx
import React, { useState } from 'react';
import './Chat.css';
import { askKnowledge } from '../utils/knowledge';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    const q = input.trim();
    if (!q) return;

    // Add your message
    const newMessages = [...messages, { from: 'You', text: q }];
    setMessages(newMessages);
    setInput('');

    // BEGIN live knowledge check
    try {
      const k = await askKnowledge(q);
      if (k?.answer) {
        const src = (k.sources || [])
          .map((s) => `- ${s.title} (${s.url})`)
          .join('\n');
        const txt = src ? `${k.answer}\n\nSources:\n${src}` : k.answer;

        setMessages((prev) => [...prev, { from: 'RamRoot', text: txt }]);
        return; // answered live; skip LLM
      }
    } catch (_) {
      // ignore; fall through to LLM
    }
    // END live knowledge check

    // Fallback to LLM/chat endpoint
    try {
      const response = await fetch(`${API}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await response.json();
      const reply = data.reply || '⚠️ No reply received.';
      setMessages((prev) => [...prev, { from: 'RamRoot', text: reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { from: 'RamRoot', text: '⚠️ Error reaching server.' },
      ]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="chat-container">
      <div className="chat-box">
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.from}:</strong> {msg.text}
          </div>
        ))}
      </div>
      <input
        type="text"
        placeholder="Type your message and press Enter..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

export default Chat;

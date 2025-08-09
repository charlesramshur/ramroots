// src/pages/Chat.jsx
import React, { useState } from 'react';
import './Chat.css';

// Use env var so it works locally AND on Vercel
const API = import.meta.env.VITE_API_URL;

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { from: 'You', text: input }];
    setMessages(newMessages);
    setInput('');

    try {
      const response = await fetch(`${API}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      });

      const data = await response.json();
      const reply = data.reply || '⚠️ No reply received.';
      setMessages(prev => [...prev, { from: 'RamRoot', text: reply }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
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

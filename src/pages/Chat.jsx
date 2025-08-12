// src/pages/Chat.jsx
import React, { useState } from 'react';
import './Chat.css';
import { askKnowledge } from '../utils/knowledge';

// Use env var so it works locally AND on Vercel
const API = import.meta.env.VITE_API_URL;

// helper: call backend to create an autopilot PR
async function createPR(task) {
  const r = await fetch(`${API}/api/self/pr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`PR error ${r.status}: ${t || 'unknown'}`);
  }
  return r.json();
}

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const text = input.trim();
    const newMessages = [...messages, { from: 'You', text }];
    setMessages(newMessages);
    setInput('');

    // ---- PR shortcut: "pr: do a thing" or "/pr do a thing"
    const prMatch =
      text.toLowerCase().startsWith('pr:') ? text.slice(3).trim() :
      text.toLowerCase().startsWith('/pr ') ? text.slice(4).trim() : null;

    if (prMatch) {
      try {
        const j = await createPR(prMatch);
        const prUrl = j?.pr || '(no link returned)';
        const branch = j?.branch || '(branch?)';
        setMessages(prev => [
          ...prev,
          { from: 'RamRoot', text: `Opened PR on branch **${branch}**.\n${prUrl}` },
        ]);
      } catch (e) {
        setMessages(prev => [
          ...prev,
          { from: 'RamRoot', text: `⚠️ Could not open PR: ${e.message}` },
        ]);
      }
      return; // done
    }

    // ---- BEGIN live knowledge check
    try {
      const k = await askKnowledge(text);
      if (k?.answer) {
        const src = (k.sources || [])
          .map(s => `- ${s.title} (${s.url})`)
          .join('\n');
        const txt = src ? `${k.answer}\n\nSources:\n${src}` : k.answer;
        setMessages(prev => [...prev, { from: 'RamRoot', text: txt }]);
        return; // skip LLM call because we already answered live
      }
    } catch {
      // ignore; fall through to LLM
    }
    // ---- END live knowledge check

    // ---- LLM fallback
    try {
      const response = await fetch(`${API}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
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
            <strong>{msg.from}:</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }} />
          </div>
        ))}
      </div>
      <input
        type="text"
        placeholder='Type your message and press Enter… (tip: "pr: make a tiny docs edit")'
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

export default Chat;

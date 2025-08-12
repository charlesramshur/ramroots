// src/pages/Chat.jsx
import React, { useState } from 'react';
import './Chat.css';
import { askKnowledge } from '../utils/knowledge';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // tiny helper to show a message from RamRoot
  const pushReply = (text) =>
    setMessages((prev) => [...prev, { from: 'RamRoot', text }]);

  // supports JSON after "edit:" OR key=value;key=value
  function parseEditArgs(rest) {
    const trimmed = rest.trim();
    try {
      if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    } catch {}
    // fallback: key=value ; key=value
    const out = {};
    trimmed.split(/;|\n/).forEach((pair) => {
      const m = pair.split('=');
      if (m.length >= 2) {
        const k = m.shift().trim();
        const v = m.join('=').trim();
        if (k) out[k] = v;
      }
    });
    return out;
  }

  const handleSend = async () => {
    const q = input.trim();
    if (!q) return;

    setMessages((m) => [...m, { from: 'You', text: q }]);
    setInput('');

    // --- command: PR autopilot ---
    if (q.toLowerCase().startsWith('pr:')) {
      try {
        const task = q.slice(3).trim();
        const r = await fetch(`${API}/api/self/pr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task }),
        });
        const j = await r.json();
        if (j.ok) {
          pushReply(`Opened PR on branch **${j.branch}**.\n${j.pr}`);
        } else {
          pushReply(`⚠️ Could not open PR: ${JSON.stringify(j)}`);
        }
      } catch (e) {
        pushReply(`⚠️ PR error: ${e.message}`);
      }
      return;
    }

    // --- command: safe ops (status/build) ---
    if (q.toLowerCase().startsWith('op:')) {
      try {
        const op = q.slice(3).trim();
        const r = await fetch(`${API}/api/self/ops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op }),
        });
        const j = await r.json();
        if (j.ok) pushReply('ok op\n' + 'result\n-- --\n' + JSON.stringify(j.result));
        else pushReply(`⚠️ Op failed: ${JSON.stringify(j)}`);
      } catch (e) {
        pushReply(`⚠️ Op error: ${e.message}`);
      }
      return;
    }

    // --- command: safe file edit (opens a PR) ---
    if (q.toLowerCase().startsWith('edit:')) {
      try {
        const args = parseEditArgs(q.slice(5));
        const r = await fetch(`${API}/api/self/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const j = await r.json();
        if (j.ok) {
          pushReply(`Edit PR opened for \`${j.file}\` on **${j.branch}**.\n${j.pr}`);
        } else {
          pushReply(`⚠️ Edit failed: ${JSON.stringify(j)}`);
        }
      } catch (e) {
        pushReply(`⚠️ Edit error: ${e.message}`);
      }
      return;
    }

    // --- live knowledge first ---
    try {
      const k = await askKnowledge(q);
      if (k?.answer) {
        const src = (k.sources || [])
          .map((s) => `- ${s.title} (${s.url})`)
          .join('\n');
        const txt = src ? `${k.answer}\n\nSources:\n${src}` : k.answer;
        pushReply(txt);
        return;
      }
    } catch {
      // fall through
    }

    // --- fallback LLM chat ---
    try {
      const response = await fetch(`${API}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await response.json();
      pushReply(data.reply || '⚠️ No reply received.');
    } catch (err) {
      pushReply('⚠️ Error reaching server.');
    }
  };

  const handleKey = (e) => e.key === 'Enter' && handleSend();

  return (
    <div className="chat-container">
      <div className="chat-box">
        {messages.map((m, i) => (
          <div key={i}><strong>{m.from}:</strong> {m.text}</div>
        ))}
      </div>
      <input
        type="text"
        placeholder={`Type your message and press Enter… (tip: "op: status")`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
      />
    </div>
  );
}

export default Chat;

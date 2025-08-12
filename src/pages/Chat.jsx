// src/pages/Chat.jsx
import React, { useState } from 'react';
import './Chat.css';
import { askKnowledge } from '../utils/knowledge';

// Works locally and on Vercel
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const pushReply = (text) =>
    setMessages((prev) => [...prev, { from: 'RamRoot', text }]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    // show your message
    setMessages((m) => [...m, { from: 'You', text }]);
    setInput('');

    // ---- PR shortcut: "pr: do a thing" or "/pr do a thing"
    const prTask =
      text.toLowerCase().startsWith('pr:') ? text.slice(3).trim() :
      text.toLowerCase().startsWith('/pr ') ? text.slice(4).trim() : null;

    if (prTask) {
      try {
        const j = await createPR(prTask);
        const prUrl = j?.pr || '(no link returned)';
        const branch = j?.branch || '(branch?)';
        pushReply(`Opened PR on branch **${branch}**.\n${prUrl}`);
      } catch (e) {
        pushReply(`⚠️ Could not open PR: ${e.message}`);
      }
      return;
    }

    // ---- safe ops: "op: status" / "op: build"
    if (text.toLowerCase().startsWith('op:')) {
      try {
        const op = text.slice(3).trim();
        const r = await fetch(`${API}/api/self/ops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op }),
        });
        const j = await r.json();
        if (j.ok) pushReply('ok op\nresult\n-- --\n' + JSON.stringify(j.result));
        else pushReply(`⚠️ Op failed: ${JSON.stringify(j)}`);
      } catch (e) {
        pushReply(`⚠️ Op error: ${e.message}`);
      }
      return;
    }

    // ---- safe file edit (opens a PR): 'edit: {"file":"src/pages/Chat.jsx","find":"old","replace":"new"}'
    // or: edit: file=src/pages/Chat.jsx;find=old;replace=new;message=autopilot edit
    if (text.toLowerCase().startsWith('edit:')) {
      try {
        const args = parseEditArgs(text.slice(5));
        const r = await fetch(`${API}/api/self/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const j = await r.json();
        if (j.ok) pushReply(`Edit PR opened for \`${j.file}\` on **${j.branch}**.\n${j.pr}`);
        else pushReply(`⚠️ Edit failed: ${JSON.stringify(j)}`);
      } catch (e) {
        pushReply(`⚠️ Edit error: ${e.message}`);
      }
      return;
    }

    // ---- BEGIN live knowledge check
    try {
      const k = await askKnowledge(text);
      if (k?.answer) {
        const src = (k.sources || [])
          .map((s) => `- ${s.title} (${s.url})`)
          .join('\n');
        const txt = src ? `${k.answer}\n\nSources:\n${src}` : k.answer;
        pushReply(txt);
        return; // skip LLM call
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
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
            <strong>{m.from}:</strong> {m.text}
          </div>
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

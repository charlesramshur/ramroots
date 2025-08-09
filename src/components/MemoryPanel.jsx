// src/components/MemoryPanel.jsx
import React, { useState, useEffect } from 'react';

// Use env var so it works locally AND on Vercel
const API = import.meta.env.VITE_API_URL;

function MemoryPanel() {
  const [memory, setMemory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMemory = async () => {
    try {
      const res = await fetch(`${API}/api/memory`);
      const data = await res.json();
      setMemory(data || []);
    } catch (err) {
      console.error('Error fetching memory:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearMemory = async () => {
    try {
      await fetch(`${API}/api/memory`, { method: 'DELETE' });
      setMemory([]);
    } catch (err) {
      console.error('Error clearing memory:', err);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  if (loading) return <p>Loading memory...</p>;

  return (
    <div className="memory-panel">
      <h2>Memory</h2>
      <button onClick={clearMemory}>Clear Memory</button>
      <ul>
        {memory.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default MemoryPanel;

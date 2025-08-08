import React, { useEffect, useState } from 'react';

function MemoryPanel() {
  const [memory, setMemory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('http://localhost:5000/api/memory')
      .then((res) => res.json())
      .then((data) => setMemory(data))
      .catch((err) => console.error('Error loading memory:', err));
  }, []);

  const filterItems = (items) => {
    if (!items) return [];
    return items.filter((item) =>
      item.text.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const renderSection = (title, items) => (
    <div className="mb-6">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <ul className="list-disc list-inside">
        {filterItems(items).map((item, i) => (
          <li key={i} className="text-gray-700">{item.text}</li>
        ))}
      </ul>
    </div>
  );

  if (!memory) return <div className="p-4 text-lg">Loading memory...</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧠 RamRoot Memory Panel</h1>

      <input
        type="text"
        placeholder="Search memory..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-2 mb-6 border border-gray-300 rounded"
      />

      {renderSection('Goals', memory.goals)}
      {renderSection('Features', memory.features)}
      {renderSection('Notes', memory.notes)}
      {renderSection('Tasks', memory.tasks)}
    </div>
  );
}

export default MemoryPanel;

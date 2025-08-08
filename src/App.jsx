// src/App.jsx
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import MemoryPanel from './components/MemoryPanel';
import Chat from './pages/Chat';
import FileBrowser from './components/FileBrowser';

const App = () => {
  const [activeTab, setActiveTab] = useState('Chat');

  return (
    <div className="flex h-screen bg-gray-800">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 p-4 overflow-auto">
        {activeTab === 'Chat' && <Chat />}
        {activeTab === 'Memory' && <MemoryPanel />}
        {activeTab === 'Tools' && <FileBrowser />}
        {activeTab === 'Settings' && (
          <div className="text-white text-lg">⚙️ Settings coming soon</div>
        )}
      </div>
    </div>
  );
};

export default App;

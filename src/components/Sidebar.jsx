// Sidebar.jsx
import React from 'react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const tabs = ['Chat', 'Memory', 'Tools', 'Settings'];

  return (
    <div className="w-48 bg-gray-900 text-white h-screen p-4">
      <h2 className="text-xl font-bold mb-6 tracking-wide">RamRoot</h2>
      <ul className="space-y-2">
        {tabs.map((tab) => (
          <li
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`p-2 rounded cursor-pointer text-sm ${
              activeTab === tab ? 'bg-blue-600' : 'hover:bg-gray-700'
            }`}
          >
            {tab}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Sidebar;

// src/components/Tools.jsx
import React from "react";

export default function Tools() {
  return (
    <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      <div className="shadow-xl rounded-xl bg-white text-black p-4">
        <h2 className="text-xl font-semibold mb-2">📁 File Manager</h2>
        <p className="text-sm text-gray-600">
          View, create, and edit files in your AI workspace.
        </p>
      </div>

      <div className="shadow-xl rounded-xl bg-white text-black p-4">
        <h2 className="text-xl font-semibold mb-2">🧠 Memory Explorer</h2>
        <p className="text-sm text-gray-600">
          Review saved goals, notes, and personality data.
        </p>
      </div>

      <div className="shadow-xl rounded-xl bg-white text-black p-4">
        <h2 className="text-xl font-semibold mb-2">🛠 AI Assistant Builder</h2>
        <p className="text-sm text-gray-600">
          Watch RamRoot build itself and add new features as needed.
        </p>
      </div>
    </div>
  );
}

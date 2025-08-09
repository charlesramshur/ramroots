// src/components/FileBrowser.jsx
import React, { useEffect, useState } from 'react';

// Use env var so it works locally AND on Vercel
const API = import.meta.env.VITE_API_URL;

export default function FileBrowser() {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadFiles = async () => {
    try {
      const res = await fetch(`${API}/files`);
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading files:', err);
    }
  };

  const loadFile = async (name) => {
    try {
      setSelected(name);
      const res = await fetch(`${API}/files/${encodeURIComponent(name)}`);
      const text = await res.text();
      setContent(text);
    } catch (err) {
      console.error('Error loading file:', err);
      setContent('');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        body: form
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      await loadFiles();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = ''; // reset input
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  return (
    <div className="file-browser">
      <h2>Files</h2>
      <input type="file" onChange={handleUpload} disabled={uploading} />
      <ul>
        {files.map((f) => (
          <li key={f}>
            <button onClick={() => loadFile(f)}>
              {selected === f ? <strong>{f}</strong> : f}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>
      )}
    </div>
  );
}

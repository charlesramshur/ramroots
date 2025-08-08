import React, { useEffect, useState } from 'react';

function FileBrowser() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = () => {
    fetch('http://localhost:5000/files')
      .then((res) => res.json())
      .then((data) => setFiles(data))
      .catch(() => setError('❌ Unable to load file list.'));
  };

  const handleClick = (filename) => {
    setSelectedFile(filename);
    fetch(`http://localhost:5000/files/${filename}`)
      .then((res) => res.text())
      .then((text) => setFileContent(text))
      .catch(() => setFileContent('❌ Unable to load file content.'));
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });
      alert(`✅ "${file.name}" uploaded successfully.`);
      loadFiles();
    } catch {
      alert('❌ Upload failed.');
    }
  };

  return (
    <div>
      <h2>📁 File List + Upload</h2>

      <input
        type="file"
        onChange={handleUpload}
        style={{ marginBottom: '15px' }}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {files.map((file, index) => (
          <li key={index} style={{ marginBottom: '8px' }}>
            <button
              onClick={() => handleClick(file)}
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              📄 {file}
            </button>
          </li>
        ))}
      </ul>

      {selectedFile && (
        <div style={{ marginTop: '30px' }}>
          <h3>📄 {selectedFile}</h3>
          <pre
            style={{
              background: '#f4f4f4',
              padding: '15px',
              borderRadius: '6px',
              maxHeight: '400px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '14px',
              border: '1px solid #ccc',
            }}
          >
            {fileContent}
          </pre>
        </div>
      )}
    </div>
  );
}

export default FileBrowser;

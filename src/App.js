import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App" style={{ backgroundColor: '#1a120b', color: '#f9f5ef', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
      <img
        src="/ramroots-hero.png"
        alt="RamRoots Hero"
        style={{ maxWidth: '100%', height: 'auto', marginBottom: '2rem' }}
      />
      <h1 style={{ fontSize: '2rem', maxWidth: '800px', textAlign: 'center', lineHeight: 1.4 }}>
        Other apps load and boot up…<br />
        <strong>We RamRoots deep down and rise above them all.</strong>
      </h1>
    </div>
  );
}

export default App;

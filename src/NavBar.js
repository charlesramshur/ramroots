import React from 'react';

const navStyle = {
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  backgroundColor: '#2e1f17',
  padding: '1rem',
  color: '#f9f5ef',
  fontSize: '1.1rem',
  position: 'sticky',
  top: 0,
  zIndex: 1000,
};

const linkStyle = {
  color: '#f9f5ef',
  textDecoration: 'none',
  fontWeight: 'bold',
};

const NavBar = () => {
  return (
    <nav style={navStyle}>
      <a href="#" style={linkStyle}>Home</a>
      <a href="#" style={linkStyle}>Tree</a>
      <a href="#" style={linkStyle}>Chat</a>
      <a href="#" style={linkStyle}>Vault</a>
      <a href="#" style={linkStyle}>Settings</a>
    </nav>
  );
};

export default NavBar;

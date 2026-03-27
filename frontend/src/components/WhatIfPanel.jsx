import React from 'react';

export default function WhatIfPanel({ settings = {}, onChange }) {
  const toggle = (key) => {
    const next = { ...settings, [key]: !settings[key] };
    onChange && onChange(next);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <strong>What-If Controls</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Rain (increase congestion)</span>
          <input type="checkbox" checked={!!settings.rain} onChange={() => toggle('rain')} />
        </label>

        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Road Blockage (disable node)</span>
          <input type="checkbox" checked={!!settings.blockage} onChange={() => toggle('blockage')} />
        </label>

        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Peak Hour Surge</span>
          <input type="checkbox" checked={!!settings.peak} onChange={() => toggle('peak')} />
        </label>
      </div>
    </div>
  );
}

import React from 'react';

export default function NodeImagePanel({ activeNode, imageUrl, prediction }) {
  const congestion = prediction?.predicted ?? (prediction?.forecast?.[0]?.value ?? 0);
  const label = congestion >= 0.7 ? 'High congestion zone' : congestion >= 0.4 ? 'Moderate congestion' : 'Low congestion';

  return (
    <div style={{ marginTop: 12, position: 'relative' }}>
      <img src={imageUrl} alt={activeNode} style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }} />
      <div style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(0,0,0,0.5)', padding: '6px 10px', borderRadius: 8, color: 'white', fontSize: '0.85rem' }}>{activeNode} — {label}</div>
    </div>
  );
}

import React from 'react';

// Simple visual component to compare BEFORE vs AFTER congestion
export default function SignalSimulator({ activeNode, predictions }) {
  const key = activeNode;
  const pred = (predictions && predictions[key]) || {};

  // STEP 1: Get current congestion (forecast first, fallback to predicted)
  const value = (pred?.forecast && pred.forecast[0] && pred.forecast[0].value) || pred?.predicted || pred?.value;

  // STEP 2: Convert to percentage
  const percent = (typeof value === 'number') ? (value * 100) : null;

  // STEP 3: Dynamic logic for green increase
  let greenIncrease;
  if (percent !== null) {
    if (percent > 7) {
      greenIncrease = 30;
    } else if (percent > 4) {
      greenIncrease = 20;
    } else {
      greenIncrease = 10;
    }
  } else {
    greenIncrease = 10; // sensible default when prediction unavailable
  }

  // STEP 4: Compute result
  const before = percent !== null ? Number(percent.toFixed(1)) : null;
  const after = before !== null ? Number((before * (1 - greenIncrease / 100)).toFixed(1)) : null;

  return (
    <div className="signal-simulator" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Signal Simulator — {activeNode}</strong>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Green Time = {greenIncrease}%</span>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: '60px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Before</div>
          <div style={{ flex: 1, height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
            <div style={{ height: '100%', width: before !== null ? `${before}%` : '0%', background: 'linear-gradient(90deg,#ef4444,#f97316)', borderRadius: 6 }}></div>
          </div>
          <div style={{ width: 50, textAlign: 'right' }}>{before !== null ? `${before}%` : '—'}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <div style={{ width: '60px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>After</div>
          <div style={{ flex: 1, height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
            <div style={{ height: '100%', width: after !== null ? `${after}%` : '0%', background: 'linear-gradient(90deg,#10b981,#06b6d4)', borderRadius: 6 }}></div>
          </div>
          <div style={{ width: 50, textAlign: 'right' }}>{after !== null ? `${after}%` : '—'}</div>
        </div>
      </div>
    </div>
  );
}

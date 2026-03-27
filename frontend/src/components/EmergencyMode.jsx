import React, { useState } from 'react';
import RouteOptimizer from './RouteOptimizer';

export default function EmergencyMode({ predictions, onActivate }) {
  const [enabled, setEnabled] = useState(false);
  const [lastRoute, setLastRoute] = useState(null);

  const handleSuggest = (outcome) => {
    setLastRoute(outcome);
    // Simulate prioritization: reduced cost by 40% for emergency
    if (onActivate) onActivate(outcome.path, Math.max(1, Math.round(outcome.cost * 0.6)));
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Emergency Mode</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) onActivate?.(null); }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{enabled ? 'ON' : 'OFF'}</span>
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <RouteOptimizer predictions={predictions} onSuggest={handleSuggest} />
      </div>

      {enabled && lastRoute && (
        <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--accent-blue)' }}>
          <div><strong>Ambulance Path:</strong> {lastRoute.path.join(' → ')}</div>
          <div><strong>Reduced delay est.:</strong> {Math.max(1, Math.round(lastRoute.cost * 0.6))} min</div>
        </div>
      )}
    </div>
  );
}

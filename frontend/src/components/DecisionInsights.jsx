import React from 'react';

// Create simple rule-based actionable outputs from predictions
export default function DecisionInsights({ predictions, onAction }) {
  const nodes = Object.keys(predictions || {});

  const generate = () => {
    const actions = [];
    nodes.forEach(n => {
      const p = predictions[n];
      const val = p?.predicted ?? (p?.forecast?.[0]?.value ?? 0);
      if (val >= 0.75) {
        const increase = Math.min(50, Math.round((val - 0.6) * 100));
        actions.push({ node: n, action: `Increase green time by ${increase}%` });
      } else if (val >= 0.4) {
        actions.push({ node: n, action: `Consider diverting via MC Road` });
      } else {
        actions.push({ node: n, action: `No action required` });
      }
    });
    return actions;
  };

  const actions = generate();

  return (
    <div style={{ marginTop: 12 }}>
      <strong>Decision Insights</strong>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((a, i) => (
          <div key={i} style={{ fontSize: '0.9rem', color: a.action.includes('No action') ? 'var(--text-secondary)' : 'var(--accent-blue)' }}>
            <strong>{a.node}:</strong> {a.action}
          </div>
        ))}
      </div>
    </div>
  );
}

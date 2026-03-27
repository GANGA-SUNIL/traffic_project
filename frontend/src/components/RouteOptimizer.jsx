import React, { useState } from 'react';
import { dijkstra, reconstructPath } from '../utils/graph';

// Simple representative graph (undirected weights approximate travel time)
const SAMPLE_GRAPH = {
  'Central Junction': { 'MC Road Segment': 6, 'Market Area': 8 },
  'MC Road Segment': { 'Central Junction': 6, 'Market Area': 5 },
  'Market Area': { 'Central Junction': 8, 'MC Road Segment': 5 }
};

export default function RouteOptimizer({ predictions, onSuggest }) {
  const nodes = Object.keys(SAMPLE_GRAPH);
  const [from, setFrom] = useState(nodes[0]);
  const [to, setTo] = useState(nodes[1]);
  const [result, setResult] = useState(null);

  const compute = () => {
    // adjust weights mildly by congestion prediction (if available)
    const graph = JSON.parse(JSON.stringify(SAMPLE_GRAPH));
    Object.keys(graph).forEach(u => {
      Object.keys(graph[u]).forEach(v => {
        const predU = predictions[u]?.predicted ?? (predictions[u]?.forecast?.[0]?.value ?? 0);
        const predV = predictions[v]?.predicted ?? (predictions[v]?.forecast?.[0]?.value ?? 0);
        const factor = 1 + Math.max(predU || 0, predV || 0); // 0-1 -> 1x-2x
        graph[u][v] = Math.max(1, Math.round(graph[u][v] * factor));
      });
    });

    const { dist, prev } = dijkstra(graph, from);
    const path = reconstructPath(prev, to);
    const cost = dist[to];

    // baseline direct travel time (without congestion) using SAMPLE_GRAPH weights
    const baseline = path.reduce((acc, cur, idx) => {
      if (idx === 0) return acc;
      const a = path[idx - 1];
      return acc + (SAMPLE_GRAPH[a][cur] || 0);
    }, 0);

    const saved = Math.max(0, baseline - cost);
    const outcome = { path, cost, baseline, saved };
    setResult(outcome);
    if (onSuggest) onSuggest(outcome);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={from} onChange={e => setFrom(e.target.value)} style={{ flex: 1 }}>
          {nodes.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={to} onChange={e => setTo(e.target.value)} style={{ flex: 1 }}>
          {nodes.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="control-btn" onClick={compute}>Suggest Route</button>
      </div>

      {result && (
        <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
          <div><strong>Route:</strong> {result.path.join(' → ')}</div>
          <div><strong>Est. travel time:</strong> {result.cost} min</div>
          <div style={{ color: 'var(--success)' }}><strong>Time saved:</strong> {result.saved} min</div>
        </div>
      )}
    </div>
  );
}

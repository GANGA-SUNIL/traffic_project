// Minimal Dijkstra implementation for small graphs
export function dijkstra(graph, start) {
  const dist = {};
  const prev = {};
  const Q = new Set(Object.keys(graph));

  Object.keys(graph).forEach(v => { dist[v] = Infinity; prev[v] = null; });
  dist[start] = 0;

  while (Q.size) {
    let u = null;
    Q.forEach(n => { if (u === null || dist[n] < dist[u]) u = n; });
    Q.delete(u);
    if (dist[u] === Infinity) break;

    const neighbors = graph[u] || {};
    Object.keys(neighbors).forEach(v => {
      const alt = dist[u] + neighbors[v];
      if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    });
  }

  return { dist, prev };
}

export function reconstructPath(prev, target) {
  const path = [];
  let u = target;
  while (u) { path.unshift(u); u = prev[u]; }
  return path;
}

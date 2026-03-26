const express = require('express');
const app = express();
const port = 8000;

app.get('/', (req, res) => {
  res.json({ message: 'Mock Traffic LSTM Backend (Node) running' });
});

app.get('/predict', (req, res) => {
  // Read query params
  const current_speed = parseFloat(req.query.current_speed) || 0;
  const free_flow_speed = parseFloat(req.query.free_flow_speed) || 48;
  const congestion = parseFloat(req.query.congestion) || 0;

  // Simple explainable predictor: weighted average of current congestion and a small trend
  // Use speed ratio as a small modifier
  const speed_ratio = Math.max(0, Math.min(1, current_speed / (free_flow_speed || 48)));
  const hist_component = congestion; // no historical data in mock
  const predicted = Math.max(0, Math.min(1, 0.6 * congestion + 0.3 * hist_component + 0.1 * (1 - speed_ratio)));

  const used_historical_points = 0;
  const prediction_confidence = 0.5 + (used_historical_points / 9.0) * 0.5;

  res.json({
    status: 'success',
    lstm_predicted_congestion_index: predicted,
    prediction_confidence: parseFloat(prediction_confidence.toFixed(2)),
    used_historical_points: used_historical_points,
    fallback: true,
    note: 'Mock server: deterministic simple predictor'
  });
});

app.listen(port, () => {
  console.log(`Mock predict server listening at http://localhost:${port}`);
});

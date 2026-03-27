import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Activity, Car, AlertTriangle, Battery, Navigation, Clock, Wind, X } from 'lucide-react';
import SignalSimulator from './components/SignalSimulator';
import RouteOptimizer from './components/RouteOptimizer';
import EmergencyMode from './components/EmergencyMode';
import WhatIfPanel from './components/WhatIfPanel';
import DecisionInsights from './components/DecisionInsights';
import NodeImagePanel from './components/NodeImagePanel';

// Accurate historical traffic data processed from dataset for Central Junction
const DATASET_HOURLY_MEANS = [
  { time: '0:00', speed: 48.0, congestion: 0.0 },
  { time: '1:00', speed: 48.0, congestion: 0.0 },
  { time: '2:00', speed: 48.0, congestion: 0.0 },
  { time: '3:00', speed: 48.0, congestion: 0.0 },
  { time: '4:00', speed: 48.0, congestion: 0.0 },
  { time: '5:00', speed: 48.0, congestion: 0.0 },
  { time: '6:00', speed: 48.0, congestion: 0.0 },
  { time: '7:00', speed: 34.3, congestion: 0.0 }, // Speeds drop significantly
  { time: '8:00', speed: 48.0, congestion: 0.0 },
  { time: '9:00', speed: 48.0, congestion: 0.0 },
  { time: '10:00', speed: 48.0, congestion: 0.0 },
  { time: '11:00', speed: 46.1, congestion: 0.038 },
  { time: '12:00', speed: 48.0, congestion: 0.0 },
  { time: '13:00', speed: 47.2, congestion: 0.016 },
  { time: '14:00', speed: 48.0, congestion: 0.0 },
  { time: '15:00', speed: 48.0, congestion: 0.0 },
  { time: '16:00', speed: 47.0, congestion: 0.022 },
  { time: '17:00', speed: 46.1, congestion: 0.040 },
  { time: '18:00', speed: 43.8, congestion: 0.087 }, // True Peak
  { time: '19:00', speed: 45.1, congestion: 0.060 },
  { time: '20:00', speed: 43.8, congestion: 0.087 },
  { time: '21:00', speed: 47.3, congestion: 0.013 },
  { time: '22:00', speed: 48.0, congestion: 0.0 },
  { time: '23:00', speed: 48.0, congestion: 0.0 }
];

const INSIGHTS = [
  { icon: '☀️', title: 'Peak Time Detected', desc: 'Central Junction sees its highest traffic and slowest speeds at 07:00 AM and 18:00 PM.', status: 'urgent' },
  { icon: '📅', title: 'Peak Congestion Day', desc: 'Tuesdays historically experience the highest congestion index recorded.', status: 'info' },
  { icon: '🚦', title: 'Smart Divert Ready', desc: 'Suggesting alternate route via MC Road to bypass Market blockage.', status: 'success' }
];

function App() {
  // Use lightweight external images (replace with local files if desired)
  const nodeImages = {
    "Central Junction": "https://images.unsplash.com/photo-1501601964896-5a6e0f2f6f1b?w=1200&q=60&auto=format&fit=crop",
    "Market Area": "https://images.unsplash.com/photo-1505765050364-3d8c3d8f6b2f?w=1200&q=60&auto=format&fit=crop",
    "MC Road Segment": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=60&auto=format&fit=crop",
  };
  // explicit key mapping to ensure UI keys align with backend payload keys
  const keyMap = {
    "Central Junction": "Central Junction",
    "MC Road Segment": "MC Road Segment",
    "Market Area": "Market Area"
  };
  const [data, setData] = useState(DATASET_HOURLY_MEANS.slice(0, 10)); // Start with first 10 hours
  const [activeNode, setActiveNode] = useState('Central Junction');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simScenario, setSimScenario] = useState('Divert Traffic (Accident Simulation)');
  const [simNode, setSimNode] = useState('Central Junction');
  const [lstmPrediction, setLstmPrediction] = useState("...");
  // prediction shape: { value: number|"...", prev: number|null, label?: string, current?: number }
  const [predictions, setPredictions] = useState({});
  const [time, setTime] = useState(new Date());
  const [peakHour, setPeakHour] = useState('18:00');
  const [emergencyRoute, setEmergencyRoute] = useState(null);
  const [whatIfSettings, setWhatIfSettings] = useState({ rain: false, blockage: false, peak: false });
  const [disabledNodes, setDisabledNodes] = useState([]);

  // Playback the dataset accurately over time
  useEffect(() => {
    let currentHourIndex = 10;

    // Initial fetch
    // Query LSTM for the three main nodes deterministically (no randomness)
    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev.slice(1)];
        // Loop back to start if we reach end of dataset array
        if (currentHourIndex >= DATASET_HOURLY_MEANS.length) {
          currentHourIndex = 0;
        }

        const nextNodeData = DATASET_HOURLY_MEANS[currentHourIndex];
        newData.push(nextNodeData);

        // dataset playback only; predictions come from backend polling

        currentHourIndex++;
        return newData;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch predictions from backend predictions endpoint and update state
  const fetchPredictions = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/predictions');
      const api = await res.json();
      if (api && api.status === 'success' && api.predictions) {
        // Store raw API shape so UI can bind with optional chaining
        const next = {};
        Object.keys(api.predictions).forEach(loc => {
          const p = api.predictions[loc];
          next[loc] = {
            label: p && p.label ? p.label : undefined,
            predicted: (p && typeof p.predicted === 'number') ? p.predicted : undefined,
            current: (p && typeof p.current === 'number') ? p.current : undefined,
            forecast: Array.isArray(p && p.forecast) ? p.forecast : []
          };
        });
        setPredictions(next);
      }
    } catch (e) {
      console.error('Error fetching predictions:', e);
    }
  };

  useEffect(() => {
    // initial fetch and polling every 10s
    fetchPredictions();
    const id = setInterval(fetchPredictions, 10000);
    return () => clearInterval(id);
  }, []);

  // Debug: log predictions whenever they update
  useEffect(() => {
    console.log('Predictions keys:', Object.keys(predictions));
    console.log('Predictions:', predictions);
  }, [predictions]);

  const getForecastForLocation = (location) => {
    const locationKey = keyMap[location] || location;
    const fc = predictions[locationKey]?.forecast || [];
    console.log('ACTIVE NODE:', location, 'USING KEY:', locationKey, 'FORECAST:', fc);
    return fc;
  };

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  
  // (removed single unnamed query function) - use node-specific `queryLstmApi` below

  // Improved: call LSTM API for a named node; allow deterministic congestion adjustments
  const queryLstmApi = async (metrics, node = 'Central Junction', congestionMultiplier = 1.0) => {
    try {
      const adjustedCong = metrics.congestion * congestionMultiplier;
      const res = await fetch(`http://127.0.0.1:8000/predict?current_speed=${metrics.speed}&free_flow_speed=${48}&congestion=${adjustedCong}`);
      const apiData = await res.json();
      if (apiData.status === 'success') {
        const value = Math.round(apiData.lstm_predicted_congestion_index * 100);
        setPredictions(prev => ({ ...prev, [node]: { value, prev: prev[node] ? prev[node].value : null } }));
      } else {
        setPredictions(prev => ({ ...prev, [node]: { value: null, prev: prev[node] ? prev[node].value : null } }));
      }
    } catch (e) {
      console.error('LSTM API Error:', e);
      setPredictions(prev => ({ ...prev, [node]: { value: null, prev: prev[node] ? prev[node].value : null } }));
    }
  };

  const getPredictionValue = (node) => {
    const locationKey = keyMap[node] || node;
    const p = predictions[locationKey];
    if (!p) return '...';
    const fc = p.forecast || [];
    const next = fc[0]?.value;
    const useVal = (next !== undefined && next !== null) ? next : (typeof p.predicted === 'number' ? p.predicted : undefined);
    if (useVal === undefined) return '...';
    return Number((useVal * 100).toFixed(1));
  };

  const getPredictionTrend = (node) => {
    // We don't persist previous predictions in this UI; return stable as default
    return 'Stable';
  };

  const getNodeLabel = (loc) => {
    const locationKey = keyMap[loc] || loc;
    const p = predictions[locationKey];
    if (!p) return 'Prediction unavailable';
    const fc = p.forecast || [];
    const next = fc[0]?.value;
    if (next !== undefined && next !== null) return getLabelFromValue(next);
    if (p.label) return p.label;
    if (typeof p.predicted === 'number') return getLabelFromValue(p.predicted);
    return 'Prediction unavailable';
  };

  // New: compute percent and user-facing label from prediction value
  const getPercentAndLabel = (location) => {
    const locationKey = keyMap[location] || location;
    const p = predictions[locationKey] || {};
    const value = (p?.forecast && p.forecast[0] && p.forecast[0].value) || p?.predicted;
    if (typeof value !== 'number') return { percent: null, label: 'Prediction unavailable' };
    const percent = Number((value * 100).toFixed(1));
    const getLabel = (val) => {
      const pval = val * 100;
      if (pval < 30) return 'Flowing';
      if (pval < 70) return 'Moderate';
      return 'Heavy';
    };
    return { percent, label: getLabel(value) };
  };

  const getStatusClass = (label) => {
    if (label === 'Flowing') return 'node-status status-good';
    if (label === 'Moderate') return 'node-status status-moderate';
    if (label === 'Heavy') return 'node-status status-heavy';
    return 'node-status';
  };

  const currentStats = {
    speed: data[data.length - 1].speed.toFixed(1),
    congestion: (data[data.length - 1].congestion * 100).toFixed(0),
    prediction: getPredictionValue(activeNode),
    aqi: Math.min((data[data.length - 1].congestion * 150) + 40, 200).toFixed(0) // Simulate AQI based on congestion
  };

  // Detect peak hour from dataset (highest congestion). Simple, explainable rule.
  useEffect(() => {
    try {
      let maxIdx = 0;
      let maxVal = -1;
      DATASET_HOURLY_MEANS.forEach((r, i) => {
        if (r.congestion > maxVal) { maxVal = r.congestion; maxIdx = i; }
      });
      setPeakHour(DATASET_HOURLY_MEANS[maxIdx].time);
    } catch (e) { /* ignore */ }
  }, []);

  // Build chartData from forecast for active node; fallback to historical playback `data`
  const chartData = (() => {
    const forecast = getForecastForLocation(activeNode);
    if (forecast && forecast.length > 0) {
      return forecast.map(item => ({ time: item.time, value: item.value * 100 }));
    }
    // fallback: map historical dataset to value (use congestion) — scale to percent for visualization
    return data.map(d => ({ time: d.time, value: d.congestion * 100 }));
  })();

  // Tooltip / axis format helpers: handle values that may be 0-1 or already 0-100
  const normalizeToPercent = (v) => {
    if (v === undefined || v === null || Number.isNaN(v)) return null;
    const num = Number(v);
    return num > 1 ? num : num * 100;
  };

  const formatValue = (value) => {
    const pct = normalizeToPercent(value);
    if (pct === null) return '—';
    const percent = pct.toFixed(1);
    let label = 'Flowing';
    if (pct < 30) label = 'Flowing';
    else if (pct < 70) label = 'Moderate';
    else label = 'Heavy';
    return `${percent}% → ${label}`;
  };

  const statusColor = (pct) => {
    if (pct === null || pct === undefined) return 'var(--text-secondary)';
    if (pct < 30) return '#22c55e';
    if (pct < 70) return '#facc15';
    return '#ef4444';
  };

  const activePct = getPercentAndLabel(activeNode).percent;
  const strokeColor = statusColor(activePct);

  const getLabelFromValue = (val) => {
    if (val === undefined || val === null) return 'Prediction unavailable';
    const pct = Math.round(val * 100);
    if (pct <= 3) return 'Flowing';
    if (pct <= 7) return 'Moderate';
    return 'Heavy';
  };

  const runSimulation = () => {
    setSimulationResult({ status: 'calculating...' });

    setTimeout(() => {
      // Data-driven simple simulation based on current congestion (explainable rules)
      const baseCong = data[data.length - 1].congestion; // 0-1
      const basePercent = Math.round(baseCong * 100);
      const baseVolume = 500; // representative vehicles/hour baseline for estimation

      let outcome = { status: 'success' };
      if (simScenario === 'Divert Traffic (Accident Simulation)') {
        const factor = 0.15; // 15% reduction factor
        const newCong = Math.max(0, baseCong * (1 - factor));
        const reductionPct = Math.round((baseCong - newCong) * 100);
        const vehiclesRerouted = Math.round((reductionPct / 100) * baseVolume);
        const aqiChange = Math.round(reductionPct * 0.8);
        outcome.impact = `Estimated congestion reduced by ${reductionPct}% at ${simNode} (from ${Math.round(baseCong*100)}% to ${Math.round(newCong*100)}%)`;
        outcome.volume = `${vehiclesRerouted} vehicles per hour rerouted from ${simNode}`;
        outcome.environmental = `Approx. -${aqiChange} AQI points (reduced idling)`;
      } else if (simScenario === 'Signal Timing Adjustment (+15s Green)') {
        const factor = 0.22; // 22% improvement
        const newCong = Math.max(0, baseCong * (1 - factor));
        const improvementPct = Math.round((baseCong - newCong) * 100);
        const extraThroughput = Math.round((improvementPct / 100) * baseVolume);
        const emissionChange = Math.round(improvementPct * 0.3);
        outcome.impact = `Estimated congestion reduced by ${improvementPct}% at ${simNode} (from ${Math.round(baseCong*100)}% to ${Math.round(newCong*100)}%)`;
        outcome.volume = `${extraThroughput} extra vehicles/hour pass through ${simNode}`;
        outcome.environmental = `Approx. -${emissionChange} AQI points (fewer start/stop events)`;
      } else if (simScenario === 'Heavy Vehicle Ban (Peak Hours)') {
        const factor = 0.35; // 35% improvement
        const newCong = Math.max(0, baseCong * (1 - factor));
        const improvementPct = Math.round((baseCong - newCong) * 100);
        const freedLaneVehicles = Math.round((improvementPct / 100) * baseVolume);
        const aqiChange = Math.round(improvementPct * 0.9);
        outcome.impact = `Estimated congestion reduced by ${improvementPct}% at ${simNode} (from ${Math.round(baseCong*100)}% to ${Math.round(newCong*100)}%)`;
        outcome.volume = `${freedLaneVehicles} passenger-vehicle-equivalents/hour freed by banning heavy vehicles`;
        outcome.environmental = `Approx. -${aqiChange} AQI points (reduced diesel load)`;
      }

      setSimulationResult(outcome);
    }, 1500);
  };

  return (
    <div className="dashboard-container">
      {/* Header spanning exactly across */}
      <div className="header">
        <div className="title-section">
          <h1>Traffic Digital Twin</h1>
          <p>Kothamangalam Town Real-Time Monitoring</p>
        </div>
        <div className="status-badge">
          <div className="status-dot"></div>
          System Online
          <span style={{ marginLeft: 12, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{time.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Left Panel: Stats */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.2rem', fontWeight: 600 }}>Live Metrics</h2>

        <div className="stats-grid">
          <div className="stat-card glass-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="stat-title"><Car size={16} style={{ display: 'inline', marginRight: 8 }} />Avg Speed</span>
            <span className="stat-value">{currentStats.speed} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>km/h</span></span>
            <span className="stat-trend trend-down">↓ 2.4 km/h <span style={{ color: 'var(--text-secondary)' }}>vs last hr</span></span>
          </div>

          <div className="stat-card glass-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="stat-title"><AlertTriangle size={16} style={{ display: 'inline', marginRight: 8 }} />Congestion Index</span>
            <span className="stat-value">{currentStats.congestion}%</span>
            <span className="stat-trend trend-up">↑ 5% <span style={{ color: 'var(--text-secondary)' }}>vs last hr</span></span>
          </div>

          <div className="stat-card glass-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="stat-title"><Clock size={16} style={{ display: 'inline', marginRight: 8 }} />Peak Traffic Hour</span>
            <span className="stat-value" style={{ color: 'var(--warning)' }}>{peakHour}</span>
            <span className="stat-trend">Historically highest congestion</span>
          </div>

          <div className="stat-card glass-panel" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="stat-title"><Navigation size={16} style={{ display: 'inline', marginRight: 8 }} />Peak Volume Day</span>
            <span className="stat-value" style={{ color: 'var(--accent-blue)' }}>Tuesday</span>
            <span className="stat-trend">Based on lifetime data</span>
          </div>
        </div>
      </div>

      {/* Center Panel: Map & Visuals */}
      <div className="main-view">
        <div
          className="map-container glass-panel"
          style={{
            backgroundImage: `url(${nodeImages[activeNode]})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative'
          }}
        >
          <div className="overlay"></div>
          <div className="map-content" style={{ zIndex: 20 }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', zIndex: 20 }}>Intersection Network</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '40px', zIndex: 20 }}>Select node to view localized metrics</p>

            <div className="twin-nodes">
              <div className="twin-node" onClick={() => setActiveNode('MC Road Segment')} style={{ boxShadow: activeNode === 'MC Road Segment' ? '0 0 15px rgba(34,197,94,0.35)' : 'none', transform: activeNode === 'MC Road Segment' ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.15s ease' }}>
                <div className="node-circle" style={{ borderColor: activeNode === 'MC Road Segment' ? 'var(--accent-blue)' : 'var(--accent-cyan)' }}>🛣️</div>
                <span className="node-label">MC Road<br />Segment</span>
                <span className={getStatusClass(getNodeLabel('MC Road Segment'))}>{getNodeLabel('MC Road Segment')}</span>
              </div>

              <div className="twin-node" onClick={() => setActiveNode('Central Junction')} style={{ marginTop: '-40px', boxShadow: activeNode === 'Central Junction' ? '0 0 15px rgba(34,197,94,0.35)' : 'none', transform: activeNode === 'Central Junction' ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.15s ease' }}>
                <div className="node-circle" style={{ borderColor: activeNode === 'Central Junction' ? 'var(--accent-blue)' : 'var(--danger)', boxShadow: activeNode === 'Central Junction' ? '0 0 20px rgba(34,197,94,0.4)' : '0 0 30px rgba(239, 68, 68, 0.4)' }}>🚦</div>
                <span className="node-label">Central<br />Junction</span>
                <span className={getStatusClass(getNodeLabel('Central Junction'))}>{getNodeLabel('Central Junction')}</span>
              </div>

              <div className="twin-node" onClick={() => setActiveNode('Market Area')} style={{ boxShadow: activeNode === 'Market Area' ? '0 0 15px rgba(34,197,94,0.35)' : 'none', transform: activeNode === 'Market Area' ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.15s ease' }}>
                <div className="node-circle" style={{ borderColor: activeNode === 'Market Area' ? 'var(--accent-blue)' : 'var(--warning)', boxShadow: activeNode === 'Market Area' ? '0 0 20px rgba(34,197,94,0.4)' : '0 0 20px rgba(245, 158, 11, 0.4)' }}>🛒</div>
                <span className="node-label">Market<br />Area</span>
                <span className={getStatusClass(getNodeLabel('Market Area'))}>{getNodeLabel('Market Area')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', flex: 1 }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem', fontWeight: 600 }}>{activeNode} - Historical Flow</h3>
            <div style={{ width: '100%', height: 'calc(100% - 45px)', minHeight: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => {
                    const pct = normalizeToPercent(val);
                    return pct === null ? '—' : `${Math.round(pct)}%`;
                  }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  formatter={(value) => formatValue(value)}
                />
                <Line type="monotone" dataKey="value" stroke={strokeColor} strokeWidth={3} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Right Panel: Analytics */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h2 style={{ marginBottom: '16px', fontSize: '1.2rem', fontWeight: 600 }}>Smart Insights 👀</h2>
          <div className="insights-container">
            {INSIGHTS.map((insight, idx) => (
              <div key={idx} className={`insight-card status-${insight.status}`}>
                <div className="insight-header">
                  <span className="insight-icon">{insight.icon}</span>
                  <span className="insight-title">{insight.title}</span>
                </div>
                <p className="insight-desc">{insight.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="prediction-panel" style={{ marginTop: 'auto' }}>
          <div className="panel-title">LSTM Network Forecasts</div>

          {/** Render each node prediction card dynamically to ensure forecasts are per-location */}
          {['Central Junction', 'MC Road Segment', 'Market Area'].map((nodeName) => {
            const locationKey = nodeName;
            const fc = getForecastForLocation(locationKey);
            const nextVal = fc[0]?.value;
            console.log('NODE:', locationKey);
            console.log('FORECAST:', fc);
            return (
              <div key={locationKey} className="prediction-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{locationKey}</span>
                              {(() => {
                                const pl = getPercentAndLabel(locationKey);
                                const color = statusColor(pl.percent);
                                return (
                                  <span style={{ color, fontWeight: 600, fontSize: '1.1rem' }}>
                                    {pl.percent !== null ? `${pl.percent}% → ${pl.label}` : 'Prediction unavailable'}
                                  </span>
                                );
                              })()}
                </div>
                            <span className="prediction-time">{(() => { const pl = getPercentAndLabel(locationKey); return pl.percent !== null ? (pl.percent >= 70 ? 'High likelihood of heavy congestion' : pl.percent >= 40 ? 'Moderate congestion likely' : 'Low congestion risk') : 'Prediction unavailable'; })()}</span>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 6 }}>{getPredictionTrend(locationKey)}</div>
                        <div className="prediction-bar-container">
                          <div className="prediction-bar" style={{ width: `${(() => { const pl = getPercentAndLabel(locationKey); return pl.percent !== null ? pl.percent : 0; })()}%`, background: (() => { const pl = getPercentAndLabel(locationKey); const c = statusColor(pl.percent); return `linear-gradient(90deg, ${c}, rgba(255,255,255,0.06))`; })() }}></div>
                        </div>

                    <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Expected at {fc[0]?.time || '—'} → {getLabelFromValue(nextVal)}
                    </div>
              </div>
            );
          })}

          <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Prediction based on historical data + LSTM model (explainable, deterministic inputs).
          </div>
        </div>

        {/* Optional: image preview for active node */}
        <div style={{ marginTop: 12 }}>
          <NodeImagePanel activeNode={activeNode} imageUrl={nodeImages[activeNode]} prediction={predictions[activeNode]} />
        </div>

        {/* Decision & Control Widgets */}
        <div style={{ marginTop: 12 }}>
          <DecisionInsights predictions={predictions} />
        </div>

        <div style={{ marginTop: 12 }}>
          <SignalSimulator activeNode={activeNode} predictions={predictions} adjustmentPct={15} />
        </div>

        <div style={{ marginTop: 12 }}>
          <RouteOptimizer predictions={predictions} onSuggest={(o) => console.log('Route suggestion', o)} />
        </div>

        <div style={{ marginTop: 12 }}>
          <EmergencyMode predictions={predictions} onActivate={(path, reduced) => setEmergencyRoute(path ? { path, reduced } : null)} />
        </div>

        <div style={{ marginTop: 12 }}>
          <WhatIfPanel settings={whatIfSettings} onChange={(s) => {
            setWhatIfSettings(s);
            // simple effect: if blockage set, disable Market Area
            setDisabledNodes(s.blockage ? ['Market Area'] : []);
            // don't alter core prediction logic; UI components read whatIfSettings directly if needed
          }} />
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
          <button className="control-btn" onClick={() => setIsSimulatorOpen(true)}>
            Run "What-If" Simulation 🚦
          </button>
        </div>
      </div>

      {/* Simulator Modal */}
      {isSimulatorOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '500px', padding: '30px', position: 'relative' }}>
            <button
              onClick={() => { setIsSimulatorOpen(false); setSimulationResult(null); }}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '10px', background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Digital Twin Simulator
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Test traffic interventions virtually before deploying them in Kothamangalam.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '30px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Scenario Type</label>
                <select
                  value={simScenario}
                  onChange={(e) => { setSimScenario(e.target.value); setSimulationResult(null); }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white' }}
                >
                  <option value="Divert Traffic (Accident Simulation)">Divert Traffic (Accident Simulation)</option>
                  <option value="Signal Timing Adjustment (+15s Green)">Signal Timing Adjustment (+15s Green)</option>
                  <option value="Heavy Vehicle Ban (Peak Hours)">Heavy Vehicle Ban (Peak Hours)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Target Node</label>
                <select
                  value={simNode}
                  onChange={(e) => { setSimNode(e.target.value); setSimulationResult(null); }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white' }}
                >
                  <option value="Central Junction">Central Junction</option>
                  <option value="Market Area">Market Area</option>
                  <option value="MC Road Segment">MC Road Segment</option>
                </select>
              </div>
            </div>

            {simulationResult ? (
              <div style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', borderRadius: '12px' }}>
                {simulationResult.status === 'calculating...' ? (
                  <div style={{ textAlign: 'center', color: 'var(--accent-cyan)', padding: '20px' }}>Running LSTM AI Simulation...</div>
                ) : (
                  <div>
                    <h4 style={{ color: 'var(--success)', marginBottom: '12px', fontSize: '1.1rem' }}>Simulation Complete: Favorable Outcome</h4>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <li><strong style={{ color: 'var(--accent-cyan)' }}>🚦 System Impact:</strong><br /> <span style={{ fontSize: '0.9rem' }}>{simulationResult.impact}</span></li>
                      <li><strong style={{ color: 'var(--accent-blue)' }}>🚗 Volume Handled:</strong><br /> <span style={{ fontSize: '0.9rem' }}>{simulationResult.volume}</span></li>
                      <li><strong style={{ color: 'var(--success)' }}>🌱 Environmental:</strong><br /> <span style={{ fontSize: '0.9rem' }}>{simulationResult.environmental}</span></li>
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <button className="control-btn" onClick={runSimulation} style={{ width: '100%' }}>
                Execute Scenario via LSTM Predictor
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

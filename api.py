import os
try:
    import pandas as pd
    HAVE_PD = True
except Exception:
    pd = None
    HAVE_PD = False
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    import tensorflow as tf
    from tensorflow.keras.models import load_model
    HAVE_TF = True
except Exception:
    # TensorFlow not available in this environment; allow fallback predictor below
    HAVE_TF = False

try:
    from sklearn.preprocessing import MinMaxScaler
    HAVE_SKLEARN = True
except Exception:
    MinMaxScaler = None
    HAVE_SKLEARN = False

app = FastAPI()

# Allow CORS for React Frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load historical data and, if available, the trained model + scaler
df = None
scaler = None
model = None
try:
    if HAVE_PD:
        if os.path.exists("traffic_dataset.csv"):
            df = pd.read_csv("traffic_dataset.csv", parse_dates=["timestamp_ist"]) if "timestamp_ist" in pd.read_csv("traffic_dataset.csv", nrows=0).columns else pd.read_csv("traffic_dataset.csv")
        elif os.path.exists("traffic_data.json"):
            df = pd.read_json("traffic_data.json")
        else:
            df = None

        if df is not None and "timestamp_ist" in df.columns:
            df = df.sort_values(by="timestamp_ist")
        if df is not None:
            print("Historical dataset loaded for backend (rows:", len(df), ")")
        else:
            print("No historical dataset file found; running with no history")
    else:
        df = None
        print("pandas not installed — running backend without historical data")
except Exception as e:
    df = None
    print(f"Warning: could not load historical dataset: {e}")

if HAVE_TF:
    try:
        model = load_model("traffic_lstm_model.h5", compile=False)
        print("LSTM Neural Network loaded successfully!")

        # Rebuild scaler if historical data available
        if df is not None:
            features = ['current_speed', 'free_flow_speed', 'congestion_index']
            available = [c for c in features if c in df.columns]
            if len(available) >= 1:
                data = df[available].values
                if HAVE_SKLEARN:
                    scaler = MinMaxScaler(feature_range=(0, 1))
                    scaler.fit(data)
                else:
                    scaler = None
    except Exception as e:
        print(f"Failed to load LSTM model even though TensorFlow is present: {e}")
else:
    print("TensorFlow not available — backend will run with a simple fallback predictor.")

def _build_sequence_and_predict(current_speed: float, free_flow_speed: float, congestion: float):
    """Helper that encapsulates the prediction logic so it can be reused and tested.
    Returns the same response dict as the endpoint.
    """
    try:
        # Determine which congestion column to use if present
        cong_col = None
        if df is not None:
            for c in ['congestion_index', 'congestion']:
                if c in df.columns:
                    cong_col = c
                    break

        # If we have TensorFlow + model + scaler and some historical data, use LSTM
        if HAVE_TF and model is not None and scaler is not None and df is not None:
            # Build feature order: prefer known column names present in df, but fall back to provided values
            feature_names = []
            for name in ['current_speed', 'free_flow_speed', 'congestion_index', 'congestion']:
                if name in df.columns and name not in feature_names:
                    feature_names.append(name)
            # Ensure we have three features for the model; if not, map provided inputs into 3-feature vector
            if len(feature_names) >= 3:
                available = feature_names[:3]
                hist_vals = df[available].tail(9).values
            else:
                # Fallback to explicit 3-feature ordering
                available = ['current_speed', 'free_flow_speed', 'congestion_index']
                hist_vals = df[[c for c in available if c in df.columns]].tail(9).values if df is not None else np.empty((0,3))

            # Pad if needed — do NOT fabricate history from the current input. Prefer repeating the earliest available historical row.
            orig_count = hist_vals.shape[0]
            if hist_vals.shape[0] < 9:
                if hist_vals.shape[0] == 0:
                    # No historical data available: fallback to simple predictor
                    return {
                        "status": "error",
                        "message": "Not enough historical data for LSTM prediction; fallback recommended"
                    }
                else:
                    pad_count = 9 - hist_vals.shape[0]
                    pad = np.repeat(hist_vals[0:1, :], pad_count, axis=0)
                    hist_vals = np.vstack([pad, hist_vals])

            seq_input = np.vstack([hist_vals, np.array([[current_speed, free_flow_speed, congestion]])])
            scaled_seq = scaler.transform(seq_input)
            sequence = scaled_seq.reshape((1, scaled_seq.shape[0], scaled_seq.shape[1]))

            predicted_scaled = model.predict(sequence)
            dummy = np.zeros((1, scaled_seq.shape[1]))
            dummy[0, -1] = predicted_scaled.flatten()[0]
            predicted_unscaled = scaler.inverse_transform(dummy)[0, -1]
            final_pred = float(min(max(predicted_unscaled, 0.0), 1.0))

            used_hist = min(9, df.shape[0])

            # Confidence: compute variance of recent historical congestion if available
            confidence_score = 0.5
            confidence_label = "medium"
            try:
                if cong_col is not None and df is not None and df.shape[0] >= 1:
                    recent = df[cong_col].tail(used_hist).values
                    var = float(np.var(recent))
                    # Map variance to qualitative confidence
                    if var < 0.001:
                        confidence_score = 0.85
                        confidence_label = "high"
                    elif var < 0.01:
                        confidence_score = 0.65
                        confidence_label = "medium"
                    else:
                        confidence_score = 0.35
                        confidence_label = "low"
            except Exception:
                confidence_score = round(0.5 + (used_hist / 9.0) * 0.5, 2)
                confidence_label = "medium"

            return {
                "status": "success",
                "lstm_predicted_congestion_index": final_pred,
                "prediction_confidence": confidence_score,
                "confidence_label": confidence_label,
                "used_historical_points": used_hist,
                "fallback": False
            }
        else:
            # Fallback predictor: use explainable moving-average rule on congestion only
            used_hist = 0
            hist_congs = []
            if df is not None and cong_col is not None:
                hist_congs = df[cong_col].tail(9).tolist()

            if len(hist_congs) > 0:
                used_hist = len(hist_congs)
                hist_mean = float(np.mean(hist_congs))
            else:
                hist_mean = congestion

            # Weighted average: current reading (60%) + historical mean (40%)
            pred = 0.6 * congestion + 0.4 * hist_mean
            final_pred = float(min(max(pred, 0.0), 1.0))
            confidence = round(0.4 + (used_hist / 9.0) * 0.6, 2)

            return {
                "status": "success",
                "lstm_predicted_congestion_index": final_pred,
                "prediction_confidence": confidence,
                "used_historical_points": used_hist,
                "fallback": True,
                "note": "Fallback simple predictor used because model or TensorFlow is not available"
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/predict")
def predict_traffic(current_speed: float, free_flow_speed: float, congestion: float):
    # Use existing sequence builder for single-sample compatibility but prefer new prediction_service if available
    try:
        # lazy import to avoid startup errors if prediction_service fails
        from prediction_service import service as pred_service
        # build a simple response using the provided inputs for the requested node context
        # we will not assume which location the caller intended; return LSTM value computed from provided inputs
        # If the prediction service has history, use its logic; otherwise fallback to existing builder
        try:
            # prediction_service.predict_location expects a location; since frontend calls per-sample, use fallback to _build_sequence_and_predict
            return _build_sequence_and_predict(current_speed, free_flow_speed, congestion)
        except Exception:
            return _build_sequence_and_predict(current_speed, free_flow_speed, congestion)
    except Exception:
        return _build_sequence_and_predict(current_speed, free_flow_speed, congestion)


@app.get("/predictions")
def predictions_all():
    """Return structured predictions for the three dashboard locations using the new prediction service."""
    try:
        from prediction_service import structured_output
        out = structured_output()
        return {"status": "success", "predictions": out}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
def read_root():
    return {"message": "Traffic Digital Twin LSTM Backend API is Running"}

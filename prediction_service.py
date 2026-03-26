import os
import traceback
import pandas as pd
import numpy as np
from tensorflow.keras.models import load_model
from sklearn.preprocessing import MinMaxScaler

MODEL_CANDIDATES = [
    'model.h5',
    'scripts/output/model_central.h5',
    'scripts/output/model.h5',
    'traffic_lstm_model.h5'
]
DATA_CANDIDATES = [
    'cleaned_data.csv',
    'traffic_dataset.csv',
    'traffic_data.json'
]


class PredictionService:
    def __init__(self):
        self.model = None
        self.df = None
        self.scalers = {}
        self.load_model()
        self.load_data()

    def load_model(self):
        for p in MODEL_CANDIDATES:
            if os.path.exists(p):
                try:
                    self.model = load_model(p, compile=False)
                    print('MODEL LOADED from', p)
                    return
                except Exception as e:
                    print('Model load failed for', p, '->', e)
        print('No model file found among candidates; predictions will use fallback logic')

    def load_data(self):
        for p in DATA_CANDIDATES:
            if os.path.exists(p):
                try:
                    if p.endswith('.csv'):
                        # parse timestamps and add normalized time features
                        self.df = pd.read_csv(p, parse_dates=['timestamp_utc'], low_memory=False)
                        if 'timestamp_utc' in self.df.columns:
                            self.df['hour'] = self.df['timestamp_utc'].dt.hour
                            self.df['day_of_week'] = self.df['timestamp_utc'].dt.dayofweek
                            # normalize to [0,1]
                            self.df['hour'] = self.df['hour'] / 23.0
                            self.df['day_of_week'] = self.df['day_of_week'] / 6.0
                    else:
                        self.df = pd.read_json(p)
                    print('DATA LOADED from', p, 'rows=', len(self.df))
                    return
                except Exception as e:
                    print('Data load failed for', p, '->', e)
        print('No historical data file found; predictions will use provided inputs only')

    def _get_last_sequence(self, location, seq_len=10, feature='congestion_index', pad=True, pad_mode='earliest'):
        # Build a multi-feature sequence [congestion_index, hour, day_of_week]
        # If pad=False, do NOT fabricate/pad rows — return None unless there are >= seq_len rows
        # pad_mode: 'earliest' (default) repeats the earliest row (legacy behavior)
        #           'last' repeats the last available row (used for forecasting when less data exists)
        if self.df is None or feature not in self.df.columns:
            return None
        df_loc = self.df[self.df['location'] == location].sort_values(by='timestamp_utc')
        if df_loc.empty:
            return None
        # Ensure hour/day_of_week columns exist; if not, attempt to derive
        if 'hour' not in df_loc.columns and 'timestamp_utc' in df_loc.columns:
            df_loc['hour'] = df_loc['timestamp_utc'].dt.hour / 23.0
        if 'day_of_week' not in df_loc.columns and 'timestamp_utc' in df_loc.columns:
            df_loc['day_of_week'] = df_loc['timestamp_utc'].dt.dayofweek / 6.0

        vals_cong = df_loc[feature].astype(float).values
        vals_hour = df_loc['hour'].astype(float).values if 'hour' in df_loc.columns else np.zeros_like(vals_cong)
        vals_dow = df_loc['day_of_week'].astype(float).values if 'day_of_week' in df_loc.columns else np.zeros_like(vals_cong)

        # build rows
        rows = np.vstack([vals_cong, vals_hour, vals_dow]).T
        if len(rows) >= seq_len:
            return rows[-seq_len:]
        if not pad:
            return None
        # pad by repeating either earliest or last row depending on pad_mode
        if pad_mode == 'last':
            pad_source = rows[-1:, :]
        else:
            pad_source = rows[0:1, :]
        pad_row = np.repeat(pad_source, seq_len - len(rows), axis=0)
        return np.vstack([pad_row, rows])

    def _scale_and_predict(self, series, model_expected_steps=10):
        # series: 2D numpy [timesteps, features], length >= model_expected_steps
        try:
            arr = np.array(series)
            # fit scaler per feature across the sequence
            scaler = MinMaxScaler(feature_range=(0, 1))
            flat = arr.reshape(-1, arr.shape[-1])
            scaler.fit(flat)

            seq = arr[-model_expected_steps:]
            seq_scaled = scaler.transform(seq).reshape(1, model_expected_steps, arr.shape[-1])
            if self.model is not None:
                pred_scaled = self.model.predict(seq_scaled)
                # pred_scaled may be (1,1) or (1,n_features); assume single output
                val = float(np.clip(pred_scaled.flatten()[0], 0.0, 1.0))
                # To inverse-scale, create dummy row where predicted value is placed in congestion column
                # We'll inverse transform by creating a row with predicted in first column and mean for others
                dummy = np.zeros((1, arr.shape[-1]))
                dummy[0, 0] = val
                inv = scaler.inverse_transform(dummy)[0, 0]
                return float(np.clip(inv, 0.0, 1.0))
            else:
                # fallback: mean of last congestion column
                tail = arr[-model_expected_steps:, 0].astype(float)
                pred = float(np.clip(np.mean(tail), 0.0, 1.0))
                return pred
        except Exception:
            traceback.print_exc()
            return None

    def predict_location(self, location):
        # Return current and predicted congestion (0-1)
        try:
            # Prefer the last measured congestion_index
            current = None
            pred = None
            if self.df is not None and 'congestion_index' in self.df.columns:
                df_loc = self.df[self.df['location'] == location].sort_values(by='timestamp_utc')
                if len(df_loc) > 0:
                    current = float(df_loc['congestion_index'].astype(float).values[-1])
                seq = self._get_last_sequence(location, seq_len=10, feature='congestion_index')
                if seq is not None:
                    # Replace last row's time features with current time
                    try:
                        from datetime import datetime
                        now = datetime.utcnow()
                        hour = now.hour / 23.0
                        dow = now.weekday() / 6.0
                        seq[-1, 1] = hour
                        seq[-1, 2] = dow
                    except Exception:
                        pass
                    pred = self._scale_and_predict(seq, model_expected_steps=10)

            # Fallback if no historical data
            if current is None:
                current = 0.0
            if pred is None:
                pred = current

            # Apply time-based and location-based adjustments to the final predicted value
            try:
                from datetime import datetime
                hour_now = datetime.now().hour
                boost = self._traffic_boost(hour_now)
                loc_fac = self._location_factor(location)
                final_pred = float(pred) * boost * loc_fac
            except Exception:
                final_pred = float(pred)

            # Clamp to maximum allowed value
            if final_pred > 10:
                final_pred = 10.0

            return {"current": float(current), "predicted": float(final_pred)}
        except Exception as e:
            print('Prediction error for', location, '->', e)
            return {"current": None, "predicted": None}

    def _forecast_for_sequence(self, seq, steps=3):
        # seq: numpy array shape (timesteps, features) where timesteps >= model_expected_steps
        from datetime import datetime, timedelta
        preds = []
        s = seq.copy()
        for i in range(steps):
            pred = self._scale_and_predict(s, model_expected_steps=s.shape[0])
            # If predictor fails, replace with last known value (if any) to ensure we always return steps values
            if pred is None:
                # fallback: use last predicted value if exists, otherwise use last observed congestion from s
                if len(preds) > 0:
                    pred = preds[-1]
                else:
                    try:
                        pred = float(s[-1, 0])
                    except Exception:
                        pred = 0.0
            # apply time-based and location-based adjustments later in caller where location is known
            preds.append(float(pred))
            # compute future time features for the appended row
            future_time = datetime.now() + timedelta(minutes=10 * (i + 1))
            hour = future_time.hour / 23.0
            dow = future_time.weekday() / 6.0
            next_row = np.array([[pred, hour, dow]])
            s = np.vstack([s[1:, :], next_row])
        # Ensure length exactly == steps (should be, but be defensive)
        while len(preds) < steps:
            last = preds[-1] if len(preds) > 0 else 0.0
            preds.append(float(last))
        return preds

    def _traffic_boost(self, hour):
        # hour: 0-23
        try:
            h = int(hour)
        except Exception:
            return 1.0
        if 7 <= h <= 10:
            return 2.5
        elif 17 <= h <= 20:
            return 3.5
        elif 12 <= h <= 15:
            return 1.5
        else:
            return 1.0

    def _location_factor(self, location):
        if location == "Central Junction":
            return 1.3
        elif location == "Market Area":
            return 1.1
        elif location == "MC Road Segment":
            return 0.9
        return 1.0

    def forecast_for_location(self, location, steps=3):
        # Try to use only real historical rows first. If unavailable or too short,
        # fall back to padding using the last available row so forecast is always produced.
        seq = self._get_last_sequence(location, seq_len=10, feature='congestion_index', pad=False)
        if seq is None:
            # attempt to build a padded sequence using last-value padding (preferred for forecasts)
            seq = self._get_last_sequence(location, seq_len=10, feature='congestion_index', pad=True, pad_mode='last')
        if seq is None:
            return []
        raw_preds = self._forecast_for_sequence(seq, steps=steps)
        # apply time-based and location-based adjustments to each raw prediction
        from datetime import datetime
        hour_now = datetime.now().hour
        boost = self._traffic_boost(hour_now)
        loc_fac = self._location_factor(location)
        boosted = []
        for p in raw_preds:
            try:
                final = float(p) * boost * loc_fac
            except Exception:
                final = float(p)
            # clamp per instructions
            if final > 10:
                final = 10.0
            boosted.append(float(final))
        # ensure exactly `steps` values
        while len(boosted) < steps:
            boosted.append(boosted[-1] if boosted else 0.0)
        return boosted

    def predict_all(self):
        locations = ["Central Junction", "MC Road Segment", "Market Area"]
        out = {}
        for loc in locations:
            out[loc] = self.predict_location(loc)
        return out


service = PredictionService()

def label_from_percent_val(value):
    # value is 0-1 -> percent
    try:
        pct = float(value) * 100.0
    except Exception:
        return 'Prediction unavailable'
    if pct <= 3:
        return 'Flowing'
    if pct <= 7:
        return 'Moderate'
    return 'Heavy'

def structured_output():
    pred = service.predict_all()
    out = {}
    from datetime import datetime
    now = datetime.now()
    timestr = now.strftime('%H:%M')
    for k, v in pred.items():
        cur = v.get('current') if v else None
        p = v.get('predicted') if v else None
        # Build forecast (3 future steps) using real last-10 sequence when available
        forecast_list = []
        try:
            preds = service.forecast_for_location(k, steps=3)
            from datetime import timedelta
            for i, val in enumerate(preds):
                t = (now + timedelta(minutes=10 * i)).strftime('%H:%M')
                forecast_list.append({'time': t, 'value': float(val)})
        except Exception:
            forecast_list = []

        out[k] = {
            'current': cur,
            'predicted': p,
            'label': label_from_percent_val(p) if p is not None else 'Prediction unavailable',
            'time': timestr,
            'forecast': forecast_list
        }
    return out

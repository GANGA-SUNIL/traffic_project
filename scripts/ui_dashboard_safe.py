import os
import time
import argparse
from datetime import datetime
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import load_model

MODEL_PATHS = [
    'scripts/output/model_central.h5',
    'scripts/output/model_central.keras',
    'scripts/output/model.h5',
    'model.h5'
]
INPUT_CSV = 'cleaned_data.csv'
SEQ_LEN = 10
REFRESH_SECONDS = 10


def find_model():
    for p in MODEL_PATHS:
        if os.path.exists(p):
            return p
    return None


def label_from_percent(pct):
    # Follow requested thresholds; assume pct in 0-100
    try:
        v = float(pct)
    except:
        return 'Unknown'
    if v <= 3:
        return 'Low'
    if v <= 7:
        return 'Medium'
    return 'High'


def prepare_sequence(series_vals, seq_len=SEQ_LEN):
    # series_vals: 1D numpy array of raw values
    vals = list(series_vals)
    if len(vals) >= seq_len:
        seq = vals[-seq_len:]
    else:
        # pad by repeating earliest value
        if len(vals) == 0:
            seq = [0.0] * seq_len
        else:
            pad = [vals[0]] * (seq_len - len(vals))
            seq = pad + vals
    return np.array(seq).reshape((1, seq_len, 1))


def predict_for_location(model, df_loc):
    # df_loc: DataFrame sorted by timestamp ascending
    # Use congestion_index as target
    series = df_loc['congestion_index'].astype(float).values.reshape(-1,1)
    # Fit scaler on this location history (safe fallback)
    scaler = MinMaxScaler(feature_range=(0,1))
    if len(series) == 0:
        # nothing to predict
        return None, None
    scaler.fit(series)
    seq_raw = df_loc['congestion_index'].astype(float).values
    seq_for_model = prepare_sequence(seq_raw, SEQ_LEN)
    # scale seq
    seq_flat = seq_for_model.reshape(-1,1)
    seq_scaled = scaler.transform(seq_flat).reshape(1, SEQ_LEN, 1)
    pred_scaled = model.predict(seq_scaled)
    pred = scaler.inverse_transform(pred_scaled.reshape(-1,1))[0][0]
    current_val = float(seq_raw[-1]) if len(seq_raw) > 0 else 0.0
    return current_val, float(pred)


def clear_console():
    os.system('cls' if os.name == 'nt' else 'clear')


def run_once(model):
    # Load data
    if not os.path.exists(INPUT_CSV):
        print('Input CSV not found:', INPUT_CSV)
        return
    df = pd.read_csv(INPUT_CSV, parse_dates=['timestamp_utc'])
    print(f'Data loaded: {len(df)} rows')
    # Get unique locations
    locations = df['location'].unique()
    out = []
    for loc in locations:
        df_loc = df[df['location'] == loc].sort_values('timestamp_utc')
        current, pred = predict_for_location(model, df_loc)
        print(f'DEBUG: prediction for {loc} -> current={current} pred={pred}')
        if current is None:
            cur_label = 'Unknown'
            pred_label = 'Unknown'
        else:
            # convert to percent for labeling (assume congestion_index 0-1)
            cur_pct = current * 100
            pred_pct = pred * 100
            cur_label = label_from_percent(cur_pct)
            pred_label = label_from_percent(pred_pct)
        out.append((loc, current, pred, cur_label, pred_label))

    # Display (skip clearing when debugging)
    if os.environ.get('DASHBOARD_NO_CLEAR') != '1':
        clear_console()
    else:
        print('--- clear_console skipped (DASHBOARD_NO_CLEAR=1) ---')
    print('-----------------------------------')
    print('Current Time:', datetime.now().strftime('%H:%M:%S'))
    print('-----------------------------------\n')
    for loc, current, pred, cur_label, pred_label in out:
        print(f'{loc}:')
        print(f'  Current:   {cur_label} ({current:.4f})')
        print(f'  Predicted: {pred_label} ({pred:.4f})\n')
    print('-----------------------------------')


def run_loop(model, refresh=REFRESH_SECONDS):
    next_prediction = 0
    while True:
        now = time.time()
        if now >= next_prediction:
            run_once(model)
            next_prediction = now + refresh
        else:
            # update clock line only
            print('\rCurrent Time: ' + datetime.now().strftime('%H:%M:%S'), end='')
            time.sleep(1)


if __name__ == '__main__':
    print('DASHBOARD RUNNING -', __file__)
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Run one prediction and exit')
    parser.add_argument('--refresh', type=int, default=REFRESH_SECONDS, help='Prediction refresh interval seconds')
    args = parser.parse_args()

    model_path = find_model()
    if not model_path:
        print('No model file found. Searched paths:', MODEL_PATHS)
        exit(1)

    print('Loading model from', model_path)
    # Load without compilation to avoid deserializing training-only objects
    model = load_model(model_path, compile=False)
    print('Model loaded (compile=False)')

    if args.once:
        run_once(model)
    else:
        try:
            run_loop(model, refresh=args.refresh)
        except KeyboardInterrupt:
            print('\nExiting dashboard')

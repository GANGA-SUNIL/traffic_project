import os
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.metrics import mean_squared_error, mean_absolute_error
import matplotlib.pyplot as plt
import math

# Paths (safe outputs)
INPUT_CSV = 'cleaned_data.csv'
OUTPUT_DIR = 'scripts/output'
MODEL_PATH = os.path.join(OUTPUT_DIR, 'model_central.h5')
PLOT_PATH = os.path.join(OUTPUT_DIR, 'prediction_plot_central.png')

os.makedirs(OUTPUT_DIR, exist_ok=True)

SEQ_LEN = 10
TEST_RATIO = 0.2
EPOCHS = 12
BATCH_SIZE = 16


def create_sequences(values, seq_len=10):
    X, y = [], []
    for i in range(len(values) - seq_len):
        X.append(values[i:i+seq_len])
        y.append(values[i+seq_len])
    return np.array(X), np.array(y)


def main():
    # Load
    df = pd.read_csv(INPUT_CSV, parse_dates=['timestamp_utc'])

    # Filter for one node: Central Junction
    node = 'Central Junction'
    df_node = df[df['location'] == node].copy()
    if df_node.empty:
        print('No rows for', node)
        return

    # Preserve time order
    df_node = df_node.sort_values('timestamp_utc')
    df_node.reset_index(drop=True, inplace=True)

    # Add time features: hour and day_of_week
    if 'timestamp_utc' in df_node.columns:
        df_node['hour'] = df_node['timestamp_utc'].dt.hour / 23.0
        df_node['day_of_week'] = df_node['timestamp_utc'].dt.dayofweek / 6.0

    # Use multi-feature input: [congestion_index, hour, day_of_week]
    features = ['congestion_index', 'hour', 'day_of_week']
    for f in features:
        if f not in df_node.columns:
            # fill missing with zeros
            df_node[f] = 0.0

    arr = df_node[features].astype(float).values

    # Scaling per feature
    scaler = MinMaxScaler(feature_range=(0, 1))
    arr_scaled = scaler.fit_transform(arr)

    # Create sequences (X has shape [samples, seq_len, features]) and y is next congestion value (unscaled)
    X_raw, y_raw = [], []
    for i in range(len(arr_scaled) - SEQ_LEN):
        X_raw.append(arr_scaled[i:i+SEQ_LEN])
        # target is the congestion_index at i+SEQ_LEN (unscaled original)
        y_raw.append(arr[i+SEQ_LEN, 0])
    X = np.array(X_raw)
    y = np.array(y_raw).reshape(-1, 1)

    # Train/test split (time-order, no shuffle)
    n = len(X)
    split = int(n * (1 - TEST_RATIO))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    print(f'Total sequences: {n}, Train: {len(X_train)}, Test: {len(X_test)}')

    # Build model
    n_features = X.shape[2]
    model = Sequential()
    model.add(LSTM(50, return_sequences=True, input_shape=(SEQ_LEN, n_features)))
    model.add(Dropout(0.2))
    model.add(LSTM(50))
    model.add(Dropout(0.2))
    model.add(Dense(1))

    model.compile(optimizer='adam', loss='mse')

    # Fit
    es = EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)
    history = model.fit(X_train, y_train, epochs=EPOCHS, batch_size=BATCH_SIZE, validation_data=(X_test, y_test), callbacks=[es], shuffle=False, verbose=2)

    # Predict (model outputs congestion index in original scale)
    preds = model.predict(X_test).reshape(-1, 1)
    y_test_orig = y_test.reshape(-1, 1)

    # Metrics
    rmse = math.sqrt(mean_squared_error(y_test_orig, preds))
    mae = mean_absolute_error(y_test_orig, preds)

    # Save model
    model.save(MODEL_PATH)

    # Plot (time axis using timestamps aligned to y_test)
    times = df_node['timestamp_utc'].iloc[SEQ_LEN + split: SEQ_LEN + split + len(y_test_orig)].values

    plt.figure(figsize=(12,6))
    plt.plot(times, y_test_orig, label='Actual', marker='o', linewidth=1)
    plt.plot(times, preds, label='Predicted', marker='x', linewidth=1)
    plt.xlabel('Time')
    plt.ylabel('Congestion Index')
    plt.title(f'LSTM predictions for {node} — RMSE: {rmse:.4f}, MAE: {mae:.4f}')
    plt.legend()
    plt.tight_layout()
    plt.xticks(rotation=30)
    plt.savefig(PLOT_PATH)
    plt.close()

    # Summary
    print('\nTRAINING SUMMARY')
    print('Node:', node)
    print('Model saved to:', MODEL_PATH)
    print('Plot saved to:', PLOT_PATH)
    print(f'RMSE: {rmse:.6f}')
    print(f'MAE: {mae:.6f}')
    # Simple overfitting check: compare train & val loss
    train_loss = history.history['loss'][-1]
    val_loss = history.history['val_loss'][-1]
    print(f'Last train loss: {train_loss:.6f}, last val loss: {val_loss:.6f}')
    if val_loss > train_loss * 2:
        print('Warning: possible overfitting (val_loss >> train_loss)')
    else:
        print('No strong overfitting signal detected.')

if __name__ == '__main__':
    main()

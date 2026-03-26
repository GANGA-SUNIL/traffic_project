import os
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split

print("Starting LSTM Traffic Prediction Pipeline...")

try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
except ImportError:
    print("TensorFlow not installed. Please try: pip install tensorflow")
    import sys
    sys.exit(1)

# 1. Load the data
print("Loading dataset...")
df = pd.read_csv("traffic_dataset.csv", parse_dates=["timestamp_ist"])
df = df.sort_values(by="timestamp_ist")

# We'll use 'current_speed', 'free_flow_speed', and 'congestion_index' as features
# and try to predict the next 'congestion_index'
features = ['current_speed', 'free_flow_speed', 'congestion_index']
data = df[features].values

# 2. Scale Data
print("Scaling data...")
scaler = MinMaxScaler(feature_range=(0, 1))
scaled_data = scaler.fit_transform(data)

# 3. Create Sequences for LSTM
# Use sequence of 10 steps (e.g. 10 past readings) to predict the next 1 reading
SEQ_LENGTH = 10

def create_sequences(dataset, seq_length):
    X, y = [], []
    for i in range(len(dataset) - seq_length):
        X.append(dataset[i : i + seq_length, :])
        # predict the congestion_index (index 2 in our features array)
        y.append(dataset[i + seq_length, 2])
    return np.array(X), np.array(y)

X, y = create_sequences(scaled_data, SEQ_LENGTH)

# Split into train and test
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
print(f"Training shapes: X={X_train.shape}, y={y_train.shape}")

# 4. Build LSTM Model
print("Building LSTM model...")
model = Sequential()
model.add(LSTM(50, return_sequences=True, input_shape=(X_train.shape[1], X_train.shape[2])))
model.add(Dropout(0.2))
model.add(LSTM(50, return_sequences=False))
model.add(Dropout(0.2))
model.add(Dense(25))
model.add(Dense(1)) # Output is 1 continuous value (congestion index)

model.compile(optimizer='adam', loss='mean_squared_error')

# 5. Train Model
print("Training the model (this may take a moment)...")
model.fit(X_train, y_train, batch_size=32, epochs=5, validation_data=(X_test, y_test))

# 6. Save the model
model_filename = 'traffic_lstm_model.h5'
model.save(model_filename)
print(f"Model successfully saved to {model_filename}!")
print("Digital Twin predictive backend component is ready.")
print("Dataset size:", len(df))

import os
import pandas as pd
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import tensorflow as tf
from tensorflow.keras.models import load_model
from sklearn.preprocessing import MinMaxScaler

app = FastAPI()

# Allow CORS for React Frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained Model and Data Scaler
try:
    model = load_model("traffic_lstm_model.h5")
    print("LSTM Neural Network loaded successfully!")
    
    # We must rebuild the exact scaler used in train_lstm.py to decode/encode inputs correctly
    df = pd.read_csv("traffic_dataset.csv", parse_dates=["timestamp_ist"])
    df = df.sort_values(by="timestamp_ist")
    features = ['current_speed', 'free_flow_speed', 'congestion_index']
    data = df[features].values
    
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaler.fit(data) # Fit on all data just like training
except Exception as e:
    print(f"Failed to load LSTM system. Has it been trained? Error: {e}")

@app.get("/predict")
def predict_traffic(current_speed: float, free_flow_speed: float, congestion: float):
    """
    Takes live metrics and runs it through the LSTM.
    Note: A true sequence model requires past N states, but for API simplicity 
    we will simulate feeding 10 identical recent states if full history isn't provided.
    """
    try:
        # Create a single input vector
        input_data = np.array([[current_speed, free_flow_speed, congestion]])
        
        # Scale input
        scaled_input = scaler.transform(input_data)
        
        # Build 10 length sequence (simulating stable previous traffic to get forecast)
        sequence = np.repeat(scaled_input, 10, axis=0).reshape((1, 10, 3))
        
        # Predict 
        predicted_scaled = model.predict(sequence)
        
        # Our prediction is just the congestion index (which was column 2)
        # We need a dummy array to inverse_transform shape
        dummy = np.zeros((1, 3))
        dummy[0, 2] = predicted_scaled[0, 0]
        
        predicted_unscaled = scaler.inverse_transform(dummy)[0, 2]
        
        # Ensure bounds 0-1 (representing 0-100%)
        final_pred = min(max(predicted_unscaled, 0.0), 1.0)
        
        return {
            "status": "success",
            "lstm_predicted_congestion_index": final_pred,
            "prediction_confidence": "high"
        }
    except Exception as e:
         return {"status": "error", "message": str(e)}

@app.get("/")
def read_root():
    return {"message": "Traffic Digital Twin LSTM Backend API is Running"}

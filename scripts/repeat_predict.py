#!/usr/bin/env python
"""Simple client to call /predict repeatedly and print responses."""
import time
import requests

URL = "http://127.0.0.1:8000/predict"

def run(times: int = 5, delay: float = 0.5):
    for i in range(times):
        params = {"current_speed": 10 + i, "free_flow_speed": 20, "congestion": 0.3}
        try:
            r = requests.get(URL, params=params, timeout=5)
            print(f"[{i+1}] status={r.status_code} -> {r.json()}")
        except Exception as e:
            print(f"[{i+1}] request failed: {e}")
        time.sleep(delay)

if __name__ == '__main__':
    run(10, 0.3)

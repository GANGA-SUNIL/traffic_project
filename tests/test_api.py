from fastapi.testclient import TestClient
from api import app

client = TestClient(app)


def test_predict_endpoint_returns_success():
    resp = client.get("/predict", params={"current_speed": 10, "free_flow_speed": 20, "congestion": 0.3})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "success"
    assert "lstm_predicted_congestion_index" in data

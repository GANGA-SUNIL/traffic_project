import json
import csv
from datetime import datetime, timedelta

# open json file
with open("traffic_data.json") as f:
    data = json.load(f)

records = data["traffic_data"]

with open("traffic_dataset.csv", "w", newline="") as file:
    writer = csv.writer(file)

    writer.writerow([
        "timestamp_utc",
        "timestamp_ist",
        "location",
        "current_speed",
        "free_flow_speed",
        "congestion_index",
        "confidence"
    ])

    for key in records:
        r = records[key]

        utc_time = datetime.fromisoformat(r["timestamp"].replace("Z",""))

        # convert to Indian time
        ist_time = utc_time + timedelta(hours=5, minutes=30)

        writer.writerow([
            utc_time,
            ist_time,
            r["location"],
            r["current_speed"],
            r["free_flow_speed"],
            r["congestion_index"],
            r["confidence"]
        ])

print("CSV file created successfully")
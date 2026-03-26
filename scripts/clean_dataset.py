import csv
from collections import defaultdict

INPUT = 'traffic_dataset.csv'
OUTPUT = 'cleaned_data.csv'

# Parameters
ZERO_SEQ_THRESHOLD = 5  # sequences longer than this are candidates
SIGNIFICANT_SPEED = 10  # surrounding speed >= this considered significantly higher

def parse_row(row):
    # Convert numeric fields to floats where appropriate
    try:
        row['current_speed'] = float(row['current_speed'])
    except:
        row['current_speed'] = None
    try:
        row['free_flow_speed'] = float(row['free_flow_speed'])
    except:
        row['free_flow_speed'] = None
    try:
        row['congestion_index'] = float(row['congestion_index'])
    except:
        row['congestion_index'] = None
    try:
        row['confidence'] = float(row['confidence'])
    except:
        row['confidence'] = None
    return row


def main():
    # Load CSV
    with open(INPUT, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = [dict(r) for r in reader]
        fieldnames = reader.fieldnames

    # Parse numeric fields
    for r in rows:
        parse_row(r)

    # Index rows per location (preserve original order)
    loc_indices = defaultdict(list)
    for i, r in enumerate(rows):
        loc_indices[r['location']].append(i)

    sequences_found = 0
    sequences_modified = 0
    rows_modified = 0
    modified_flags = [False] * len(rows)

    for loc, indices in loc_indices.items():
        i = 0
        n = len(indices)
        while i < n:
            idx = indices[i]
            r = rows[idx]
            # Consider a zero when current_speed == 0 (exact match)
            if r['current_speed'] == 0:
                # start sequence
                start = i
                end = i
                while end + 1 < n and rows[indices[end+1]]['current_speed'] == 0:
                    end += 1
                seq_len = end - start + 1
                sequences_found += 1

                if seq_len > ZERO_SEQ_THRESHOLD:
                    # find previous valid
                    prev_idx = None
                    for j in range(start-1, -1, -1):
                        cand = rows[indices[j]]
                        if cand['current_speed'] not in (None, 0):
                            prev_idx = indices[j]
                            break
                    # find next valid
                    next_idx = None
                    for j in range(end+1, n):
                        cand = rows[indices[j]]
                        if cand['current_speed'] not in (None, 0):
                            next_idx = indices[j]
                            break

                    prev_speed = rows[prev_idx]['current_speed'] if prev_idx is not None else None
                    next_speed = rows[next_idx]['current_speed'] if next_idx is not None else None

                    surrounding_max = max([v for v in (prev_speed, next_speed) if v is not None], default=0)

                    if surrounding_max >= SIGNIFICANT_SPEED and prev_idx is not None:
                        # treat as anomaly -> forward fill using prev_idx values
                        for k in range(start, end+1):
                            target_idx = indices[k]
                            # only modify if values are zero
                            if rows[target_idx]['current_speed'] == 0:
                                rows[target_idx]['current_speed'] = rows[prev_idx]['current_speed']
                                rows[target_idx]['free_flow_speed'] = rows[prev_idx]['free_flow_speed']
                                rows[target_idx]['congestion_index'] = rows[prev_idx]['congestion_index']
                                modified_flags[target_idx] = True
                                rows_modified += 1
                        sequences_modified += 1
                i = end + 1
            else:
                i += 1

    # Write cleaned CSV (preserve original field order and formatting)
    with open(OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r, modified in zip(rows, modified_flags):
            out = r.copy()
            # Convert numeric fields back to original string formatting
            out['current_speed'] = (str(int(out['current_speed'])) if isinstance(out['current_speed'], float) and out['current_speed'].is_integer() else ('' if out['current_speed'] is None else str(out['current_speed'])))
            out['free_flow_speed'] = (str(int(out['free_flow_speed'])) if isinstance(out['free_flow_speed'], float) and out['free_flow_speed'].is_integer() else ('' if out['free_flow_speed'] is None else str(out['free_flow_speed'])))
            out['congestion_index'] = (str(out['congestion_index']) if out['congestion_index'] is not None else '')
            out['confidence'] = (str(out['confidence']) if out['confidence'] is not None else '')
            writer.writerow(out)

    # Print summary
    print('CLEANING SUMMARY')
    print('Input file:', INPUT)
    print('Output file:', OUTPUT)
    print('Total rows:', len(rows))
    print('Zero sequences detected (per-location):', sequences_found)
    print('Sequences modified:', sequences_modified)
    print('Rows modified:', rows_modified)

if __name__ == '__main__':
    main()

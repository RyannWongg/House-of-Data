# fetch_lebron_shots.py
# pip install nba_api pandas

from nba_api.stats.endpoints import ShotChartDetail
from nba_api.stats.library.parameters import SeasonAll, SeasonTypeAllStar
import pandas as pd
import time
import json

PLAYER_ID = 2544  # LeBron James
START_YEAR = 2005
END_YEAR   = 2025   # inclusive end season uses 2023-24 as "2023-24"

def to_season_string(y):
    return f"{y}-{str((y+1)%100).zfill(2)}"

def fetch_season(season, season_type="Regular Season"):
    resp = ShotChartDetail(
        team_id=0,
        player_id=PLAYER_ID,
        season_type_all_star=season_type,
        season_nullable=season,
        context_measure_simple="FGA"
    )
    df = resp.get_data_frames()[0]
    df["season"] = season
    return df

all_rows = []
seasons = []

for y in range(START_YEAR, END_YEAR):  # stops at END_YEAR-1 → 2005..2024
    season = to_season_string(y)
    seasons.append(season)
    df = fetch_season(season, "Regular Season")
    all_rows.append(df)
    time.sleep(0.4)  # be nice to the API

shots = pd.concat(all_rows, ignore_index=True)

# Normalize columns to uppercase and keep only what we need
shots_up = shots.rename(columns=str.upper)

required = ["LOC_X", "LOC_Y", "SHOT_MADE_FLAG", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA"]
missing = [c for c in required if c not in shots_up.columns]
if missing:
    raise RuntimeError(f"Missing expected columns from NBA API: {missing}")

# Convert to feet (you’re assuming LOC_* are inches; if you later confirm tenths-of-inches,
# change the divisor to 120.0 instead of 12.0)
shots_out = shots_up[required].copy()
shots_out["x_ft"] = shots_out["LOC_X"] / 12.0
shots_out["y_ft"] = shots_out["LOC_Y"] / 12.0
shots_out["made"] = shots_up["SHOT_MADE_FLAG"].astype(int)

# Attach season used for each row
shots_out["season"] = shots["season"]

# Select columns & order for frontend
cols = ["x_ft", "y_ft", "made", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA", "season"]
records = shots_out[cols].to_dict(orient="records")

payload = {
    "player_id": PLAYER_ID,
    "player_name": "LeBron James",
    "seasons": seasons,                # ["2005-06", ..., "2023-24"]
    "count": int(len(records)),
    "shots": records
}

# Write wrapped JSON
out_path = "data/lebron_shots_2005_2024.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)

print(f"Wrote {out_path} with {payload['count']} shots across {len(seasons)} seasons")


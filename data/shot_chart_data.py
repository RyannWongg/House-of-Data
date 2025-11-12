# fetch_lebron_shots.py
# pip install nba_api pandas

from nba_api.stats.endpoints import ShotChartDetail
from nba_api.stats.library.parameters import SeasonAll, SeasonTypeAllStar
import pandas as pd
import time
import json


# change the year and player id for lebron
PLAYER_ID = 893  # Michael Jordan
START_YEAR = 1984
END_YEAR   = 2003

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

for y in range(START_YEAR, END_YEAR):
    season = to_season_string(y)
    seasons.append(season)
    df = fetch_season(season, "Regular Season")
    all_rows.append(df)
    time.sleep(0.4)

shots = pd.concat(all_rows, ignore_index=True)

shots_up = shots.rename(columns=str.upper)

required = ["LOC_X", "LOC_Y", "SHOT_MADE_FLAG", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA"]

shots_out = shots_up[required].copy()
shots_out["x_ft"] = shots_out["LOC_X"] / 12.0
shots_out["y_ft"] = shots_out["LOC_Y"] / 12.0
shots_out["made"] = shots_up["SHOT_MADE_FLAG"].astype(int)

# Attach season used for each row
shots_out["season"] = shots["season"]

cols = ["x_ft", "y_ft", "made", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA", "season"]
records = shots_out[cols].to_dict(orient="records")

payload = {
    "player_id": PLAYER_ID,
    "player_name": "Michael Jordan",
    "seasons": seasons,         
    "count": int(len(records)),
    "shots": records
}

out_path = "data/mj_shots_1984_2003.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)


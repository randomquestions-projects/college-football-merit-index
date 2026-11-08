#!/usr/bin/env python3
"""Build CFMI's public weekly data snapshot from public college football feeds.

No credentials or personal data. Failure before deploy leaves the existing site live.
The on-field bucket activates in the dashboard only with sufficient measured coverage.
"""
import csv
import io
import json
import time
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
DATA.mkdir(parents=True, exist_ok=True)
SOURCE = "https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/schedules/csv/cfb_schedules_2026.csv"
RELEASE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
ASSETS = {
    "team": ("espn_cfb_adv_team", "adv_team_2026.csv"),
    "situational": ("espn_cfb_adv_situational", "adv_situational_2026.csv"),
    "turnover": ("espn_cfb_adv_turnover", "adv_turnover_2026.csv"),
    "quarters": ("espn_cfb_linescores", "linescores_2026.csv"),
}
FIELDS = [
    "game_id", "team", "off_ppa", "def_ppa", "off_success_rate",
    "def_success_rate", "off_explosive_rate", "def_explosive_rate",
    "lead_share", "penalty_yards", "opp_penalty_yards", "turnovers_lost",
    "turnovers_gained", "redzone_td", "redzone_trips",
    "opp_redzone_td", "opp_redzone_trips",
]

def fetch_csv(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": "CFMI-public-data-snapshot/1.0"}), timeout=65) as response:
                data = response.read()
            rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
            if len(rows) < 1:
                raise ValueError("Empty CSV")
            return data, rows
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))

def number(record, field):
    try:
        x = float(record[field])
        return x if x == x else None
    except (TypeError, ValueError, KeyError):
        return None

def unit(x):
    if x is None:
        return None
    if 1 < x <= 100:
        return x / 100
    return x

def key(record, team_key="pos_team"):
    return str(record.get("game_id", "")).strip(), str(record.get(team_key, "")).strip()

def game_control(grouped, game_id, own_id, opp_id):
    own = grouped.get((game_id, own_id), [])
    opp = grouped.get((game_id, opp_id), [])
    def quarterly(items):
        out = {}
        for item in items:
            period, points = number(item, "period"), number(item, "value")
            if period is not None and points is not None:
                out[int(period)] = points
        return out
    a, b = quarterly(own), quarterly(opp)
    if not all(q in a and q in b for q in (1, 2, 3)):
        return None
    total_a, total_b, leads = 0, 0, 0
    for q in (1, 2, 3):
        total_a += a[q]; total_b += b[q]
        leads += 1 if total_a > total_b else .5 if total_a == total_b else 0
    return round(leads / 3, 6)

def main():
    schedule_bytes, schedule = fetch_csv(SOURCE)
    required = {"season", "game_id", "season_type", "completed", "home_id", "away_id",
                "home_team", "away_team", "home_division", "away_division",
                "home_points", "away_points", "start_date"}
    if not required.issubset(schedule[0]):
        raise RuntimeError("Game-results source schema changed; refusing a blank deployment")
    fbs = {g[s + "_team"] for g in schedule for s in ("home", "away")
           if g.get("season") == "2026" and g.get(s + "_division") == "fbs"}
    finals = [g for g in schedule
              if g.get("season") == "2026" and g.get("season_type") == "regular"
              and g.get("completed") == "TRUE"
              and number(g, "home_points") is not None
              and number(g, "away_points") is not None]
    if len(fbs) < 110 or len(finals) < 100:
        raise RuntimeError("Insufficient FBS coverage: %s teams; %s completed games" % (len(fbs), len(finals)))
    advanced, errors = {}, {}
    for label, (tag, filename) in ASSETS.items():
        try:
            _, rows = fetch_csv(f"{RELEASE}/{tag}/{filename}")
            advanced[label] = rows
            print("Advanced source", label, len(rows), "rows")
            print("SCHEMA", label, list(rows[0].keys()))
            print("KEY_SAMPLE", label, {k: rows[0].get(k) for k in ("game_id","pos_team","team_id","team","period","value","EPA_per_play","EPA_success_rate")})
        except Exception as exc:
            advanced[label] = []
            errors[label] = repr(exc)
            print("WARNING: advanced source unavailable", label, repr(exc))
    by_game = {}
    for label in ("team", "situational", "turnover"):
        by_game[label] = {key(r): r for r in advanced[label]
                          if r.get("game_id") and r.get("pos_team")}
    quarter_rows = {}
    for r in advanced["quarters"]:
        quarter_rows.setdefault(key(r, "team_id"), []).append(r)
    output = []
    valid_fbs_games = [g for g in finals if g["home_division"] == g["away_division"] == "fbs"]
    for g in valid_fbs_games:
        gid = str(g["game_id"])
        for own, other in (("home", "away"), ("away", "home")):
            own_id, other_id = str(g[own + "_id"]), str(g[other + "_id"])
            own_key, other_key = (gid, own_id), (gid, other_id)
            own_row = by_game["team"].get(own_key)
            other_row = by_game["team"].get(other_key)
            own_s = by_game["situational"].get(own_key)
            other_s = by_game["situational"].get(other_key)
            own_t = by_game["turnover"].get(own_key)
            other_t = by_game["turnover"].get(other_key)
            control = game_control(quarter_rows, gid, own_id, other_id)
            if any(x is None for x in (own_row, other_row, own_s, other_s, own_t, other_t, control)):
                continue
            rz, other_rz = unit(number(own_s, "EPA_success_rate_rz")), unit(number(other_s, "EPA_success_rate_rz"))
            record = {
                "game_id": gid, "team": g[own + "_team"],
                "off_ppa": number(own_row, "EPA_per_play"),
                "def_ppa": number(other_row, "EPA_per_play"),
                "off_success_rate": unit(number(own_s, "EPA_success_rate")),
                "def_success_rate": unit(number(other_s, "EPA_success_rate")),
                "off_explosive_rate": unit(number(own_row, "EPA_explosive_rate")),
                "def_explosive_rate": unit(number(other_row, "EPA_explosive_rate")),
                "lead_share": control,
                "penalty_yards": number(own_row, "total_pen_yards"),
                "opp_penalty_yards": number(other_row, "total_pen_yards"),
                "turnovers_lost": number(own_t, "turnovers"),
                "turnovers_gained": number(other_t, "turnovers"),
                # 'redzone_td' is a compatibility field and means red-zone positive-EPA
                # PLAY success rate, not possession-level TD conversion.
                "redzone_td": rz, "redzone_trips": 1,
                "opp_redzone_td": other_rz, "opp_redzone_trips": 1,
            }
            if any(v is None for v in record.values()):
                continue
            if any(not 0 <= record[field] <= 1 for field in
                   ("off_success_rate", "def_success_rate", "off_explosive_rate",
                    "def_explosive_rate", "redzone_td", "opp_redzone_td")):
                continue
            if abs(record["off_ppa"]) > 10 or abs(record["def_ppa"]) > 10:
                continue
            output.append(record)
    (DATA / "cfb_schedules_2026.csv").write_bytes(schedule_bytes)
    with (DATA / "cfmi_advanced_2026.csv").open("w", newline="", encoding="utf8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(output)
    metadata = {
        "season": 2026, "published_snapshot_at_utc": datetime.now(timezone.utc).isoformat(),
        "fbs_teams": len(fbs), "completed_games": len(finals),
        "fbs_fbs_games": len(valid_fbs_games),
        "advanced_team_game_rows": len(output),
        "advanced_source_row_counts": {name: len(rows) for name, rows in advanced.items()},
        "advanced_source_errors": errors, "game_data_source": SOURCE,
        "model_version": "CFMI-3.1-beta",
        "weights": {"strength_of_record": 35, "adjusted_margin": 20,
                    "quality_and_road": 20, "on_field": 25},
    }
    (DATA / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build CFMI's public weekly data snapshot from public college football feeds.

No credentials or personal data. Failure before deploy leaves the existing site live.
The on-field bucket activates in the dashboard only with sufficient measured coverage.
"""
import csv
import io
import json
import os
import time
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SEASON = str(os.environ.get("CFMI_SEASON", "2026"))
if SEASON not in ("2024","2025","2026"):
    raise RuntimeError("Unsupported season")
DATA = ROOT / "site" / "data" if SEASON == "2026" else ROOT / "site" / "data" / "history" / SEASON
DATA.mkdir(parents=True, exist_ok=True)
SOURCE = f"https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/schedules/csv/cfb_schedules_{SEASON}.csv"
RELEASE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
ASSETS = {
    "team": ("espn_cfb_adv_team", f"adv_team_{SEASON}.csv"),
    "situational": ("espn_cfb_adv_situational", f"adv_situational_{SEASON}.csv"),
    "turnover": ("espn_cfb_adv_turnover", f"adv_turnover_{SEASON}.csv"),
    "quarters": ("espn_cfb_linescores", f"linescores_{SEASON}.csv"),
}
FIELDS = [
    "game_id", "team", "off_ppa", "def_ppa", "off_success_rate",
    "def_success_rate", "off_explosive_rate", "def_explosive_rate",
    "lead_share", "penalty_yards", "opp_penalty_yards", "turnovers_lost",
    "turnovers_gained", "redzone_td", "redzone_trips",
    "opp_redzone_td", "opp_redzone_trips", "expected_turnover_margin",
    # Opponent-specific play-style signals, FBS-vs-FBS GAME-level only.
    # Defensive fields reflect the opponent's *allowed* offense by phase.
    "off_rush_ppa", "def_rush_ppa", "off_pass_ppa", "def_pass_ppa",
    "off_rush_firstdown_rate", "def_rush_firstdown_rate",
    "off_pass_firstdown_rate", "def_pass_firstdown_rate",
    "off_rush_explosive_rate", "def_rush_explosive_rate",
    "off_pass_explosive_rate", "def_pass_explosive_rate",
    "off_pass_share", "off_rushes", "off_passes",
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

def key(record, team_key="pos_team_id"):
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
           if g.get("season") == SEASON and g.get(s + "_division") == "fbs"}
    finals = [g for g in schedule
              if g.get("season") == SEASON and g.get("season_type") == "regular"
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
        except Exception as exc:
            advanced[label] = []
            errors[label] = repr(exc)
            print("WARNING: advanced source unavailable", label, repr(exc))
    by_game = {}
    for label in ("team", "situational", "turnover"):
        by_game[label] = {key(r): r for r in advanced[label]
                          if r.get("game_id") and r.get("pos_team_id")}
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
            # Preserve a partially measured game rather than drop every metric
            # when one feed is absent or its red-zone/penalty value is null.
            own_row, other_row = own_row or {}, other_row or {}
            own_s, other_s = own_s or {}, other_s or {}
            own_t, other_t = own_t or {}, other_t or {}
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
                "redzone_td": rz, "redzone_trips": 1 if rz is not None else None,
                "opp_redzone_td": other_rz,
                "opp_redzone_trips": 1 if other_rz is not None else None,
                "expected_turnover_margin": number(own_t, "expected_turnover_margin"),
                "off_rush_ppa": number(own_row, "EPA_rushing_per_play"),
                "def_rush_ppa": number(other_row, "EPA_rushing_per_play"),
                "off_pass_ppa": number(own_row, "EPA_passing_per_play"),
                "def_pass_ppa": number(other_row, "EPA_passing_per_play"),
                # First-down creation is NOT the same measure as EPA success rate.
                "off_rush_firstdown_rate": unit(number(own_row, "rushing_first_downs_created_rate")),
                "def_rush_firstdown_rate": unit(number(other_row, "rushing_first_downs_created_rate")),
                "off_pass_firstdown_rate": unit(number(own_row, "passing_first_downs_created_rate")),
                "def_pass_firstdown_rate": unit(number(other_row, "passing_first_downs_created_rate")),
                "off_rush_explosive_rate": unit(number(own_row, "EPA_explosive_rushing_rate")),
                "def_rush_explosive_rate": unit(number(other_row, "EPA_explosive_rushing_rate")),
                "off_pass_explosive_rate": unit(number(own_row, "EPA_explosive_passing_rate")),
                "def_pass_explosive_rate": unit(number(other_row, "EPA_explosive_passing_rate")),
                "off_pass_share": unit(number(own_row, "passes_rate")),
                "off_rushes": number(own_row, "rushes"),
                "off_passes": number(own_row, "passes"),
            }
            for field in ("off_success_rate", "def_success_rate",
                          "off_explosive_rate", "def_explosive_rate", "redzone_td",
                          "opp_redzone_td", "lead_share"):
                if record[field] is not None and not 0 <= record[field] <= 1:
                    record[field] = None
            for field in ("off_ppa", "def_ppa"):
                if record[field] is not None and abs(record[field]) > 10:
                    record[field] = None
            for field in ("off_rush_firstdown_rate", "def_rush_firstdown_rate",
                          "off_pass_firstdown_rate", "def_pass_firstdown_rate",
                          "off_rush_explosive_rate", "def_rush_explosive_rate",
                          "off_pass_explosive_rate", "def_pass_explosive_rate",
                          "off_pass_share"):
                if record[field] is not None and not 0 <= record[field] <= 1:
                    record[field] = None
            for field in ("off_rush_ppa", "def_rush_ppa", "off_pass_ppa", "def_pass_ppa"):
                if record[field] is not None and abs(record[field]) > 10:
                    record[field] = None
            for field in ("off_rushes", "off_passes"):
                if record[field] is not None and not 0 <= record[field] <= 150:
                    record[field] = None
            if not any(record[key] is not None for key in
                       ("off_ppa", "off_success_rate", "off_explosive_rate",
                        "lead_share", "turnovers_lost", "penalty_yards")):
                continue
            output.append(record)
    # Per-week completeness audit: why exactly were some FBS matchups omitted?
    from collections import Counter, defaultdict
    covered_ids = {item["game_id"] for item in output}
    totals, failures, reasons = Counter(), Counter(), Counter()
    missing_examples = []
    for g in valid_fbs_games:
        wk = str(g["week"])
        totals[wk] += 1
        if str(g["game_id"]) in covered_ids:
            continue
        failures[wk] += 1
        gid = str(g["game_id"])
        row_reasons = []
        for label in ("team", "situational", "turnover"):
            for side in ("home", "away"):
                if (gid, str(g[side + "_id"])) not in by_game[label]:
                    row_reasons.append(label + "_" + side)
        if not quarter_rows.get((gid, str(g["home_id"]))):
            row_reasons.append("quarters_home")
        if not quarter_rows.get((gid, str(g["away_id"]))):
            row_reasons.append("quarters_away")
        if not row_reasons:
            row_reasons.append("missing_or_invalid_measure")
        reasons.update(row_reasons)
        missing_examples.append((wk, gid, g["home_team"], g["away_team"], ",".join(row_reasons)))
    print("CFMI COVERAGE BY WEEK:", [(w, totals[w], totals[w]-failures[w], failures[w]) for w in sorted(totals, key=int)])
    print("CFMI MISSING REASONS:", reasons.most_common())
    print("CFMI MISSING GAME EXAMPLES:", missing_examples[:30])
    (DATA / f"cfb_schedules_{SEASON}.csv").write_bytes(schedule_bytes)
    with (DATA / f"cfmi_advanced_{SEASON}.csv").open("w", newline="", encoding="utf8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(output)
    metadata = {
        "season": int(SEASON), "published_snapshot_at_utc": datetime.now(timezone.utc).isoformat(),
        "fbs_teams": len(fbs), "completed_games": len(finals),
        "fbs_fbs_games": len(valid_fbs_games),
        "advanced_team_game_rows": len(output),
        "advanced_source_row_counts": {name: len(rows) for name, rows in advanced.items()},
        "advanced_source_errors": errors, "game_data_source": SOURCE,
        "model_version": "CFMI-4.0.0",
        "weights": {"strength_of_record": 30, "adjusted_margin": 20,
                    "quality_and_road": 15, "on_field": 35},
        "data_coverage_policy": "per-metric nullable values; neutral-adjusted measured share",
    }
    (DATA / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))

if __name__ == "__main__":
    main()

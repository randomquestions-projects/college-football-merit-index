#!/usr/bin/env python3
"""Fit a season/brand-neutral live-game win-probability model.

2023 CFB play-by-play is the only training year. 2024 and 2025 are genuinely
out-of-sample validation years. Features contain ONLY current score, clock,
possession and field position: NEVER Vegas spreads, ESPN WP, team or conference.
"""
import json,math,tempfile,urllib.request
from pathlib import Path
import numpy as np
import duckdb

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"site"/"data"/"neutral_wp_model.json"
URL="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_cfb_pbp/play_by_play_{year}.parquet"
FIELDS = ['score_leverage','late_margin','possession_leverage','position_leverage','clock_fraction']

def fetch(year):
    url=URL.format(year=year)
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"CFMI-state-only-WP/1.0"}),timeout=180) as resp:
        return resp.read()

def data(year):
    blob=fetch(year)
    with tempfile.NamedTemporaryFile(suffix=".parquet") as tmp:
        tmp.write(blob);tmp.flush()
        con=duckdb.connect()
        # One record per possessing drive avoids overweighting long drives.
        query="""SELECT game_id, "period", "clock.minutes", "clock.seconds",
             "start.homeScore", "start.awayScore", "start.pos_team.id",
             homeTeamId, "start.yardsToEndzone", homeFinalScore, awayFinalScore
           FROM read_parquet(?)
           WHERE scrimmage_play=TRUE
             AND "drive.id" IS NOT NULL
             AND "period" BETWEEN 1 AND 4
             AND "clock.minutes" BETWEEN 0 AND 15
             AND "start.homeScore" IS NOT NULL
             AND "start.awayScore" IS NOT NULL
             AND "start.pos_team.id" IS NOT NULL
             AND "start.yardsToEndzone" BETWEEN 1 AND 99
             AND homeFinalScore IS NOT NULL AND awayFinalScore IS NOT NULL
             AND homeFinalScore <> awayFinalScore
           QUALIFY row_number() OVER (
                 PARTITION BY game_id, "drive.id" ORDER BY game_play_number
             )=1"""
        rows=con.execute(query,[tmp.name]).fetchall()
        con.close()
    if len(rows)<8000:raise ValueError(f"Not enough 202{year} drive states: {len(rows)}")
    X,y,games=[],[],[]
    for gid,period,minute,second,home,away,off,home_id,yte,hfinal,afinal in rows:
        remaining=(4-int(period))*900+int(minute)*60+int(second or 0)
        if not 30<=remaining<=3600:continue
        X.append(features(int(home)-int(away),remaining,int(off)==int(home_id),int(yte)))
        y.append(int(hfinal>afinal));games.append(gid)
    return np.asarray(X,dtype=np.float64),np.asarray(y,dtype=np.float64),np.asarray(games)

def features(score_diff,remaining_sec,poss_home,yards_to_goal):
    minutes=max(.5,remaining_sec/60.0)
    poss=1 if poss_home else -1
    field=(50-float(yards_to_goal))/50
    return [
      float(score_diff)/math.sqrt(minutes+5),
      float(score_diff)/(minutes+8),
      poss/math.sqrt(minutes+6),
      poss*field/math.sqrt(minutes+6),
      minutes/60.0,
    ]

def sigmoid(z):
    z=np.clip(z,-35,35)
    return 1/(1+np.exp(-z))

def fit(X,y,games):
    mu=X.mean(axis=0);sd=X.std(axis=0);sd[sd<1e-6]=1
    Z=np.column_stack((np.ones(len(X)),(X-mu)/sd))
    ids,counts=np.unique(games,return_counts=True)
    n=dict(zip(ids,counts))
    weights=np.asarray([1.0/n[g] for g in games],dtype=np.float64)
    weights*=len(weights)/sum(weights)
    theta=np.zeros(Z.shape[1],dtype=np.float64)
    reg=np.diag([0,.04,.04,.04,.04,.04])
    for i in range(35):
        p=sigmoid(Z@theta)
        grad=Z.T@(weights*(y-p))-reg@theta
        H=Z.T@((weights*p*(1-p))[:,None]*Z)+reg
        delta=np.linalg.solve(H,grad)
        theta+=delta
        if max(abs(delta))<1e-6:break
    return mu,sd,theta

def validate(X,y,mu,sd,theta):
    Z=np.column_stack((np.ones(len(X)),(X-mu)/sd))
    p=sigmoid(Z@theta)
    brier=float(np.mean((p-y)**2))
    accuracy=float(np.mean((p>=.5)==y))
    return {"states":len(y),"brier":round(brier,5),"accuracy":round(accuracy,4),
            "mean_pred":round(float(p.mean()),4),"mean_actual":round(float(y.mean()),4)}

def main():
    trX,trY,trG=data(2023)
    mu,sd,theta=fit(trX,trY,trG)
    print("NEUTRAL_WP_TRAIN_2023",validate(trX,trY,mu,sd,theta),flush=True)
    tests={}
    for year in (2024,2025):
        X,y,_=data(year);tests[str(year)]=validate(X,y,mu,sd,theta)
        print("NEUTRAL_WP_HELDOUT",year,tests[str(year)],flush=True)
    if any(v["brier"]>.24 for v in tests.values()):
        raise RuntimeError("Score/time/possession model failed holdout Brier sanity check")
    doc={
     "model_version":"neutral-state-wp-v1",
     "train_year":2023,
     "heldout_validation":tests,
     "feature_names":FIELDS,
     "scaler_mean":mu.tolist(),"scaler_sd":sd.tolist(),
     "coefficients":theta.tolist(),
     "inputs":"score differential, remaining time, possession and field position only",
     "excluded":["team names","conference","historical records","polls","pregame betting spreads","ESPN wp_before"],
     "usage":"Game-state win probability, not pregame odds; garbage-time filtering and possession-level game control"
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(doc,indent=2)+"\n")
    print("NEUTRAL_WP_MODEL_SAVED",OUT,flush=True)
if __name__=="__main__":main()

#!/usr/bin/env python3
"""Actions minutes used this calendar month (UTC), per job rounded up like GitHub billing.
Env: GH_TOKEN, REPO (owner/name). Optional: LIMIT (2000), WARN_PCT (70).
Prints JSON {used, used_before_24h, limit, warn_at, crossed}. 'crossed' = first night over the warn line."""
import json, math, os, urllib.request, datetime as dt
tok, repo = os.environ["GH_TOKEN"], os.environ["REPO"]
limit = int(os.environ.get("LIMIT", "2000")); warn = limit * int(os.environ.get("WARN_PCT", "70")) // 100
def get(url):
    r = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(r, timeout=30) as f: return json.load(f)
now = dt.datetime.now(dt.timezone.utc); start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
day_ago = now - dt.timedelta(hours=24)
iso = lambda s: dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
used = before = 0; page = 1
while True:
    d = get(f"https://api.github.com/repos/{repo}/actions/runs?per_page=100&page={page}&created=>={start:%Y-%m-%d}")
    runs = d.get("workflow_runs", [])
    for run in runs:
        if run["status"] != "completed": continue
        jp = 1
        while True:
            j = get(f"https://api.github.com/repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100&page={jp}")
            for job in j.get("jobs", []):
                if not job.get("started_at") or not job.get("completed_at"): continue
                secs = (iso(job["completed_at"]) - iso(job["started_at"])).total_seconds()
                m = max(1, math.ceil(secs / 60)) if secs > 0 else 0
                used += m
                if iso(run["created_at"]) < day_ago: before += m
            if len(j.get("jobs", [])) < 100: break
            jp += 1
    if len(runs) < 100: break
    page += 1
print(json.dumps({"used": used, "used_before_24h": before, "limit": limit, "warn_at": warn, "crossed": used >= warn > before}))

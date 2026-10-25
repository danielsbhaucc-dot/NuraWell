"""KMS rotation job (Cloud Run function, service account kms-rotator, no JSON keys).

Daily (Cloud Scheduler) or on demand (admin button via prod, IAM-protected invoke):
 1. asks prod (/api/v1/internal/kms, Google ID token) which key version each wrapped value uses;
 2. if any value is not on the current primary version (or force): prod re-wraps server-side and returns
    ciphertexts to THIS job only; they go straight to Vercel production env (type sensitive);
 3. redeploys production and verifies every key unwraps and matches on the new deployment;
 4. only after a verified run, schedules destruction (30-day recoverable window) of key versions
    older than the primary that is >= MIN_PRIMARY_AGE old. Nothing is destroyed if anything is unverified.
 5. reports the result to prod (audit log; failures alert the owner).
Never logs ciphertexts, tokens or key material. Plaintext keys never pass through this job.
"""
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    import functions_framework
except ImportError:  # unit tests
    class functions_framework:  # noqa: N801
        http = staticmethod(lambda f: f)

PROD = os.environ.get("PROD_INTERNAL_URL", "https://nurawell.vercel.app/api/v1/internal/kms")
KEY = os.environ.get("KMS_KEY", "projects/nurawell-kms-2610/locations/europe-west3/keyRings/nurawell/cryptoKeys/nurawell-kek")
SECRET = os.environ.get("VERCEL_TOKEN_SECRET", "projects/nurawell-kms-2610/secrets/vercel-env-writer/versions/latest")
TEAM = os.environ.get("VERCEL_TEAM_ID", "team_wYbZmOqwByPdeJ8sinbEF5Ap")
PROJECT = os.environ.get("VERCEL_PROJECT_ID", "prj_qVOo079U9GJB7O9o9cg0V7MUSqoc")
NAMES = ["PII_ENCRYPTION_KEY", "SECURE_VAULT_KEY", "CONSENT_SIGNING_PRIVATE_KEY", "LEGAL_LOGS_VERCEL_TOKEN", "LEGAL_LOGS_SUPABASE_TOKEN"]
MIN_PRIMARY_AGE = dt.timedelta(days=int(os.environ.get("MIN_PRIMARY_AGE_DAYS", "2")))
MD = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/"


def _req(method, url, headers=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    h = {"content-type": "application/json", **(headers or {})}
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, {}


def _md(path):
    r = urllib.request.Request(MD + path, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(r, timeout=10) as resp:
        return resp.read().decode()


def access_token():
    return json.loads(_md("token"))["access_token"]


def id_token(aud):
    return _md("identity?format=full&audience=" + urllib.parse.quote(aud, safe=""))


class Deps:
    """Network edges, swappable in tests."""

    def prod(self, action, **kw):
        s, j = _req("POST", PROD, {"authorization": "Bearer " + id_token(PROD)}, {"action": action, **kw}, 40)
        if s != 200:
            raise RuntimeError(f"prod_{action}_{s}")
        return j

    def gcp(self, method, path, body=None):
        s, j = _req(method, "https://cloudkms.googleapis.com/v1/" + path, {"authorization": "Bearer " + access_token()}, body)
        if s != 200:
            raise RuntimeError(f"kms_{s}")
        return j

    def vercel_token(self):
        s, j = _req("GET", f"https://secretmanager.googleapis.com/v1/{SECRET}:access", {"authorization": "Bearer " + access_token()})
        if s != 200:
            raise RuntimeError(f"secret_{s}")
        import base64
        return base64.b64decode(j["payload"]["data"]).decode().strip()

    def vercel(self, method, path, body=None):
        sep = "&" if "?" in path else "?"
        s, j = _req(method, "https://api.vercel.com" + path + sep + "teamId=" + TEAM, {"authorization": "Bearer " + self._vt}, body, 60)
        if s not in (200, 201):
            raise RuntimeError(f"vercel_{s}")
        return j

    def sleep(self, s):
        time.sleep(s)


def _parse(ts):
    base, _, frac = ts.rstrip("Z").partition(".")
    return dt.datetime.fromisoformat(base).replace(tzinfo=dt.timezone.utc) + dt.timedelta(microseconds=int((frac + "000000")[:6]) if frac else 0)


def verified(status):
    keys = {k["name"]: k for k in status.get("keys", [])}
    if status.get("mode") == "off" or status.get("state") != "ok":
        return False
    for n in NAMES:
        k = keys.get(n)
        if not k or not k.get("wrapped") or k.get("usedPrimary") is not True or k.get("match") is False:
            return False
        if k.get("match") is None and k.get("source") != "kms":
            return False
    return True


def redeploy(d):
    proj = d.vercel("GET", f"/v9/projects/{PROJECT}")
    deps = d.vercel("GET", f"/v6/deployments?projectId={PROJECT}&target=production&state=READY&limit=1")["deployments"]
    if not deps:
        raise RuntimeError("no_prod_deployment")
    new = d.vercel("POST", "/v13/deployments?forceNew=1", {"name": proj["name"], "deploymentId": deps[0]["uid"], "target": "production"})
    for _ in range(60):
        d.sleep(10)
        st = d.vercel("GET", f"/v13/deployments/{new['id']}")
        if st.get("readyState") == "READY":
            return new["id"]
        if st.get("readyState") in ("ERROR", "CANCELED"):
            raise RuntimeError("redeploy_" + st["readyState"].lower())
    raise RuntimeError("redeploy_timeout")


def run(d, force=False, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    log = []
    status = d.prod("status")["status"]
    key = d.gcp("GET", KEY)
    primary = key["primary"]
    stale = any(k.get("usedPrimary") is False or not k.get("wrapped") for k in status.get("keys", []))
    if force or stale:
        w = d.prod("wrap")
        wrapped = w.get("wrapped", [])
        if not w.get("ok") or sorted(x["name"] for x in wrapped) != sorted(NAMES):
            raise RuntimeError("wrap_incomplete")
        d._vt = d.vercel_token()
        for x in wrapped:
            d.vercel("POST", f"/v10/projects/{PROJECT}/env?upsert=true",
                     {"key": "KMS_WRAPPED_" + x["name"], "value": x["ciphertext"], "type": "sensitive", "target": ["production"]})
        log.append("rewrapped")
        dep = redeploy(d)
        log.append("redeployed")
        status = None
        for _ in range(6):
            d.sleep(15)
            status = d.prod("status")["status"]
            if verified(status):
                break
        if status.get("mode") == "off":
            return {"ok": True, "verified": False, "log": log + ["mode_off_not_verified"], "deployment": dep}
        if not verified(status):
            raise RuntimeError("verify_failed")
        log.append("verified")
    elif not verified(status):
        return {"ok": status.get("mode") == "off", "verified": False, "log": log + ["not_verified_mode_" + status.get("mode", "?")]}

    # Destroy old versions only after a verified state and once the primary has aged.
    destroyed = []
    p_created = _parse(primary["createTime"])
    if now - p_created >= MIN_PRIMARY_AGE:
        vs = d.gcp("GET", KEY + "/cryptoKeyVersions?filter=state%3DENABLED%20OR%20state%3DDISABLED").get("cryptoKeyVersions", [])
        for v in vs:
            if v["name"] != primary["name"] and _parse(v["createTime"]) < p_created:
                d.gcp("POST", v["name"] + ":destroy", {})
                destroyed.append(v["name"].rsplit("/", 1)[-1])
    if destroyed:
        log.append("scheduled_destroy:" + ",".join(destroyed))
    return {"ok": True, "verified": True, "log": log}


@functions_framework.http
def rotate(request):
    body = request.get_json(silent=True) or {}
    d = Deps()
    try:
        res = run(d, force=bool(body.get("force")))
    except Exception as e:  # noqa: BLE001
        res = {"ok": False, "error": str(e)[:80]}
    summary = json.dumps({k: res.get(k) for k in ("verified", "log", "error") if k in res})[:500]
    print(json.dumps({"kms_rotation": summary, "ok": res["ok"]}))
    try:
        d.prod("report", ok=res["ok"], summary=summary)
    except Exception:  # noqa: BLE001
        print(json.dumps({"kms_rotation_report": "failed"}))
    return (json.dumps({"ok": res["ok"]}), 200 if res["ok"] else 500, {"content-type": "application/json"})

import datetime as dt
import unittest

import main

NOW = dt.datetime(2027, 1, 30, tzinfo=dt.timezone.utc)
KEYPATH = main.KEY


def st(used=True, mode="enforce", match=True, state="ok"):
    return {"mode": mode, "state": state, "keys": [{"name": n, "wrapped": True, "usedPrimary": used, "match": match, "source": "kms"} for n in main.NAMES]}


class Fake(main.Deps):
    def __init__(self, statuses, versions, wrap_ok=True, primary_created="2027-01-23T10:00:00Z"):
        self.statuses = list(statuses); self.versions = versions; self.wrap_ok = wrap_ok
        self.calls = []; self.destroyed = []; self.env = {}; self.pc = primary_created

    def prod(self, action, **kw):
        self.calls.append(action)
        if action == "status":
            return {"status": self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]}
        if action == "wrap":
            return {"ok": self.wrap_ok, "wrapped": [{"name": n, "ciphertext": "CT" + n} for n in main.NAMES]}
        return {}

    def gcp(self, method, path, body=None):
        if path == KEYPATH:
            return {"primary": {"name": KEYPATH + "/cryptoKeyVersions/2", "createTime": self.pc}}
        if path.endswith(":destroy"):
            self.destroyed.append(path); return {}
        return {"cryptoKeyVersions": self.versions}

    def vercel_token(self): return "t"

    def vercel(self, method, path, body=None):
        if "/env" in path: self.env[body["key"]] = body; return {}
        if path.startswith("/v9/projects"): return {"name": "nurawell"}
        if path.startswith("/v6/deployments"): return {"deployments": [{"uid": "d1"}]}
        if method == "POST": return {"id": "d2"}
        return {"readyState": "READY"}

    def sleep(self, s): pass


V1 = {"name": KEYPATH + "/cryptoKeyVersions/1", "createTime": "2026-10-20T18:31:59.407792127Z"}
V2 = {"name": KEYPATH + "/cryptoKeyVersions/2", "createTime": "2027-01-23T10:00:00Z"}


class T(unittest.TestCase):
    def test_nothing_to_do_when_all_on_primary(self):
        f = Fake([st()], [V2])
        r = main.run(f, now=NOW)
        self.assertTrue(r["ok"]); self.assertNotIn("wrap", f.calls); self.assertEqual(f.destroyed, [])

    def test_rotation_rewraps_verifies_then_destroys_old(self):
        f = Fake([st(used=False), st()], [V1, V2])
        r = main.run(f, now=NOW)
        self.assertTrue(r["verified"]); self.assertEqual(len(f.env), 5)
        self.assertTrue(all(v["type"] == "sensitive" and v["target"] == ["production"] for v in f.env.values()))
        self.assertEqual(f.destroyed, [V1["name"] + ":destroy"])

    def test_no_destroy_if_verify_fails(self):
        f = Fake([st(used=False), st(match=False)], [V1, V2])
        with self.assertRaises(RuntimeError): main.run(f, now=NOW)
        self.assertEqual(f.destroyed, [])

    def test_no_destroy_while_primary_young(self):
        f = Fake([st(used=False), st()], [V1, V2], primary_created="2027-01-30T00:00:00Z")
        main.run(f, now=NOW)
        self.assertEqual(f.destroyed, [])

    def test_incomplete_wrap_writes_nothing(self):
        f = Fake([st(used=False)], [V1, V2], wrap_ok=False)
        with self.assertRaises(RuntimeError): main.run(f, now=NOW)
        self.assertEqual(f.env, {}); self.assertEqual(f.destroyed, [])

    def test_off_mode_never_destroys(self):
        f = Fake([st(used=None, mode="off", state="idle")], [V1, V2])
        r = main.run(f, force=True, now=NOW)
        self.assertFalse(r["verified"]); self.assertEqual(f.destroyed, [])

    def test_unverified_state_without_rewrap_never_destroys(self):
        f = Fake([st(state="fallback")], [V1, V2])
        main.run(f, now=NOW); self.assertEqual(f.destroyed, [])


if __name__ == "__main__":
    unittest.main()

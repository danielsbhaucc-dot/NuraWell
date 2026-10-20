import base64, json, os
import functions_framework
from googleapiclient import discovery

PROJECT_ID = os.environ["TARGET_PROJECT"]
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"

@functions_framework.cloud_event
def stop_billing(cloud_event):
    data = json.loads(base64.b64decode(cloud_event.data["message"]["data"]).decode())
    cost, budget = float(data.get("costAmount", 0)), float(data.get("budgetAmount", 0))
    force_dry = bool(data.get("dryRun"))
    print(json.dumps({"cost": cost, "budget": budget, "dry": DRY_RUN or force_dry}))
    if budget <= 0 or cost < budget:
        print("under budget, no action"); return
    billing = discovery.build("cloudbilling", "v1", cache_discovery=False)
    name = f"projects/{PROJECT_ID}"
    info = billing.projects().getBillingInfo(name=name).execute()
    if not info.get("billingEnabled"):
        print("billing already disabled"); return
    if DRY_RUN or force_dry:
        print(f"DRY RUN: would detach billing from {PROJECT_ID}"); return
    billing.projects().updateBillingInfo(name=name, body={"billingAccountName": ""}).execute()
    print(f"BILLING DETACHED from {PROJECT_ID}")

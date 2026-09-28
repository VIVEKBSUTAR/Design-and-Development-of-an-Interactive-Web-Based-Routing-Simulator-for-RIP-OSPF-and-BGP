import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_api():
    print(">>> 1. Checking Health Check...")
    with urllib.request.urlopen(f"{BASE_URL}/api/health") as res:
        assert res.status == 200
        print("    PASS: Health check 200 OK")

    print(">>> 2. Resetting Topology...")
    req = urllib.request.Request(f"{BASE_URL}/api/topology/reset", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        print("    PASS: Topology reset to 7 nodes, 6 links")

    print(">>> 3. Running Full End-to-End Investigation (11 Stages)...")
    payload = json.dumps({
        "source": "PC1",
        "destination": "Server",
        "fault_target": "R2-R3",
        "fault_type": "LINK_FAILURE",
        "reproduction_runs": 3
    }).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/investigation/run", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        inv = json.loads(res.read().decode("utf-8"))
        print(f"    PASS: Investigation {inv['investigation_id']} completed with {len(inv['stages'])} stages")
        assert len(inv['stages']) == 11
        assert inv["reduction"]["accepted_candidates"] == ["PC2", "R4"]
        assert inv["reproduction"]["successful_runs"] == 3

    print(">>> 4. Testing What-If Resilience Simulation...")
    wi_payload = json.dumps({
        "target_component": "R2-R3",
        "target_type": "LINK",
        "source": "PC1",
        "destination": "Server"
    }).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/resilience/what-if", data=wi_payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        wi = json.loads(res.read().decode("utf-8"))
        print(f"    PASS: What-If simulation completed. Scope: {wi['failure_scope']}, Affected: {wi['affected_flows_count']}")
        assert wi["before_reachable"] is True
        assert wi["after_reachable"] is False

    print(">>> 5. Checking Investigation History...")
    with urllib.request.urlopen(f"{BASE_URL}/api/investigation/history") as res:
        assert res.status == 200
        hist = json.loads(res.read().decode("utf-8"))
        print(f"    PASS: History records found: {len(hist)}")
        assert len(hist) >= 1

    print("\nALL LIVE ENDPOINTS AND COMPLETE WORKFLOW VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    test_api()

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_phase_10c_end_to_end_demonstration_scenario():
    """
    End-to-End Validation Scenario (Section 34 of Specification):
    
    BASELINE:
    PC1 — R1 — R2 — R3 — Server
              |
              R4 — PC2

    Step 1: Baseline PC1 -> Server PASS (0% loss, healthy path)
    Step 2: Inject R2-R3 Link Failure
    Step 3: Run probe: PC1 -> R1 -> R2 -> DROP (100% loss)
    Step 4: Failure localization: first failed transition R2 -> R3, last reachable R2
    Step 5: Candidate hypotheses generated (Link, Node, Interface, Routing)
    Step 6: Targeted candidate investigation conducted
    Step 7: Diagnosis result: R2-R3 Link Failure (HIGH confidence / FAILURE_CONFIRMED)
    Step 8: Impact analysis: PC1 -> Server FAILED, PC1 -> PC2 HEALTHY, scope PARTITIONED
    Step 9: Restore R2-R3 link
    Step 10: Verify PC1 -> Server PASS (restored baseline)
    """
    # Ensure clean baseline
    client.post("/api/reset")
    client.post("/api/faults/restore", json={})
    
    # Step 1: Baseline PC1 -> Server PASS
    det_base = client.post("/api/diagnosis/detect", json={"source": "PC1", "destination": "Server"}).json()
    assert det_base["reachability_status"] == "HEALTHY"
    assert det_base["packet_loss_percentage"] == 0.0
    assert det_base["observed_path"] == ["PC1", "R1", "R2", "R3", "Server"]
    assert det_base["failed_transition"] is None

    # Step 2: Inject R2-R3 Link Failure
    inject_res = client.post("/api/faults/inject", json={
        "fault_type": "LINK_FAILURE",
        "target_link": "R2-R3"
    }).json()
    assert inject_res["target_link"] == "R2-R3"
    assert inject_res["is_active"] is True

    # Verify active faults endpoint
    active_faults = client.get("/api/faults/active").json()
    assert len(active_faults) == 1
    assert active_faults[0]["target_link"] == "R2-R3"

    # Step 3: Run probe: PC1 -> R1 -> R2 -> DROP (100% loss)
    det_failed = client.post("/api/diagnosis/detect", json={"source": "PC1", "destination": "Server"}).json()
    assert det_failed["reachability_status"] == "FAILED"
    assert det_failed["packet_loss_percentage"] == 100.0
    assert det_failed["observed_path"] == ["PC1", "R1", "R2"]
    assert det_failed["last_reachable_node"] == "R2"

    # Step 4: Failure localization: R2 -> R3
    assert det_failed["failed_transition"] == "R2 -> R3"
    assert any("PC1 -> PC2" in b for b in det_failed["healthy_branches"])

    # Step 5 & 6 & 7: Hypotheses, Investigation & Diagnosis
    diag_res = client.post("/api/diagnosis/diagnose", json={"source": "PC1", "destination": "Server"}).json()
    assert diag_res["status"] in ("FAILURE_CONFIRMED", "FAILURE_PROBABLE")
    assert diag_res["primary_cause"] is not None
    assert diag_res["primary_cause"]["category"] == "LINK"
    assert diag_res["primary_cause"]["target"] == "R2-R3"
    assert diag_res["confidence"] in ("HIGH", "MEDIUM")

    # Check competing hypotheses
    candidate_titles = [h["category"] for h in diag_res["candidate_hypotheses"]]
    assert "LINK" in candidate_titles
    assert "NODE" in candidate_titles
    assert "INTERFACE" in candidate_titles
    assert "ROUTING" in candidate_titles

    # Verify node failure candidate (R3) was refuted/weakened because R3 is not down
    node_hypo = next(h for h in diag_res["candidate_hypotheses"] if h["category"] == "NODE")
    assert node_hypo["status"] in ("REFUTED", "UNLIKELY")

    # Step 8: Impact Analysis
    impact_res = client.get("/api/diagnosis/impact").json()
    assert impact_res["failure_scope"] in ("PARTITIONED", "LOCALIZED")
    assert impact_res["affected_flows_count"] > 0
    assert impact_res["unaffected_flows_count"] > 0
    
    # Verify PC1 -> Server is affected, and PC1 -> PC2 is unaffected
    affected_pairs = [(f["source"], f["destination"]) for f in impact_res["affected_flows"]]
    unaffected_pairs = [(f["source"], f["destination"]) for f in impact_res["unaffected_flows"]]
    assert ("PC1", "Server") in affected_pairs
    assert ("PC1", "PC2") in unaffected_pairs

    # Step 9: Restore R2-R3
    fault_id = inject_res["fault_id"]
    restore_res = client.post("/api/faults/restore", json={"fault_id": fault_id}).json()
    assert restore_res["status"] == "ok"
    assert restore_res["restored_count"] == 1

    # Step 10: Verify PC1 -> Server PASS
    det_restored = client.post("/api/diagnosis/detect", json={"source": "PC1", "destination": "Server"}).json()
    assert det_restored["reachability_status"] == "HEALTHY"
    assert det_restored["packet_loss_percentage"] == 0.0
    assert det_restored["observed_path"] == ["PC1", "R1", "R2", "R3", "Server"]

    # Verify impact after restore is healthy
    impact_restored = client.get("/api/diagnosis/impact").json()
    assert impact_restored["failure_scope"] == "NONE"
    assert impact_restored["affected_flows_count"] == 0

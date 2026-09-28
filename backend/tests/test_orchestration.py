"""
Unit and integration tests for Module 2: Intelligent Network Testing & Test Orchestration.
Verifies all 6 test library implementations, deterministic NextTestSelector rules,
campaign orchestration, automated vs manual execution, failure handoff, and API routes.
"""

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    topology_engine,
    probe_simulator,
    test_library,
    test_selector,
    campaign_orchestrator,
)
from orchestration.models import (
    TestStatus,
    TestCategory,
    CampaignStatus,
    StartCampaignRequest,
    ExecuteStepRequest,
)


@pytest.fixture(autouse=True)
def reset_network_and_orchestrator():
    """Ensure every test starts with clean 7-node baseline and fresh orchestrator state."""
    topology_engine.reset()
    campaign_orchestrator._campaigns.clear()


client = TestClient(app)


# -----------------------------------------------------------------------------
# 1. Test Library Unit Tests
# -----------------------------------------------------------------------------

def test_library_contains_six_core_tests():
    """Verify library registers all 6 core network tests."""
    tests = test_library.list_tests()
    test_ids = [t.test_id for t in tests]
    assert len(tests) >= 6
    assert "baseline_connectivity" in test_ids
    assert "primary_path" in test_ids
    assert "neighbor_investigation" in test_ids
    assert "branch_isolation" in test_ids
    assert "alternate_path" in test_ids
    assert "recovery" in test_ids


def test_baseline_connectivity_execution_healthy():
    """Verify baseline connectivity on clean topology produces 0% packet loss."""
    res = test_library.execute_test("baseline_connectivity", "PC1", "Server")
    assert res.test_id == "baseline_connectivity"
    assert res.status == TestStatus.PASSED
    assert not res.failure_detected
    assert res.simulation_result is not None
    assert res.simulation_result.packet_loss_percentage == 0.0
    assert res.nominal_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert len(res.observations) > 0


def test_primary_path_execution_healthy():
    """Verify primary path analysis resolves active forwarding hops."""
    res = test_library.execute_test("primary_path", "PC1", "Server")
    assert res.test_id == "primary_path"
    assert res.status == TestStatus.PASSED
    assert not res.failure_detected
    assert res.observed_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert any("Active forwarding path" in obs for obs in res.observations)


def test_neighbor_investigation_on_healthy_and_failed_link():
    """Verify neighbor investigation audits adjacent interfaces on router R2."""
    # Healthy router audit
    res_healthy = test_library.execute_test("neighbor_investigation", "PC1", "Server", parameters={"target_node": "R2"})
    assert res_healthy.status == TestStatus.PASSED
    assert not res_healthy.failure_detected
    assert any("Audited router 'R2'" in obs for obs in res_healthy.observations)

    # Fail R2-R3 link and re-audit
    topology_engine.fail_link("R2", "R3")
    res_failed = test_library.execute_test("neighbor_investigation", "PC1", "Server", parameters={"target_node": "R2"})
    assert res_failed.failure_detected
    assert res_failed.drop_link == "R2-R3"
    assert any("R2-R3" in obs for obs in res_failed.observations)


def test_branch_isolation_unaffected_branch():
    """Verify branch isolation confirms PC1 -> PC2 remains healthy even when R2-R3 fails."""
    topology_engine.fail_link("R2", "R3")
    res = test_library.execute_test("branch_isolation", "PC1", "Server", parameters={"branch_dest": "PC2"})
    assert res.status == TestStatus.PASSED
    assert not res.failure_detected
    assert res.observed_path == ["PC1", "R1", "R2", "R4", "PC2"]
    assert any("BRANCH ISOLATED & HEALTHY" in obs for obs in res.observations)


def test_alternate_path_analysis_single_path_detection():
    """Verify alternate path detection identifies single-point-of-failure topology."""
    res = test_library.execute_test("alternate_path", "PC1", "Server")
    assert res.status == TestStatus.PASSED
    assert res.failure_detected is False  # Path exists, so reachability is not failed
    assert any("SINGLE POINT OF FAILURE" in obs for obs in res.observations)


def test_recovery_verification():
    """Verify recovery test confirms restoration after link is re-enabled."""
    topology_engine.fail_link("R2", "R3")
    res_fail = test_library.execute_test("recovery", "PC1", "Server")
    assert res_fail.status == TestStatus.FAILED
    assert res_fail.failure_detected is True

    # Restore link
    topology_engine.restore_link("R2", "R3")
    res_pass = test_library.execute_test("recovery", "PC1", "Server")
    assert res_pass.status == TestStatus.PASSED
    assert res_pass.failure_detected is False
    assert any("RECOVERY CONFIRMED" in obs for obs in res_pass.observations)


def test_invalid_test_id_handling():
    """Verify executing nonexistent test raises ValueError."""
    with pytest.raises(ValueError, match="Unknown test ID"):
        test_library.execute_test("nonexistent_test", "PC1", "Server")


# -----------------------------------------------------------------------------
# 2. NextTestSelector Deterministic Decision Engine
# -----------------------------------------------------------------------------

def test_selector_initial_decision():
    """Verify initial recommendation is always Baseline Connectivity with rationale."""
    decision = test_selector.select_next_test(
        current_result=None,
        all_executed_tests=[],
        source="PC1",
        destination="Server",
    )
    assert decision is not None
    assert decision.test_id == "baseline_connectivity"
    assert decision.category == TestCategory.CONNECTIVITY
    assert "baseline end-to-end packet delivery" in decision.reason
    assert len(decision.evidence) > 0


def test_selector_progression_healthy_baseline():
    """Verify healthy progression: Baseline -> Primary Path -> Alternate Path -> Completion."""
    # Step 1: Run baseline
    t1 = test_library.execute_test("baseline_connectivity", "PC1", "Server")
    d1 = test_selector.select_next_test(t1, [t1], "PC1", "Server")
    assert d1 is not None
    assert d1.test_id == "primary_path"
    assert "0% packet loss" in d1.evidence[0]

    # Step 2: Run primary path
    t2 = test_library.execute_test("primary_path", "PC1", "Server")
    d2 = test_selector.select_next_test(t2, [t1, t2], "PC1", "Server")
    assert d2 is not None
    assert d2.test_id == "alternate_path"

    # Step 3: Run alternate path
    t3 = test_library.execute_test("alternate_path", "PC1", "Server")
    d3 = test_selector.select_next_test(t3, [t1, t2, t3], "PC1", "Server")
    assert d3 is None  # Healthy campaign completed


def test_selector_failure_investigation_rules():
    """Verify failure progression: Probe drop at R2 -> Neighbor Investigation -> Branch Isolation -> Alternate Path."""
    topology_engine.fail_link("R2", "R3")

    # Step 1: Baseline fails
    t1 = test_library.execute_test("baseline_connectivity", "PC1", "Server")
    assert t1.status == TestStatus.FAILED

    # Next decision MUST be neighbor investigation at R2
    d1 = test_selector.select_next_test(t1, [t1], "PC1", "Server")
    assert d1 is not None
    assert d1.test_id == "neighbor_investigation"
    assert d1.parameters["target_node"] == "R2"
    assert "router 'R2'" in d1.reason

    # Step 2: Neighbor investigation confirms R2-R3 down
    t2 = test_library.execute_test("neighbor_investigation", "PC1", "Server", parameters=d1.parameters)
    d2 = test_selector.select_next_test(t2, [t1, t2], "PC1", "Server")
    assert d2 is not None
    assert d2.test_id == "branch_isolation"
    assert d2.target_destination == "PC2"
    assert "branch to 'PC2'" in d2.evidence[2]

    # Step 3: Branch isolation confirms PC1 -> PC2 healthy
    t3 = test_library.execute_test("branch_isolation", "PC1", "Server", parameters=d2.parameters)
    assert t3.status == TestStatus.PASSED

    d3 = test_selector.select_next_test(t3, [t1, t2, t3], "PC1", "Server")
    assert d3 is not None
    assert d3.test_id == "alternate_path"

    # Step 4: Alternate path analysis confirms no bypass
    t4 = test_library.execute_test("alternate_path", "PC1", "Server")
    d4 = test_selector.select_next_test(t4, [t1, t2, t3, t4], "PC1", "Server")
    assert d4 is None  # Complete investigation; ready for diagnosis handoff


# -----------------------------------------------------------------------------
# 3. Campaign Orchestrator & API Integration Tests
# -----------------------------------------------------------------------------

def test_api_test_library_endpoint():
    """Verify GET /api/orchestration/library returns all registered tests."""
    res = client.get("/api/orchestration/library")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 6
    ids = [d["test_id"] for d in data]
    assert "baseline_connectivity" in ids
    assert "branch_isolation" in ids


def test_api_create_and_start_campaign():
    """Verify POST /api/orchestration/campaigns initializes a campaign."""
    res = client.post(
        "/api/orchestration/campaigns",
        json={"name": "Test Run", "source": "PC1", "destination": "Server", "mode": "automated"},
    )
    assert res.status_code == 200
    camp = res.json()
    assert camp["id"].startswith("cmp-")
    assert camp["status"] == "NOT_STARTED"
    assert camp["next_test_recommendation"]["test_id"] == "baseline_connectivity"


def test_automated_campaign_step_execution():
    """Verify sequential automated execution of campaign steps via API."""
    # 1. Create campaign
    res = client.post(
        "/api/orchestration/campaigns",
        json={"name": "Auto Campaign", "source": "PC1", "destination": "Server", "mode": "automated"},
    )
    cid = res.json()["id"]

    # 2. Step 1 (Executes baseline connectivity)
    s1 = client.post(f"/api/orchestration/campaigns/{cid}/step", json={})
    assert s1.status_code == 200
    camp1 = s1.json()
    assert len(camp1["executed_tests"]) == 1
    assert camp1["executed_tests"][0]["test_id"] == "baseline_connectivity"
    assert camp1["executed_tests"][0]["status"] == "PASSED"
    assert camp1["next_test_recommendation"]["test_id"] == "primary_path"

    # 3. Step 2 (Executes primary path)
    s2 = client.post(f"/api/orchestration/campaigns/{cid}/step", json={})
    assert s2.status_code == 200
    camp2 = s2.json()
    assert len(camp2["executed_tests"]) == 2
    assert camp2["executed_tests"][1]["test_id"] == "primary_path"
    assert camp2["executed_tests"][1]["status"] == "PASSED"


def test_manual_mode_override_execution():
    """Verify manual override allows user to execute any specific test from the library."""
    res = client.post(
        "/api/orchestration/campaigns",
        json={"name": "Manual Run", "source": "PC1", "destination": "Server", "mode": "manual"},
    )
    cid = res.json()["id"]

    # Manually execute branch isolation directly
    step = client.post(
        f"/api/orchestration/campaigns/{cid}/step",
        json={"test_id": "branch_isolation", "parameters": {"branch_dest": "PC2"}},
    )
    assert step.status_code == 200
    camp = step.json()
    assert len(camp["executed_tests"]) == 1
    assert camp["executed_tests"][0]["test_id"] == "branch_isolation"
    assert camp["executed_tests"][0]["status"] == "PASSED"


def test_campaign_reset_endpoint():
    """Verify POST /api/orchestration/campaigns/{id}/reset clears executed tests."""
    res = client.post("/api/orchestration/campaigns", json={})
    cid = res.json()["id"]

    # Run step 1
    client.post(f"/api/orchestration/campaigns/{cid}/step", json={})

    # Reset
    reset_res = client.post(f"/api/orchestration/campaigns/{cid}/reset")
    assert reset_res.status_code == 200
    camp = reset_res.json()
    assert len(camp["executed_tests"]) == 0
    assert camp["status"] == "NOT_STARTED"
    assert camp["next_test_recommendation"]["test_id"] == "baseline_connectivity"


def test_failure_investigation_and_structured_handoff():
    """
    Complete end-to-end Module 2 demonstration scenario:
    1. Cut link R2-R3.
    2. Start automated campaign.
    3. Step 1: Baseline connectivity fails at R2.
    4. Step 2: System selects & executes Neighbor Investigation -> confirms R2-R3 down.
    5. Step 3: System selects & executes Branch Isolation -> confirms PC1 -> PC2 healthy.
    6. System compiles structured FailureHandoff ready for Module 3/4.
    """
    topology_engine.fail_link("R2", "R3")

    # Create campaign
    create_res = client.post(
        "/api/orchestration/campaigns",
        json={"name": "R2-R3 Failure Investigation", "source": "PC1", "destination": "Server", "mode": "automated"},
    )
    cid = create_res.json()["id"]

    # Step 1: Baseline Connectivity
    res1 = client.post(f"/api/orchestration/campaigns/{cid}/step", json={}).json()
    assert res1["executed_tests"][0]["status"] == "FAILED"
    assert res1["next_test_recommendation"]["test_id"] == "neighbor_investigation"

    # Step 2: Neighbor Investigation
    res2 = client.post(f"/api/orchestration/campaigns/{cid}/step", json={}).json()
    assert res2["executed_tests"][1]["test_id"] == "neighbor_investigation"
    assert res2["next_test_recommendation"]["test_id"] == "branch_isolation"

    # Step 3: Branch Isolation
    res3 = client.post(f"/api/orchestration/campaigns/{cid}/step", json={}).json()
    assert res3["executed_tests"][2]["test_id"] == "branch_isolation"
    assert res3["executed_tests"][2]["status"] == "PASSED"

    # Step 4: Alternate Path
    res4 = client.post(f"/api/orchestration/campaigns/{cid}/step", json={}).json()
    assert res4["executed_tests"][3]["test_id"] == "alternate_path"

    # Check failure handoff
    handoff_res = client.get(f"/api/orchestration/campaigns/{cid}/handoff")
    assert handoff_res.status_code == 200
    handoff = handoff_res.json()
    assert handoff is not None
    assert handoff["failure_detected"] is True
    assert handoff["drop_node"] == "R2"
    assert handoff["drop_link"] == "R2-R3"
    assert handoff["ready_for_diagnosis"] is True
    assert any("PC2" in b for b in handoff["isolated_healthy_branches"])
    assert len(handoff["evidence"]) >= 3

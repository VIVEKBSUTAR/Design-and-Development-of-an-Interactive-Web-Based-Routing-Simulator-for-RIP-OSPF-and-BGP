"""
Comprehensive test suite for Module 3: Fault Injection, Failure Localization & Diagnosis.
Tests:
- Fault injection: Link, Node, Interface, Invalid targets, Active tracking, Safe restoration.
- Failure observation: Probe simulation, drop transitions, packet loss %, surviving branches.
- Localization: Boundary isolation, last reachable node, suspected components.
- Hypothesis engine: Competing hypotheses (Link vs Node vs Interface vs Routing).
- Diagnosis engine: Targeted investigation, evidence scoring, confirmed causes, ambiguity handling.
- Impact analysis: Blast radius, affected flows, unaffected flows, failure scope.
- Integration: Module 1 dependency integration, Module 2 FailureHandoff integration.
- REST API: End-to-end API endpoint validation.
"""

import pytest
from fastapi.testclient import TestClient

from main import (
    app,
    topology_engine,
    fault_engine,
    observation_engine,
    localization_engine,
    hypothesis_engine,
    impact_engine,
    diagnosis_engine,
)
from diagnosis.models import (
    FaultType,
    FaultInjectionRequest,
    FaultRestoreRequest,
    DiagnosisStatus,
    FailureScope,
)
from orchestration.models import FailureHandoff


@pytest.fixture(autouse=True)
def clean_topology_and_faults():
    """Reset topology and faults before every test."""
    fault_engine.restore_all_faults()
    topology_engine.reset()


client = TestClient(app)


# =============================================================================
# 1. FAULT INJECTION ENGINE TESTS
# =============================================================================

def test_fault_injection_link_failure():
    """Verify injecting a link failure marks link as down and tracks scenario."""
    req = FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3")
    scenario = fault_engine.inject_fault(req)

    assert scenario.fault_type == FaultType.LINK_FAILURE
    assert scenario.target_link == "R2-R3"
    assert scenario.is_active is True
    assert topology_engine.get_link_status("R2", "R3") == "down"

    active = fault_engine.get_active_faults()
    assert len(active) == 1
    assert active[0].fault_id == scenario.fault_id


def test_fault_injection_node_failure():
    """Verify injecting a node failure powers off node and tracks scenario."""
    req = FaultInjectionRequest(fault_type=FaultType.NODE_FAILURE, target_node="R3")
    scenario = fault_engine.inject_fault(req)

    assert scenario.fault_type == FaultType.NODE_FAILURE
    assert scenario.target_node == "R3"
    assert topology_engine.get_node_status("R3") == "down"
    assert not topology_engine.has_path("PC1", "Server")


def test_fault_injection_interface_failure():
    """Verify injecting an interface failure disables interface on target node."""
    req = FaultInjectionRequest(
        fault_type=FaultType.INTERFACE_FAILURE,
        target_interface_node="R3",
        target_interface_remote="R2",
    )
    scenario = fault_engine.inject_fault(req)

    assert scenario.fault_type == FaultType.INTERFACE_FAILURE
    assert topology_engine.get_interface_status("R3", "R2") == "down"
    # Physical link carrier may still be reported as up
    assert topology_engine.get_link_status("R2", "R3") == "up"
    # But reachability across that interface is blocked
    assert not topology_engine.has_path("PC1", "Server")


def test_fault_restoration_specific():
    """Verify restoring a specific active fault returns component to healthy."""
    req = FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3")
    scenario = fault_engine.inject_fault(req)

    success = fault_engine.restore_fault(scenario.fault_id)
    assert success is True
    assert topology_engine.get_link_status("R2", "R3") == "up"
    assert len(fault_engine.get_active_faults()) == 0


def test_fault_restoration_all():
    """Verify restore_all_faults clears all injected faults."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3"))
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.NODE_FAILURE, target_node="R4"))
    assert len(fault_engine.get_active_faults()) == 2

    restored = fault_engine.restore_all_faults()
    assert restored == 2
    assert len(fault_engine.get_active_faults()) == 0
    assert topology_engine.get_link_status("R2", "R3") == "up"
    assert topology_engine.get_node_status("R4") == "up"


def test_fault_injection_invalid_target():
    """Verify invalid targets raise ValueError."""
    with pytest.raises(ValueError):
        fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="PC1-NONEXISTENT"))

    with pytest.raises(ValueError):
        fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.NODE_FAILURE, target_node="UNKNOWN_NODE"))


# =============================================================================
# 2. FAILURE OBSERVATION & LOCALIZATION TESTS
# =============================================================================

def test_observation_healthy_baseline():
    """Verify healthy baseline produces 0% loss and full path in observation."""
    obs = observation_engine.observe_flow("PC1", "Server")
    assert obs.reachability_status == "HEALTHY"
    assert obs.packet_loss_percentage == 0.0
    assert obs.observed_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert obs.failed_transition is None


def test_observation_after_link_failure():
    """Verify probe observation after R2-R3 link failure detects drop at R2."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3"))

    obs = observation_engine.observe_flow("PC1", "Server")
    assert obs.reachability_status == "FAILED"
    assert obs.packet_loss_percentage == 100.0
    assert obs.last_reachable_node == "R2"
    assert obs.failed_transition == "R2 -> R3"
    assert obs.failed_link == "R2-R3"
    assert "PC1 -> PC2 (REACHABLE)" in obs.healthy_branches


def test_localization_link_failure():
    """Verify localization engine isolates first failed transition and suspect components."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3"))
    obs = observation_engine.observe_flow("PC1", "Server")
    loc = localization_engine.localize(obs)

    assert loc.last_reachable_node == "R2"
    assert loc.first_failed_transition == "R2 -> R3"
    assert loc.suspected_link == "R2-R3"
    assert loc.suspected_node == "R3"
    assert "Link R2-R3" in loc.candidate_components


# =============================================================================
# 3. HYPOTHESIS & DIAGNOSIS ENGINE TESTS
# =============================================================================

def test_hypothesis_generation():
    """Verify hypothesis engine generates competing Link, Interface, Node, and Routing causes."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3"))
    obs = observation_engine.observe_flow("PC1", "Server")
    loc = localization_engine.localize(obs)
    hypotheses = hypothesis_engine.generate_hypotheses(obs, loc)

    categories = [h.category for h in hypotheses]
    assert "LINK" in categories
    assert "INTERFACE" in categories
    assert "NODE" in categories
    assert "ROUTING" in categories


def test_diagnosis_confirmed_link_failure():
    """Verify diagnosis correctly deduces Link Failure on R2-R3 via evidence scoring."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3"))
    diag = diagnosis_engine.diagnose("PC1", "Server")

    assert diag.status == DiagnosisStatus.FAILURE_CONFIRMED
    assert diag.primary_cause is not None
    assert diag.primary_cause.category == "LINK"
    assert "R2-R3" in diag.primary_cause.target
    assert diag.confidence == "HIGH"
    assert any("DOWN" in ev for ev in diag.supporting_evidence)


def test_diagnosis_confirmed_node_failure():
    """Verify diagnosis correctly deduces Node Failure when router R3 is powered down."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.NODE_FAILURE, target_node="R3"))
    diag = diagnosis_engine.diagnose("PC1", "Server")

    assert diag.status == DiagnosisStatus.FAILURE_CONFIRMED
    assert diag.primary_cause is not None
    assert diag.primary_cause.category == "NODE"
    assert diag.primary_cause.target == "R3"
    assert diag.confidence == "HIGH"


def test_diagnosis_confirmed_interface_failure():
    """Verify diagnosis distinguishes interface failure from cable failure."""
    fault_engine.inject_fault(
        FaultInjectionRequest(
            fault_type=FaultType.INTERFACE_FAILURE,
            target_interface_node="R3",
            target_interface_remote="R2",
        )
    )
    diag = diagnosis_engine.diagnose("PC1", "Server")

    assert diag.status == DiagnosisStatus.FAILURE_CONFIRMED
    assert diag.primary_cause is not None
    assert diag.primary_cause.category == "INTERFACE"
    assert "R3" in diag.primary_cause.target


def test_diagnosis_from_failure_handoff():
    """Verify diagnosis engine consumes Module 2 FailureHandoff seamlessly."""
    handoff = FailureHandoff(
        failure_detected=True,
        symptom="100% loss",
        source="PC1",
        destination="Server",
        observed_path=["PC1", "R1", "R2"],
        drop_node="R2",
        drop_link="R2-R3",
        drop_reason="Link R2-R3 between R2 and R3 is DOWN",
        packet_loss_percentage=100.0,
        affected_components=["R2-R3"],
        isolated_healthy_branches=["PC1 -> PC2"],
        evidence=["Drop at R2"],
    )

    # In topology, fail link
    topology_engine.fail_link("R2", "R3")
    diag = diagnosis_engine.diagnose_from_handoff(handoff)

    assert diag.status == DiagnosisStatus.FAILURE_CONFIRMED
    assert diag.primary_cause.category == "LINK"


# =============================================================================
# 4. IMPACT ANALYSIS ENGINE TESTS
# =============================================================================

def test_impact_analysis_healthy():
    """Verify 0 affected flows on healthy network."""
    impact = impact_engine.analyze_impact()
    assert impact.failure_scope == FailureScope.NONE
    assert impact.affected_flows_count == 0
    assert impact.unaffected_flows_count > 0


def test_impact_analysis_r2_r3_cut():
    """Verify R2-R3 link cut severs Server flows while preserving PC1-PC2 branch."""
    fault_engine.inject_fault(FaultInjectionRequest(fault_type=FaultType.LINK_FAILURE, target_link="R2-R3"))
    impact = impact_engine.analyze_impact(suspected_components=["R2-R3"])

    assert impact.failure_scope in (FailureScope.PARTITIONED, FailureScope.LOCALIZED)
    assert impact.affected_flows_count > 0

    # PC1 -> Server must be in affected flows
    affected_pairs = [(f.source, f.destination) for f in impact.affected_flows]
    assert ("PC1", "Server") in affected_pairs

    # PC1 -> PC2 must be in unaffected flows
    unaffected_pairs = [(f.source, f.destination) for f in impact.unaffected_flows]
    assert ("PC1", "PC2") in unaffected_pairs


# =============================================================================
# 5. REST API ENDPOINT TESTS
# =============================================================================

def test_api_fault_injection_and_restore():
    """Test POST /api/faults/inject and POST /api/faults/restore endpoints."""
    # 1. Inject
    inj_res = client.post(
        "/api/faults/inject",
        json={"fault_type": "LINK_FAILURE", "target_link": "R2-R3"},
    )
    assert inj_res.status_code == 200
    inj_data = inj_res.json()
    fault_id = inj_data["fault_id"]

    # 2. List active
    act_res = client.get("/api/faults/active")
    assert act_res.status_code == 200
    assert len(act_res.json()) == 1

    # 3. Detect failure
    det_res = client.post(
        "/api/diagnosis/detect",
        json={"source": "PC1", "destination": "Server", "probe_count": 2},
    )
    assert det_res.status_code == 200
    assert det_res.json()["reachability_status"] == "FAILED"

    # 4. Diagnose
    diag_res = client.post(
        "/api/diagnosis/diagnose",
        json={"source": "PC1", "destination": "Server"},
    )
    assert diag_res.status_code == 200
    assert diag_res.json()["status"] == "FAILURE_CONFIRMED"

    # 5. Impact
    imp_res = client.get("/api/diagnosis/impact")
    assert imp_res.status_code == 200
    assert imp_res.json()["affected_flows_count"] > 0

    # 6. Restore
    rest_res = client.post("/api/faults/restore", json={"fault_id": fault_id})
    assert rest_res.status_code == 200
    assert rest_res.json()["restored_count"] == 1

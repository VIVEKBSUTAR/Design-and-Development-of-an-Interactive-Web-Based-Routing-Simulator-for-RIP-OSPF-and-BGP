import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from main import app, topology_engine, what_if_engine, investigation_engine

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_topology():
    client.post("/api/reset")
    client.post("/api/faults/restore", json={})


def test_1_failure_signature_generation():
    """Verify structured failure signature captures baseline, dropped path, and 100% loss."""
    # Healthy baseline: no signature
    res = client.get("/api/failure-signature?source=PC1&destination=Server").json()
    assert res["active"] is False

    # Inject R2-R3 link failure
    client.post("/api/faults/inject", json={"fault_type": "LINK_FAILURE", "target_link": "R2-R3"})

    res_fault = client.get("/api/failure-signature?source=PC1&destination=Server").json()
    assert res_fault["active"] is True
    assert res_fault["packet_loss"] == 100.0
    assert res_fault["failed_component"] in ("R2-R3", "R3-R2")
    assert res_fault["reachable"] is False
    assert res_fault["baseline_path"] == ["PC1", "R1", "R2", "R3", "Server"]


def test_2_causal_dependency_generation():
    """Verify directed causal graph reflects pre-failure connectivity -> fault -> state -> path -> drop."""
    client.post("/api/faults/inject", json={"fault_type": "LINK_FAILURE", "target_link": "R2-R3"})
    res = client.get("/api/causal-dependencies?source=PC1&destination=Server").json()
    assert res["active"] is True
    graph = res["graph"]
    assert graph is not None
    assert len(graph["nodes"]) == 6
    assert len(graph["edges"]) == 5

    node_types = [n["type"] for n in graph["nodes"]]
    assert "PRE_FAILURE_CONNECTIVITY" in node_types
    assert "FAULT" in node_types
    assert "STATE_CHANGE" in node_types
    assert "PATH_CHANGE" in node_types
    assert "REACHABILITY_FAILURE" in node_types
    assert "OBSERVATION" in node_types


def test_3_signature_comparison():
    """Verify signature comparator requires identical baseline and fault behavior."""
    from failure.signature import FailureSignature
    from reduction.reducer import compare_signatures

    sig1 = FailureSignature(
        source="PC1", destination="Server", baseline_path=["PC1", "R1", "R2", "R3", "Server"],
        reachable=False, path=None, packet_loss=100.0, fault_type="LINK_FAILURE",
        failed_component="R2-R3", routing_change=True, link_state="down",
    )
    sig2 = sig1.copy()
    cmp_match = compare_signatures(sig1, sig2)
    assert cmp_match.match is True
    assert len(cmp_match.changed_fields) == 0

    sig3 = sig1.copy(update={"packet_loss": 50.0})
    cmp_mismatch = compare_signatures(sig1, sig3)
    assert cmp_mismatch.match is False
    assert "packet_loss" in cmp_mismatch.changed_fields


def test_4_dependency_comparison():
    """Verify dependency comparator detects missing causal edges or types."""
    from causal.dependency import (
        DependencyGraph, DependencyNode, DependencyEdge,
        DependencyNodeType, DependencyRelationship
    )
    from reduction.reducer import compare_dependencies

    nodes = [
        DependencyNode(id="n1", type=DependencyNodeType.FAULT, label="Fault"),
        DependencyNode(id="n2", type=DependencyNodeType.STATE_CHANGE, label="State"),
    ]
    edges = [DependencyEdge(source="n1", target="n2", relationship=DependencyRelationship.CAUSES)]
    g1 = DependencyGraph(nodes=nodes, edges=edges)
    g2 = DependencyGraph(nodes=nodes, edges=edges)

    cmp_match = compare_dependencies(g1, g2)
    assert cmp_match.match is True

    g3 = DependencyGraph(nodes=nodes, edges=[])
    cmp_mismatch = compare_dependencies(g1, g3)
    assert cmp_mismatch.match is False
    assert len(cmp_mismatch.missing_relationships) > 0


def test_5_reduction_acceptance_inessential_nodes():
    """Verify non-transit nodes (PC2, R4) are accepted for reduction while failure is preserved."""
    res = client.post("/api/reduction/run", json={"candidates": ["PC2", "R4"]}).json()
    assert "PC2" in res["accepted_candidates"]
    assert "R4" in res["accepted_candidates"]
    assert len(res["final_topology"]["nodes"]) == 5
    assert len(res["final_topology"]["links"]) == 4


def test_6_reduction_rejection_essential_transit_nodes():
    """Verify essential transit nodes (R1) are rejected and safely restored."""
    res = client.post("/api/reduction/run", json={"candidates": ["R1"]}).json()
    assert "R1" in res["rejected_candidates"]
    r1_eval = next(e for e in res["candidate_evaluations"] if e["candidate"] == "R1")
    assert r1_eval["status"] == "REJECTED"
    assert r1_eval["signature_match"] is False
    assert len(res["final_topology"]["nodes"]) == 7


def test_7_reproduction_run_3_trials():
    """Verify 3-run deterministic reproduction executes successfully."""
    res = client.post("/api/reproduction/run", json={"runs": 3}).json()
    assert res["total_runs"] == 3
    assert res["successful_runs"] == 3
    assert res["reproduction_validated"] is True
    assert len(res["runs"]) == 3
    for r in res["runs"]:
        assert r["status"] == "SUCCESS"
        assert r["signature_match"] is True


def test_8_reproduction_consistency_across_runs():
    """Verify that multiple reproduction executions yield identical metrics."""
    res = client.post("/api/reproduction/run", json={"runs": 3}).json()
    for run in res["runs"]:
        assert run["baseline_path_match"] is True
        assert run["dependency_match"] is True


def test_9_what_if_resilience_analysis():
    """Verify What-If engine computes prospective failure without altering active topology."""
    # Baseline check: R2-R3 is UP
    assert topology_engine.graph["R2"]["R3"]["status"] == "up"

    # Run What-If on R2-R3
    req = {
        "target_component": "R2-R3",
        "target_type": "LINK",
        "source": "PC1",
        "destination": "Server",
    }
    res = client.post("/api/resilience/what-if", json=req).json()
    assert res["before_reachable"] is True
    assert res["after_reachable"] is False
    assert res["has_alternate_path"] is False
    assert res["affected_flows_count"] > 0
    assert res["unaffected_flows_count"] > 0
    assert res["failure_scope"] in ("PARTITIONED", "LOCALIZED")

    # Verify active topology remained untouched
    assert topology_engine.graph["R2"]["R3"]["status"] == "up"


def test_10_integrated_investigation_orchestration():
    """Verify end-to-end 11-stage automated investigation runs and stores history."""
    res = client.post("/api/investigation/run", json={
        "source": "PC1",
        "destination": "Server",
        "fault_target": "R2-R3",
        "fault_type": "LINK_FAILURE",
        "reproduction_runs": 3,
    }).json()

    assert res["investigation_id"].startswith("INV-")
    assert len(res["stages"]) == 11
    assert res["observation"]["reachability_status"] in ("FAILED", "UNREACHABLE")
    assert res["diagnosis"]["primary_cause"]["target"] == "R2-R3"
    assert res["reduction"]["accepted_candidates"] == ["PC2", "R4"]
    assert res["reproduction"]["successful_runs"] == 3
    assert "End-to-End Investigation Complete" in res["summary_verdict"]

    # Verify history endpoint retrieves the record
    hist = client.get("/api/investigation/history").json()
    assert len(hist) >= 1
    assert any(h["investigation_id"] == res["investigation_id"] for h in hist)

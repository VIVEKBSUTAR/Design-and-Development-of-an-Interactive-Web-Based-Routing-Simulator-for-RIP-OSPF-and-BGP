import pytest
from fastapi.testclient import TestClient

from main import app, topology_engine
from topology.network import NetworkTopology
from failure.signature import FailureSignatureGenerator, FailureSignature
from causal.dependency import (
    CausalDependencyGenerator,
    DependencyGraph,
    DependencyNodeType,
    DependencyRelationship,
)
from reduction.reducer import (
    compare_signatures,
    compare_dependencies,
    FailureReducer,
)

client = TestClient(app)


def test_target_failure_and_dependencies_generated():
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)

    # 1. Capture pre-failure baseline path when links are up
    baseline_path = topology.get_path("PC1", "Server")
    assert baseline_path == ["PC1", "R1", "R2", "R3", "Server"]

    # 2. Inject R2-R3 failure
    topology.fail_link("R2", "R3")

    # 3. Generate failure signature and causal dependencies with baseline path
    target_sig = failure_gen.generate_signature(
        "PC1", "Server", baseline_path=baseline_path
    )
    target_deps = causal_gen.generate_dependencies(
        "PC1", "Server", baseline_path=baseline_path
    )

    assert target_sig is not None
    assert target_sig.baseline_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert target_sig.reachable is False
    assert target_sig.failed_component in ["R2-R3", "R3-R2"]

    assert target_deps is not None
    # 6 nodes: PRE_FAILURE_CONNECTIVITY, FAULT, STATE_CHANGE, PATH_CHANGE, REACHABILITY_FAILURE, OBSERVATION
    assert len(target_deps.nodes) == 6
    # 5 edges: ENABLES, CAUSES, LEADS_TO, RESULTS_IN, RESULTS_IN
    assert len(target_deps.edges) == 5


def test_candidate_removal_and_restoration_via_snapshot():
    topology = NetworkTopology()
    assert len(topology.get_topology_data().nodes) == 7

    snapshot = topology.snapshot()

    # Temporary candidate removal
    removed = topology.remove_node("PC2")
    assert removed is True
    assert len(topology.get_topology_data().nodes) == 6
    assert "PC2" not in [n.id for n in topology.get_topology_data().nodes]

    # Restoration
    topology.restore_snapshot(snapshot)
    assert len(topology.get_topology_data().nodes) == 7
    assert "PC2" in [n.id for n in topology.get_topology_data().nodes]


def test_signature_comparison_with_baseline_path():
    target = FailureSignature(
        source="PC1",
        destination="Server",
        baseline_path=["PC1", "R1", "R2", "R3", "Server"],
        reachable=False,
        path=None,
        packet_loss=100.0,
        fault_type="LINK_FAILURE",
        failed_component="R2-R3",
        routing_change=True,
        link_state="down",
    )

    # Identical candidate
    cand_match = target.model_copy()
    res_match = compare_signatures(target, cand_match)
    assert res_match.match is True
    assert len(res_match.changed_fields) == 0
    assert len(res_match.preserved_fields) == 9

    # Candidate with different baseline_path (e.g. R1 removed, disconnecting pre-failure path)
    cand_diff_baseline = target.model_copy(update={"baseline_path": None})
    res_diff_baseline = compare_signatures(target, cand_diff_baseline)
    assert res_diff_baseline.match is False
    assert "baseline_path" in res_diff_baseline.changed_fields

    # Different candidate (reachable changed)
    cand_diff = target.model_copy(update={"reachable": True, "packet_loss": 0.0})
    res_diff = compare_signatures(target, cand_diff)
    assert res_diff.match is False
    assert "reachable" in res_diff.changed_fields
    assert "packet_loss" in res_diff.changed_fields

    # Missing candidate
    res_none = compare_signatures(target, None)
    assert res_none.match is False


def test_dependency_comparison_with_pre_failure_connectivity():
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)

    baseline_path = topology.get_path("PC1", "Server")
    topology.fail_link("R2", "R3")
    target_deps = causal_gen.generate_dependencies(
        "PC1", "Server", baseline_path=baseline_path
    )
    assert target_deps is not None

    # Exact match
    res_match = compare_dependencies(target_deps, target_deps)
    assert res_match.match is True
    assert len(res_match.missing_relationships) == 0
    assert len(res_match.preserved_relationships) == 5

    # Incomplete/empty graph
    empty_graph = DependencyGraph(nodes=[], edges=[])
    res_empty = compare_dependencies(target_deps, empty_graph)
    assert res_empty.match is False
    assert len(res_empty.missing_relationships) == 5

    # None graph
    res_none = compare_dependencies(target_deps, None)
    assert res_none.match is False


# --------------------------------------------------
# Explicit Phase 5.1 Verification Tests A through F
# --------------------------------------------------


def test_reduction_test_a_remove_pc2_accepted():
    """Test A: Remove PC2. Expected: signature preserved, dependency preserved, candidate accepted."""
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)

    baseline_path = topology.get_path("PC1", "Server")
    topology.fail_link("R2", "R3")
    target_sig = failure_gen.generate_signature(
        "PC1", "Server", baseline_path=baseline_path
    )
    target_deps = causal_gen.generate_dependencies(
        "PC1", "Server", baseline_path=baseline_path
    )

    res_pc2 = reducer.evaluate_candidate("PC2", target_sig, target_deps)
    assert res_pc2.signature_match is True
    assert res_pc2.dependency_match is True
    assert res_pc2.status == "ACCEPTED"
    assert "PC2" not in [n.id for n in topology.get_topology_data().nodes]


def test_reduction_test_b_remove_r4_accepted():
    """Test B: Remove R4. Expected: signature preserved, dependency preserved, candidate accepted."""
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)

    baseline_path = topology.get_path("PC1", "Server")
    topology.fail_link("R2", "R3")
    target_sig = failure_gen.generate_signature(
        "PC1", "Server", baseline_path=baseline_path
    )
    target_deps = causal_gen.generate_dependencies(
        "PC1", "Server", baseline_path=baseline_path
    )

    res_r4 = reducer.evaluate_candidate("R4", target_sig, target_deps)
    assert res_r4.signature_match is True
    assert res_r4.dependency_match is True
    assert res_r4.status == "ACCEPTED"
    assert "R4" not in [n.id for n in topology.get_topology_data().nodes]


def test_reduction_test_c_attempt_remove_r1_rejected():
    """
    Test C: Attempt to remove R1.
    Expected: baseline failure context changes, signature comparison fails OR
    dependency comparison fails, candidate rejected, R1 restored.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)

    baseline_path = topology.get_path("PC1", "Server")
    topology.fail_link("R2", "R3")
    target_sig = failure_gen.generate_signature(
        "PC1", "Server", baseline_path=baseline_path
    )
    target_deps = causal_gen.generate_dependencies(
        "PC1", "Server", baseline_path=baseline_path
    )

    # Attempt to remove essential component R1
    res_r1 = reducer.evaluate_candidate("R1", target_sig, target_deps)

    # Signature fails because baseline_path becomes None (changed from ["PC1", "R1", "R2", "R3", "Server"])
    assert res_r1.signature_match is False
    assert "baseline_path" in res_r1.changed_fields

    # Dependency comparison fails because pre-failure connectivity is destroyed
    assert res_r1.dependency_match is False

    # Candidate must be rejected
    assert res_r1.status == "REJECTED"

    # R1 must be restored in the topology
    assert "R1" in [n.id for n in topology.get_topology_data().nodes]


def test_reduction_test_d_attempt_remove_pc1_rejected():
    """
    Test D: Attempt to remove PC1.
    Expected: candidate rejected, original topology restored.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)

    baseline_path = topology.get_path("PC1", "Server")
    topology.fail_link("R2", "R3")
    target_sig = failure_gen.generate_signature(
        "PC1", "Server", baseline_path=baseline_path
    )
    target_deps = causal_gen.generate_dependencies(
        "PC1", "Server", baseline_path=baseline_path
    )

    # Attempt to remove source PC1
    res_pc1 = reducer.evaluate_candidate("PC1", target_sig, target_deps)

    assert res_pc1.status == "REJECTED"
    # PC1 must be restored
    assert "PC1" in [n.id for n in topology.get_topology_data().nodes]


def test_reduction_test_e_verify_accepted_pc2_r4_reductions():
    """
    Test E: Verify accepted PC2/R4 reductions still work and reject R1 when evaluated together.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)

    exp_res = reducer.run_reduction_experiment(candidates=["PC2", "R4", "R1"])

    assert "PC2" in exp_res.accepted_candidates
    assert "R4" in exp_res.accepted_candidates
    assert "R1" in exp_res.rejected_candidates
    assert len(exp_res.accepted_candidates) == 2
    assert len(exp_res.rejected_candidates) == 1


def test_reduction_test_f_final_reduced_topology_preserved():
    """
    Test F: Verify the final reduced topology remains:
    PC1, R1, R2, R3, Server with 4 links.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)

    exp_res = reducer.run_reduction_experiment(candidates=["PC2", "R4", "R1"])

    # Final topology is 5 nodes, 4 links
    assert len(exp_res.final_topology.nodes) == 5
    assert len(exp_res.final_topology.links) == 4

    remaining_node_ids = set(n.id for n in exp_res.final_topology.nodes)
    expected_nodes = {"PC1", "R1", "R2", "R3", "Server"}
    assert remaining_node_ids == expected_nodes

    # Verify PC2 and R4 were removed while R1 is preserved
    assert "PC2" not in remaining_node_ids
    assert "R4" not in remaining_node_ids
    assert "R1" in remaining_node_ids

    # Final failure signature and causal dependencies are preserved
    assert exp_res.final_failure_signature is not None
    assert exp_res.final_failure_signature.baseline_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert exp_res.final_failure_signature.reachable is False
    assert exp_res.final_causal_dependencies is not None
    assert len(exp_res.final_causal_dependencies.nodes) == 6


def test_api_reduction_run():
    # Test POST /api/reduction/run
    response = client.post("/api/reduction/run")
    assert response.status_code == 200
    data = response.json()

    assert "original_topology" in data
    assert "final_topology" in data
    assert len(data["original_topology"]["nodes"]) == 7
    assert len(data["final_topology"]["nodes"]) == 5
    assert data["accepted_candidates"] == ["PC2", "R4"]
    assert data["rejected_candidates"] == ["R1"]
    assert "preserving the target failure behavior" in data["message"]

    # Verify R1 candidate evaluation shows REJECTED
    r1_eval = next((e for e in data["candidate_evaluations"] if e["candidate"] == "R1"), None)
    assert r1_eval is not None
    assert r1_eval["status"] == "REJECTED"
    assert r1_eval["signature_match"] is False
    assert "baseline_path" in r1_eval["changed_fields"]

    # Reset to leave clean topology state for other tests
    client.post("/api/topology/reset")

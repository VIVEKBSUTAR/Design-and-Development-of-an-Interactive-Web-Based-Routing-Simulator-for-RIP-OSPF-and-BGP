import pytest
from fastapi.testclient import TestClient

from main import app
from topology.network import NetworkTopology
from failure.signature import FailureSignatureGenerator
from causal.dependency import CausalDependencyGenerator
from reduction.reducer import FailureReducer
from reproduction.reproducer import FailureReproducer
from reproduction.models import ReproductionResponse

client = TestClient(app)


def test_reproduction_test_1_target_failure_and_dependencies_generated():
    """
    Test 1: Target failure and dependencies are generated correctly prior to reproduction.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=1)

    assert response.target_failure is not None
    assert response.target_failure.baseline_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert response.target_failure.failed_component in ["R2-R3", "R3-R2"]
    assert response.target_failure.reachable is False
    assert response.target_failure.packet_loss == 100.0

    assert response.target_dependencies is not None
    assert len(response.target_dependencies.nodes) == 6
    assert len(response.target_dependencies.edges) == 5


def test_reproduction_test_2_reduced_topology_has_5_nodes_and_4_links():
    """
    Test 2: Reduced topology produced by Phase 5.1 and used by reproduction has 5 nodes and 4 links.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=1)

    assert len(response.reduced_topology.nodes) == 5
    assert len(response.reduced_topology.links) == 4

    node_ids = {n.id for n in response.reduced_topology.nodes}
    assert node_ids == {"PC1", "R1", "R2", "R3", "Server"}
    assert "PC2" not in node_ids
    assert "R4" not in node_ids


def test_reproduction_test_3_single_reproduction_run_succeeds():
    """
    Test 3: Single reproduction run succeeds.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=1)

    assert response.total_runs == 1
    assert response.successful_runs == 1
    assert response.reproduction_validated is True
    assert len(response.runs) == 1
    run_1 = response.runs[0]
    assert run_1.run_number == 1
    assert run_1.status == "SUCCESS"
    assert run_1.signature_match is True
    assert run_1.dependency_match is True
    assert run_1.baseline_path_match is True


def test_reproduction_test_4_three_reproduction_runs_succeed():
    """
    Test 4: Three reproduction runs succeed.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=3)

    assert response.total_runs == 3
    assert len(response.runs) == 3
    for r in response.runs:
        assert r.status == "SUCCESS"


def test_reproduction_test_5_every_run_has_all_matches_true():
    """
    Test 5: Every run has:
    signature_match == True
    dependency_match == True
    baseline_path_match == True
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=3)

    for run_item in response.runs:
        assert run_item.signature_match is True
        assert run_item.dependency_match is True
        assert run_item.baseline_path_match is True


def test_reproduction_test_6_successful_runs_equals_3():
    """
    Test 6: successful_runs == 3.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=3)

    assert response.successful_runs == 3


def test_reproduction_test_7_reproduction_validated_is_true():
    """
    Test 7: reproduction_validated == True.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=3)

    assert response.reproduction_validated is True
    assert "reproduced the target failure across 3 independent runs" in response.message


def test_reproduction_test_8_final_reproduction_signature_matches_target():
    """
    Test 8: Final reproduction signature matches target.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=3)

    assert response.final_signature is not None
    assert response.final_signature.source == response.target_failure.source
    assert response.final_signature.destination == response.target_failure.destination
    assert response.final_signature.baseline_path == response.target_failure.baseline_path
    assert response.final_signature.reachable == response.target_failure.reachable
    assert response.final_signature.packet_loss == response.target_failure.packet_loss
    assert response.final_signature.fault_type == response.target_failure.fault_type
    assert response.final_signature.failed_component == response.target_failure.failed_component
    assert response.final_signature.link_state == response.target_failure.link_state
    assert response.final_signature.path == response.target_failure.path


def test_reproduction_test_9_final_reproduction_dependencies_match_target():
    """
    Test 9: Final reproduction dependencies match target.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)

    response = reproducer.run_reproduction_experiment(runs=3)

    assert response.final_dependencies is not None
    assert len(response.final_dependencies.nodes) == len(response.target_dependencies.nodes)
    assert len(response.final_dependencies.edges) == len(response.target_dependencies.edges)

    target_types = [n.type for n in response.target_dependencies.nodes]
    final_types = [n.type for n in response.final_dependencies.nodes]
    assert set(target_types) == set(final_types)


def test_reproduction_test_10_api_reproduction_run_endpoint():
    """
    Test 10: API POST /api/reproduction/run returns valid ReproductionResponse
    with 3 runs, all matching, and reproduction_validated == True.
    """
    res = client.post("/api/reproduction/run", json={"runs": 3})
    assert res.status_code == 200
    data = res.json()

    assert data["total_runs"] == 3
    assert data["successful_runs"] == 3
    assert data["reproduction_validated"] is True
    assert len(data["runs"]) == 3

    for run_item in data["runs"]:
        assert run_item["status"] == "SUCCESS"
        assert run_item["signature_match"] is True
        assert run_item["dependency_match"] is True
        assert run_item["baseline_path_match"] is True

    assert len(data["reduced_topology"]["nodes"]) == 5
    assert len(data["reduced_topology"]["links"]) == 4

    # Reset topology after test
    client.post("/api/topology/reset")

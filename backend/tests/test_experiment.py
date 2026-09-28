import pytest
from fastapi.testclient import TestClient
from main import app
from topology.network import NetworkTopology
from failure.signature import FailureSignatureGenerator
from causal.dependency import CausalDependencyGenerator
from reduction.reducer import FailureReducer
from reproduction.reproducer import FailureReproducer
from experiment.pipeline import ExperimentPipeline

client = TestClient(app)


def test_experiment_test_1_endpoint_succeeds():
    """
    Test 1: POST /api/experiment/run returns HTTP 200 with structured response.
    """
    response = client.post("/api/experiment/run")
    assert response.status_code == 200
    data = response.json()
    assert data["experiment_status"] == "SUCCESS"
    assert "summary_metrics" in data
    assert "reduction_result" in data
    assert "reproduction_result" in data

    # Reset after test
    client.post("/api/topology/reset")


def test_experiment_test_2_target_failure_correct():
    """
    Test 2: Complete experiment returns correct target failure.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)
    pipeline = ExperimentPipeline(topology, failure_gen, causal_gen, reducer, reproducer)

    result = pipeline.run_complete_experiment()

    assert result.target_failure.fault_type == "LINK_FAILURE"
    assert result.target_failure.failed_component in ["R2-R3", "R3-R2"]
    assert result.target_failure.reachable is False
    assert result.target_failure.packet_loss == 100.0
    assert result.target_failure.baseline_path == ["PC1", "R1", "R2", "R3", "Server"]

    # Target dependencies
    assert len(result.target_dependencies.nodes) == 6
    assert len(result.target_dependencies.edges) == 5


def test_experiment_test_3_candidates_accepted_and_rejected():
    """
    Test 3: Reduction returns accepted PC2 and R4, rejects R1.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)
    pipeline = ExperimentPipeline(topology, failure_gen, causal_gen, reducer, reproducer)

    result = pipeline.run_complete_experiment()

    assert result.summary_metrics.accepted_candidates == ["PC2", "R4"]
    assert result.summary_metrics.rejected_candidates == ["R1"]
    assert result.summary_metrics.nodes_removed == 2
    assert result.summary_metrics.links_removed == 2


def test_experiment_test_4_reduced_topology_dimensions():
    """
    Test 4: Reduced topology is 5 nodes / 4 links.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)
    pipeline = ExperimentPipeline(topology, failure_gen, causal_gen, reducer, reproducer)

    result = pipeline.run_complete_experiment()

    assert result.summary_metrics.original_nodes == 7
    assert result.summary_metrics.original_links == 6
    assert result.summary_metrics.reduced_nodes == 5
    assert result.summary_metrics.reduced_links == 4

    reduced_node_ids = {n.id for n in result.reduction_result.final_topology.nodes}
    assert reduced_node_ids == {"PC1", "R1", "R2", "R3", "Server"}


def test_experiment_test_5_reproduction_3_of_3():
    """
    Test 5: Reproduction returns 3/3 successful.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)
    pipeline = ExperimentPipeline(topology, failure_gen, causal_gen, reducer, reproducer)

    result = pipeline.run_complete_experiment()

    assert result.summary_metrics.reproduction_runs == 3
    assert result.summary_metrics.successful_runs == 3
    assert len(result.reproduction_result.runs) == 3
    for run_item in result.reproduction_result.runs:
        assert run_item.status == "SUCCESS"
        assert run_item.signature_match is True
        assert run_item.dependency_match is True
        assert run_item.baseline_path_match is True


def test_experiment_test_6_reproduction_validated():
    """
    Test 6: reproduction_validated == True.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)
    pipeline = ExperimentPipeline(topology, failure_gen, causal_gen, reducer, reproducer)

    result = pipeline.run_complete_experiment()

    assert result.summary_metrics.reproduction_validated is True
    assert result.reproduction_result.reproduction_validated is True
    assert result.experiment_status == "SUCCESS"


def test_experiment_test_7_deterministic_repeatability():
    """
    Test 7: Running the experiment twice gives the same deterministic result.
    """
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)
    reducer = FailureReducer(topology, failure_gen, causal_gen)
    reproducer = FailureReproducer(topology, failure_gen, causal_gen, reducer)
    pipeline = ExperimentPipeline(topology, failure_gen, causal_gen, reducer, reproducer)

    res1 = pipeline.run_complete_experiment()
    res2 = pipeline.run_complete_experiment()

    assert res1.summary_metrics == res2.summary_metrics
    assert res1.target_failure.model_dump() == res2.target_failure.model_dump()
    assert (
        res1.reduction_result.accepted_candidates
        == res2.reduction_result.accepted_candidates
    )
    assert (
        res1.reduction_result.rejected_candidates
        == res2.reduction_result.rejected_candidates
    )
    assert (
        res1.reproduction_result.successful_runs
        == res2.reproduction_result.successful_runs
    )
    assert (
        res1.reproduction_result.reproduction_validated
        == res2.reproduction_result.reproduction_validated
    )

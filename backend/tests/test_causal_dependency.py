import pytest
from fastapi.testclient import TestClient

from main import app, topology_engine
from topology.network import NetworkTopology
from failure.signature import FailureSignatureGenerator
from causal.dependency import (
    CausalDependencyGenerator,
    DependencyNodeType,
    DependencyRelationship,
)

client = TestClient(app)


def test_normal_network_has_inactive_causal_graph():
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)

    # In healthy state, no causal dependencies should exist
    graph = causal_gen.generate_dependencies(source="PC1", destination="Server")
    assert graph is None


def test_api_normal_network_causal_dependencies():
    # Ensure clean topology
    client.post("/api/topology/reset")

    response = client.get("/api/causal-dependencies")
    assert response.status_code == 200
    data = response.json()
    assert data["active"] is False
    assert data["graph"] is None
    assert "No active failure" in data["message"]


def test_causal_dependencies_after_r2_r3_failure():
    topology = NetworkTopology()
    failure_gen = FailureSignatureGenerator(topology)
    causal_gen = CausalDependencyGenerator(failure_gen)

    # Fail R2-R3
    topology.fail_link("R2", "R3")

    # Generate causal dependency graph with pre-failure baseline path
    graph = causal_gen.generate_dependencies(
        source="PC1",
        destination="Server",
        baseline_path=["PC1", "R1", "R2", "R3", "Server"],
    )
    assert graph is not None

    # Verify nodes
    node_types = [node.type for node in graph.nodes]
    assert DependencyNodeType.PRE_FAILURE_CONNECTIVITY in node_types
    assert DependencyNodeType.FAULT in node_types
    assert DependencyNodeType.STATE_CHANGE in node_types
    assert DependencyNodeType.PATH_CHANGE in node_types
    assert DependencyNodeType.REACHABILITY_FAILURE in node_types
    assert DependencyNodeType.OBSERVATION in node_types
    assert len(graph.nodes) == 6

    # Verify labels
    node_by_type = {node.type: node for node in graph.nodes}
    assert "Pre-Failure Path" in node_by_type[DependencyNodeType.PRE_FAILURE_CONNECTIVITY].label
    assert "R2-R3 Link Failure" in node_by_type[DependencyNodeType.FAULT].label
    assert "R2-R3 Link State Down" in node_by_type[DependencyNodeType.STATE_CHANGE].label
    assert "PC1 → Server Path Unavailable" in node_by_type[DependencyNodeType.PATH_CHANGE].label
    assert "PC1 → Server Unreachable" in node_by_type[DependencyNodeType.REACHABILITY_FAILURE].label
    assert "100% Packet Loss" in node_by_type[DependencyNodeType.OBSERVATION].label

    # Verify directed edges & relationships
    assert len(graph.edges) == 5
    relationships = [edge.relationship for edge in graph.edges]
    assert relationships == [
        DependencyRelationship.ENABLES,
        DependencyRelationship.CAUSES,
        DependencyRelationship.LEADS_TO,
        DependencyRelationship.RESULTS_IN,
        DependencyRelationship.RESULTS_IN,
    ]

    # Verify sequential connectivity
    assert graph.edges[0].source == node_by_type[DependencyNodeType.PRE_FAILURE_CONNECTIVITY].id
    assert graph.edges[0].target == node_by_type[DependencyNodeType.FAULT].id

    assert graph.edges[1].source == node_by_type[DependencyNodeType.FAULT].id
    assert graph.edges[1].target == node_by_type[DependencyNodeType.STATE_CHANGE].id

    assert graph.edges[2].source == node_by_type[DependencyNodeType.STATE_CHANGE].id
    assert graph.edges[2].target == node_by_type[DependencyNodeType.PATH_CHANGE].id

    assert graph.edges[3].source == node_by_type[DependencyNodeType.PATH_CHANGE].id
    assert graph.edges[3].target == node_by_type[DependencyNodeType.REACHABILITY_FAILURE].id

    assert graph.edges[4].source == node_by_type[DependencyNodeType.REACHABILITY_FAILURE].id
    assert graph.edges[4].target == node_by_type[DependencyNodeType.OBSERVATION].id


def test_api_causal_dependencies_after_failing_and_restoring_r2_r3():
    # 1. Reset
    client.post("/api/topology/reset")

    # 2. Fail R2-R3 via API
    resp_fail = client.post(
        "/api/topology/fail-link", json={"source": "R2", "destination": "R3"}
    )
    assert resp_fail.status_code == 200

    # 3. Query causal dependencies
    resp_causal = client.get("/api/causal-dependencies")
    assert resp_causal.status_code == 200
    data = resp_causal.json()

    assert data["active"] is True
    assert data["graph"] is not None
    assert len(data["graph"]["nodes"]) == 6
    assert len(data["graph"]["edges"]) == 5

    # Verify node types from API response
    types = [n["type"] for n in data["graph"]["nodes"]]
    assert types == [
        "PRE_FAILURE_CONNECTIVITY",
        "FAULT",
        "STATE_CHANGE",
        "PATH_CHANGE",
        "REACHABILITY_FAILURE",
        "OBSERVATION",
    ]

    # 4. Restore R2-R3 via API
    resp_restore = client.post(
        "/api/topology/restore-link", json={"source": "R2", "destination": "R3"}
    )
    assert resp_restore.status_code == 200

    # 5. Verify causal dependencies become inactive
    resp_cleared = client.get("/api/causal-dependencies")
    assert resp_cleared.status_code == 200
    cleared_data = resp_cleared.json()
    assert cleared_data["active"] is False
    assert cleared_data["graph"] is None

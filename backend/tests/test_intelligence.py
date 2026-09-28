"""
Unit and integration tests for Module 1: Network Intelligence & Path Analysis.
Tests path resolution, alternate path evaluation, structural path comparisons,
reachability matrix calculations, component flow dependencies, and API endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from main import app, topology_engine, intelligence_engine
from intelligence.strategy import DeterministicShortestPathStrategy


@pytest.fixture(autouse=True)
def reset_network_before_test():
    """Ensure every test starts with clean 7-node baseline."""
    topology_engine.reset()


client = TestClient(app)


# -----------------------------------------------------------------------------
# 1. Path Query & Computation
# -----------------------------------------------------------------------------

def test_path_query_baseline_pc1_to_server():
    """Verify primary path analysis on baseline topology resolves 4 hops."""
    res = intelligence_engine.analyze_path("PC1", "Server")
    assert res.reachable is True
    assert res.hop_count == 4
    assert res.nodes_traversed == ["PC1", "R1", "R2", "R3", "Server"]
    assert res.links_traversed == ["PC1-R1", "R1-R2", "R2-R3", "R3-Server"]
    assert res.path_cost == 4.0
    assert res.primary_path is not None
    assert res.primary_path.status == "active"
    assert "Deterministic Minimal Hop Count" in res.selection_rule
    # In a linear topology, all links on the primary path are bridge cut-edges (bottlenecks)
    assert len(res.bottlenecks) == 4


def test_path_query_branch_pc1_to_pc2():
    """Verify primary path analysis on unaffected branch PC1 -> PC2."""
    res = intelligence_engine.analyze_path("PC1", "PC2")
    assert res.reachable is True
    assert res.hop_count == 4
    assert res.nodes_traversed == ["PC1", "R1", "R2", "R4", "PC2"]
    assert res.links_traversed == ["PC1-R1", "R1-R2", "R2-R4", "R4-PC2"]


def test_path_query_unreachable_when_link_down():
    """Verify path query dynamically reflects unreachable state when link R2-R3 is down."""
    topology_engine.fail_link("R2", "R3")
    res = intelligence_engine.analyze_path("PC1", "Server")
    assert res.reachable is False
    assert res.primary_path is None
    assert res.hop_count == 0


def test_path_query_branch_remains_reachable_when_r2_r3_down():
    """Verify branch PC1 -> PC2 remains reachable when R2-R3 is down."""
    topology_engine.fail_link("R2", "R3")
    res = intelligence_engine.analyze_path("PC1", "PC2")
    assert res.reachable is True
    assert res.nodes_traversed == ["PC1", "R1", "R2", "R4", "PC2"]


def test_path_query_nonexistent_nodes():
    """Verify handling of invalid/nonexistent nodes."""
    res = intelligence_engine.analyze_path("PC1", "NonExistent")
    assert res.reachable is False
    assert res.primary_path is None


# -----------------------------------------------------------------------------
# 2. Alternate Path Discovery & Redundancy
# -----------------------------------------------------------------------------

def test_alternate_paths_baseline_single_path():
    """Verify baseline tree topology has strictly 1 physical path between PC1 and Server."""
    alt = intelligence_engine.get_alternate_paths("PC1", "Server")
    assert alt.reachable is True
    assert alt.total_physical_paths == 1
    assert alt.active_alternate_paths == 0
    assert alt.redundancy_status == "NONE"
    assert len(alt.alternate_paths) == 0


def test_alternate_paths_with_redundant_link_added():
    """Add a redundant bypass link (R2 -> Server) and verify alternate path discovery."""
    topology_engine.add_link("R2", "Server", status="up")
    alt = intelligence_engine.get_alternate_paths("PC1", "Server")
    assert alt.total_physical_paths == 2
    assert alt.active_alternate_paths == 1
    assert alt.redundancy_status == "HIGH"
    # Primary shortest path is now PC1 -> R1 -> R2 -> Server (3 hops)
    assert alt.primary_path.hops == ["PC1", "R1", "R2", "Server"]
    # Alternate path is PC1 -> R1 -> R2 -> R3 -> Server (4 hops)
    assert len(alt.alternate_paths) == 1
    assert alt.alternate_paths[0].hops == ["PC1", "R1", "R2", "R3", "Server"]
    assert alt.alternate_paths[0].status == "active"


# -----------------------------------------------------------------------------
# 3. Path Comparison
# -----------------------------------------------------------------------------

def test_path_comparison():
    """Verify structural comparison between primary path and an alternate path."""
    path_a = ["PC1", "R1", "R2", "R3", "Server"]
    path_b = ["PC1", "R1", "R2", "R4", "Server"]

    diff = intelligence_engine.compare_paths(path_a, path_b)
    assert diff.hop_count_a == 4
    assert diff.hop_count_b == 4
    assert diff.hop_difference == 0
    assert diff.common_nodes == ["PC1", "R1", "R2", "Server"]
    assert diff.unique_nodes_a == ["R3"]
    assert diff.unique_nodes_b == ["R4"]
    assert diff.shared_dependency_points == ["R1", "R2"]
    assert diff.similarity_percentage > 0


# -----------------------------------------------------------------------------
# 4. Reachability Matrix
# -----------------------------------------------------------------------------

def test_reachability_matrix_healthy_baseline():
    """Verify pairwise reachability across PC1, PC2, and Server on healthy baseline."""
    matrix_res = intelligence_engine.get_reachability_matrix()
    assert "PC1" in matrix_res.endpoints
    assert "PC2" in matrix_res.endpoints
    assert "Server" in matrix_res.endpoints
    assert matrix_res.total_pairs == 6  # 3 endpoints: 3 * 2 pairs
    assert matrix_res.reachable_pairs == 6
    assert matrix_res.unreachable_pairs == 0
    assert matrix_res.network_health_percentage == 100.0

    # Diagonal is SAME_NODE
    assert matrix_res.matrix["PC1"]["PC1"].status == "SAME_NODE"
    # End-to-end
    assert matrix_res.matrix["PC1"]["Server"].status == "REACHABLE"
    assert matrix_res.matrix["PC1"]["Server"].hop_count == 4


def test_reachability_matrix_after_r2_r3_failure():
    """Verify matrix updates dynamically when link R2-R3 fails."""
    topology_engine.fail_link("R2", "R3")
    matrix_res = intelligence_engine.get_reachability_matrix()

    assert matrix_res.matrix["PC1"]["Server"].status == "UNREACHABLE"
    assert matrix_res.matrix["PC2"]["Server"].status == "UNREACHABLE"
    assert matrix_res.matrix["Server"]["PC1"].status == "UNREACHABLE"
    # PC1 <-> PC2 remains healthy
    assert matrix_res.matrix["PC1"]["PC2"].status == "REACHABLE"
    assert matrix_res.matrix["PC2"]["PC1"].status == "REACHABLE"

    assert matrix_res.reachable_pairs == 2
    assert matrix_res.unreachable_pairs == 4
    assert matrix_res.network_health_percentage == round((2 / 6) * 100.0, 1)


# -----------------------------------------------------------------------------
# 5. Component Flow Dependency & Impact Analysis
# -----------------------------------------------------------------------------

def test_link_dependency_r2_r3():
    """Verify link dependency identifies that PC1 -> Server and PC2 -> Server rely on R2-R3."""
    dep = intelligence_engine.analyze_component_dependencies("link", "R2-R3")
    assert dep.component_id == "R2-R3"
    assert dep.status == "up"
    assert dep.dependent_flow_count > 0

    flows = [(f.source, f.destination) for f in dep.dependent_flows]
    assert ("PC1", "Server") in flows
    assert ("PC2", "Server") in flows
    # PC1 -> PC2 does not traverse R2-R3
    assert ("PC1", "PC2") not in flows

    # In baseline topology, failing R2-R3 has no alternate bypass for Server flows
    assert dep.has_alternate_bypass is False
    assert dep.criticality == "HIGH"


def test_node_dependency_router_r1():
    """Verify node dependency on gateway router R1."""
    dep = intelligence_engine.analyze_component_dependencies("node", "R1")
    assert dep.component_id == "R1"
    assert dep.dependent_flow_count > 0
    flows = [(f.source, f.destination) for f in dep.dependent_flows]
    assert ("PC1", "Server") in flows
    assert ("PC1", "PC2") in flows


# -----------------------------------------------------------------------------
# 6. Deterministic Path Selection Tie-Breaking
# -----------------------------------------------------------------------------

def test_deterministic_path_selection_tie_breaking():
    """Verify that when 2 equal-cost paths exist, selection is 100% deterministic."""
    strategy = DeterministicShortestPathStrategy()
    # Create diamond topology: Source -> A -> Dest, Source -> B -> Dest
    import networkx as nx
    diamond = nx.Graph()
    diamond.add_node("S", health_status="up")
    diamond.add_node("A", health_status="up")
    diamond.add_node("B", health_status="up")
    diamond.add_node("D", health_status="up")
    diamond.add_edge("S", "A", status="up")
    diamond.add_edge("A", "D", status="up")
    diamond.add_edge("S", "B", status="up")
    diamond.add_edge("B", "D", status="up")

    # Lexicographical tie-breaking should consistently pick ['S', 'A', 'D'] over ['S', 'B', 'D']
    for _ in range(10):
        p = strategy.select_path("S", "D", diamond)
        assert p == ["S", "A", "D"]


# -----------------------------------------------------------------------------
# 7. Network Intelligence REST API Endpoints
# -----------------------------------------------------------------------------

def test_api_get_path():
    """Verify GET /api/network-intelligence/path returns path data."""
    res = client.get("/api/network-intelligence/path?source=PC1&destination=Server")
    assert res.status_code == 200
    data = res.json()
    assert data["reachable"] is True
    assert data["hop_count"] == 4
    assert data["nodes_traversed"] == ["PC1", "R1", "R2", "R3", "Server"]


def test_api_get_alternate_paths():
    """Verify GET /api/network-intelligence/alternate-paths."""
    res = client.get("/api/network-intelligence/alternate-paths?source=PC1&destination=Server")
    assert res.status_code == 200
    data = res.json()
    assert data["total_physical_paths"] == 1
    assert data["redundancy_status"] == "NONE"


def test_api_compare_paths():
    """Verify POST /api/network-intelligence/compare-paths."""
    res = client.post(
        "/api/network-intelligence/compare-paths",
        json={"path_a": ["PC1", "R1", "R2", "R3", "Server"], "path_b": ["PC1", "R1", "R2", "R4", "Server"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["common_nodes"] == ["PC1", "R1", "R2", "Server"]
    assert data["unique_nodes_a"] == ["R3"]
    assert data["unique_nodes_b"] == ["R4"]


def test_api_get_reachability_matrix():
    """Verify GET /api/network-intelligence/reachability."""
    res = client.get("/api/network-intelligence/reachability")
    assert res.status_code == 200
    data = res.json()
    assert data["reachable_pairs"] == 6
    assert data["network_health_percentage"] == 100.0


def test_api_get_component_dependencies():
    """Verify GET /api/network-intelligence/dependencies."""
    res = client.get("/api/network-intelligence/dependencies?component_type=link&component_id=R2-R3")
    assert res.status_code == 200
    data = res.json()
    assert data["component_id"] == "R2-R3"
    assert data["criticality"] == "HIGH"
    assert data["dependent_flow_count"] > 0

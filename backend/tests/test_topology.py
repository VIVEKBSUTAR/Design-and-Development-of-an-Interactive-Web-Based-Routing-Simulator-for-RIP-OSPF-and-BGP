import pytest
from fastapi.testclient import TestClient

from main import app, topology_engine
from topology.network import NetworkTopology, NodeType

client = TestClient(app)


def test_default_topology_loads_correctly():
    topology = NetworkTopology()
    data = topology.get_topology_data()
    assert len(data.nodes) == 7
    assert len(data.links) == 6


def test_expected_nodes_exist():
    topology = NetworkTopology()
    data = topology.get_topology_data()
    node_map = {node.id: node for node in data.nodes}

    expected = {
        "PC1": ("PC1", NodeType.HOST),
        "R1": ("R1", NodeType.ROUTER),
        "R2": ("R2", NodeType.ROUTER),
        "R3": ("R3", NodeType.ROUTER),
        "Server": ("Server", NodeType.SERVER),
        "R4": ("R4", NodeType.ROUTER),
        "PC2": ("PC2", NodeType.HOST),
    }

    for node_id, (name, n_type) in expected.items():
        assert node_id in node_map, f"Node {node_id} missing from topology"
        assert node_map[node_id].name == name
        assert node_map[node_id].type == n_type


def test_expected_links_exist():
    topology = NetworkTopology()
    data = topology.get_topology_data()

    # Undirected link set for comparison
    actual_links = {
        tuple(sorted([link.source, link.destination])): link.status
        for link in data.links
    }

    expected_links = [
        ("PC1", "R1"),
        ("R1", "R2"),
        ("R2", "R3"),
        ("R3", "Server"),
        ("R2", "R4"),
        ("R4", "PC2"),
    ]

    for u, v in expected_links:
        key = tuple(sorted([u, v]))
        assert key in actual_links, f"Link between {u} and {v} missing"
        assert actual_links[key] == "up", f"Link between {u} and {v} is not 'up'"


def test_pc1_has_path_to_server():
    topology = NetworkTopology()
    assert topology.has_path("PC1", "Server") is True
    path = topology.get_path("PC1", "Server")
    assert path == ["PC1", "R1", "R2", "R3", "Server"]


def test_pc1_has_path_to_pc2():
    topology = NetworkTopology()
    assert topology.has_path("PC1", "PC2") is True
    path = topology.get_path("PC1", "PC2")
    assert path == ["PC1", "R1", "R2", "R4", "PC2"]


def test_topology_reset():
    topology = NetworkTopology()
    # Mutate topology
    topology.add_node("X1", "X1", NodeType.SWITCH)
    topology.add_link("PC1", "X1", "up")
    assert len(topology.get_topology_data().nodes) == 8
    assert len(topology.get_topology_data().links) == 7

    # Reset
    topology.reset()
    reset_data = topology.get_topology_data()
    assert len(reset_data.nodes) == 7
    assert len(reset_data.links) == 6
    assert "X1" not in [n.id for n in reset_data.nodes]


def test_api_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_get_topology():
    client.post("/api/topology/reset")
    response = client.get("/api/topology")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "links" in data
    assert len(data["nodes"]) == 7
    assert len(data["links"]) == 6


def test_api_reachability():
    client.post("/api/topology/reset")
    # Test valid reachable paths
    resp = client.get("/api/topology/reachability?source=PC1&destination=Server")
    assert resp.status_code == 200
    data = resp.json()
    assert data["reachable"] is True
    assert data["path"] == ["PC1", "R1", "R2", "R3", "Server"]

    resp = client.get("/api/topology/reachability?source=PC1&destination=PC2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["reachable"] is True
    assert data["path"] == ["PC1", "R1", "R2", "R4", "PC2"]

    # Test non-existent node
    resp = client.get("/api/topology/reachability?source=Unknown&destination=Server")
    assert resp.status_code == 404


def test_api_reset():
    resp = client.post("/api/topology/reset")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "Topology reset" in data["message"]


# Phase 2: Link Failure and Restoration Tests

def test_fail_link_changes_status_to_down_and_keeps_in_graph():
    topology = NetworkTopology()
    assert topology.get_link_status("R2", "R3") == "up"

    # Fail the link
    success = topology.fail_link("R2", "R3")
    assert success is True
    assert topology.get_link_status("R2", "R3") == "down"

    # Link must still be present in the topology graph and topology data
    assert topology.graph.has_edge("R2", "R3") is True
    data = topology.get_topology_data()
    r2_r3_link = next(
        (l for l in data.links if set([l.source, l.destination]) == {"R2", "R3"}),
        None,
    )
    assert r2_r3_link is not None
    assert r2_r3_link.status == "down"


def test_failed_link_breaks_path_while_branch_remains_reachable():
    topology = NetworkTopology()

    # Pre-condition
    assert topology.has_path("PC1", "Server") is True
    assert topology.has_path("PC1", "PC2") is True

    # Fail R2 <-> R3
    topology.fail_link("R2", "R3")

    # Main path PC1 -> Server must be broken
    assert topology.has_path("PC1", "Server") is False
    assert topology.get_path("PC1", "Server") is None

    # Branch path PC1 -> PC2 must remain reachable
    assert topology.has_path("PC1", "PC2") is True
    assert topology.get_path("PC1", "PC2") == ["PC1", "R1", "R2", "R4", "PC2"]


def test_restore_link_reestablishes_path():
    topology = NetworkTopology()
    topology.fail_link("R2", "R3")
    assert topology.has_path("PC1", "Server") is False

    # Restore the link
    restored = topology.restore_link("R2", "R3")
    assert restored is True
    assert topology.get_link_status("R2", "R3") == "up"

    # Reachability is restored
    assert topology.has_path("PC1", "Server") is True
    assert topology.get_path("PC1", "Server") == ["PC1", "R1", "R2", "R3", "Server"]


def test_fail_and_restore_invalid_link_handled_cleanly():
    topology = NetworkTopology()
    assert topology.fail_link("NonExistent", "R2") is False
    assert topology.restore_link("NonExistent", "R2") is False
    assert topology.get_link_status("NonExistent", "R2") is None


def test_api_fail_and_restore_link():
    # Reset first
    client.post("/api/topology/reset")

    # Fail R2 -> R3 via API
    resp = client.post("/api/topology/fail-link", json={"source": "R2", "destination": "R3"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["link_status"] == "down"

    # Check reachability via API: PC1 -> Server should be false
    reach_server = client.get("/api/topology/reachability?source=PC1&destination=Server")
    assert reach_server.status_code == 200
    assert reach_server.json()["reachable"] is False
    assert reach_server.json()["path"] is None

    # Check reachability via API: PC1 -> PC2 should remain true
    reach_pc2 = client.get("/api/topology/reachability?source=PC1&destination=PC2")
    assert reach_pc2.status_code == 200
    assert reach_pc2.json()["reachable"] is True

    # Restore R2 -> R3 via API
    resp_restore = client.post("/api/topology/restore-link", json={"source": "R2", "destination": "R3"})
    assert resp_restore.status_code == 200
    assert resp_restore.json()["status"] == "ok"
    assert resp_restore.json()["link_status"] == "up"

    # Check reachability via API: PC1 -> Server should be true again
    reach_server_again = client.get("/api/topology/reachability?source=PC1&destination=Server")
    assert reach_server_again.status_code == 200
    assert reach_server_again.json()["reachable"] is True

    # Test invalid link returns 404
    resp_invalid = client.post("/api/topology/fail-link", json={"source": "Unknown1", "destination": "Unknown2"})
    assert resp_invalid.status_code == 404

    resp_invalid_restore = client.post("/api/topology/restore-link", json={"source": "Unknown1", "destination": "Unknown2"})
    assert resp_invalid_restore.status_code == 404

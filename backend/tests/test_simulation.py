"""
Unit and integration tests for discrete-event probe simulator and diagnostics.
Verifies separation of empirical observations from fault diagnosis.
"""

import pytest
from fastapi.testclient import TestClient

from main import app, topology_engine, probe_simulator
from simulation.models import ProbeRequest, ProbeEventType
from simulation.simulator import diagnose_from_observations


@pytest.fixture(autouse=True)
def reset_network_before_test():
    """Ensure every test starts with the clean default 7-node baseline."""
    topology_engine.reset()


def test_simulation_healthy_baseline_pc1_to_server():
    """Verify that on healthy baseline topology, all probes are delivered with 0% loss."""
    req = ProbeRequest(source="PC1", destination="Server", probe_count=3)
    res = probe_simulator.run_health_test(req)

    assert res.source == "PC1"
    assert res.destination == "Server"
    assert res.probes_sent == 3
    assert res.probes_received == 3
    assert res.probes_dropped == 0
    assert res.packet_loss_percentage == 0.0
    assert res.network_reachability_status == "HEALTHY"
    assert res.nominal_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert res.observed_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert res.avg_rtt_ms is not None
    assert res.avg_rtt_ms > 0

    # Verify event sequence
    assert len(res.all_events) > 0
    event_types = [e.event_type for e in res.probe_details[0].events]
    assert (ProbeEventType.PROBE_CREATED in event_types or ProbeEventType.PACKET_CREATED in event_types)
    assert ProbeEventType.FORWARDED in event_types
    assert ProbeEventType.RECEIVED in event_types
    assert ProbeEventType.DROPPED not in event_types

    # Verify separate diagnosis layer
    diag = diagnose_from_observations(res, topology_engine)
    assert not diag.detected_failure
    assert diag.confidence == "HIGH"
    assert "0% probe loss" in diag.symptom


def test_simulation_link_failure_r2_r3():
    """Verify that failing R2-R3 causes probes to drop at R2 with 100% loss."""
    topology_engine.fail_link("R2", "R3")

    req = ProbeRequest(source="PC1", destination="Server", probe_count=3)
    res = probe_simulator.run_health_test(req)

    assert res.probes_sent == 3
    assert res.probes_received == 0
    assert res.probes_dropped == 3
    assert res.packet_loss_percentage == 100.0
    assert res.network_reachability_status == "FAILED"

    # Empirical observation check: probe reached R2
    first_trace = res.probe_details[0]
    assert first_trace.status == "DROPPED"
    assert first_trace.drop_node == "R2"
    assert first_trace.drop_link == "R2-R3"
    assert "DOWN" in first_trace.drop_reason
    assert first_trace.hops_traversed == ["PC1", "R1", "R2"]

    # Verify event trace
    event_types = [e.event_type for e in first_trace.events]
    assert (ProbeEventType.PROBE_CREATED in event_types or ProbeEventType.PACKET_CREATED in event_types)
    assert ProbeEventType.FORWARDED in event_types
    assert ProbeEventType.DROPPED in event_types
    assert ProbeEventType.RECEIVED not in event_types

    # Verify diagnostic layer derives root cause strictly from observations
    diag = diagnose_from_observations(res, topology_engine)
    assert diag.detected_failure is True
    assert diag.suspected_component_type == "link"
    assert diag.suspected_component_id == "R2-R3"
    assert diag.confidence == "HIGH"
    assert "R2-R3" in diag.isolation_assessment
    assert "Branch R2-R4-PC2 remains unaffected" in diag.isolation_assessment


def test_simulation_branch_isolation_during_r2_r3_failure():
    """
    When R2-R3 is down, PC1 -> PC2 probe must still succeed,
    demonstrating proper topological isolation in simulation.
    """
    topology_engine.fail_link("R2", "R3")

    # PC1 -> PC2 travels PC1 -> R1 -> R2 -> R4 -> PC2
    req = ProbeRequest(source="PC1", destination="PC2", probe_count=2)
    res = probe_simulator.run_health_test(req)

    assert res.probes_sent == 2
    assert res.probes_received == 2
    assert res.probes_dropped == 0
    assert res.packet_loss_percentage == 0.0
    assert res.network_reachability_status == "HEALTHY"
    assert res.observed_path == ["PC1", "R1", "R2", "R4", "PC2"]


def test_simulation_node_failure():
    """Verify that marking a transit node down causes drop at that node."""
    topology_engine.update_node("R1", health_status="down")

    req = ProbeRequest(source="PC1", destination="Server", probe_count=2)
    res = probe_simulator.run_health_test(req)

    assert res.packet_loss_percentage == 100.0
    first_trace = res.probe_details[0]
    assert first_trace.drop_node == "R1"
    assert "DOWN" in (first_trace.drop_reason or "")

    diag = diagnose_from_observations(res, topology_engine)
    assert diag.detected_failure is True
    assert diag.suspected_component_type == "node"
    assert diag.suspected_component_id == "R1"


def test_api_health_test_endpoint():
    """Verify POST /api/simulation/health-test endpoint returns simulation and diagnosis."""
    client = TestClient(app)
    response = client.post(
        "/api/simulation/health-test",
        json={"source": "PC1", "destination": "Server", "probe_count": 2},
    )
    assert response.status_code == 200
    data = response.json()
    assert "simulation" in data
    assert "diagnosis" in data
    assert data["simulation"]["network_reachability_status"] == "HEALTHY"
    assert data["diagnosis"]["detected_failure"] is False


def test_api_topology_editing_endpoints():
    """Verify dynamic node and link creation, update, and deletion via API."""
    client = TestClient(app)

    # 1. Create a new switch node
    res_node = client.post(
        "/api/topology/nodes",
        json={"id": "SW1", "label": "Switch 1", "node_type": "switch", "x": 300, "y": 150},
    )
    assert res_node.status_code == 200
    assert topology_engine.has_node("SW1")

    # 2. Update node status
    res_patch = client.patch(
        "/api/topology/nodes/SW1",
        json={"health_status": "down"},
    )
    assert res_patch.status_code == 200
    assert topology_engine.graph.nodes["SW1"]["health_status"] == "down"

    # 3. Create a link
    res_link = client.post(
        "/api/topology/links",
        json={"source": "SW1", "destination": "R1"},
    )
    assert res_link.status_code == 200
    assert topology_engine.graph.has_edge("SW1", "R1")

    # 4. Delete the link
    res_del_link = client.request(
        "DELETE",
        "/api/topology/links",
        json={"source": "SW1", "destination": "R1"},
    )
    assert res_del_link.status_code == 200
    assert not topology_engine.graph.has_edge("SW1", "R1")

    # 5. Delete the node
    res_del_node = client.delete("/api/topology/nodes/SW1")
    assert res_del_node.status_code == 200
    assert not topology_engine.has_node("SW1")


def test_simulation_link_restoration_recovery():
    """Verify that severing R2-R3 causes 100% loss, and restoring it immediately recovers to 0% loss."""
    # 1. Sever link
    topology_engine.fail_link("R2", "R3")
    res_failed = probe_simulator.run_health_test(
        ProbeRequest(source="PC1", destination="Server", probe_count=3)
    )
    assert res_failed.packet_loss_percentage == 100.0
    assert res_failed.network_reachability_status == "FAILED"

    # 2. Restore link
    topology_engine.restore_link("R2", "R3")
    res_recovered = probe_simulator.run_health_test(
        ProbeRequest(source="PC1", destination="Server", probe_count=3)
    )
    assert res_recovered.packet_loss_percentage == 0.0
    assert res_recovered.network_reachability_status == "HEALTHY"
    assert res_recovered.probes_received == 3
    assert res_recovered.observed_path == ["PC1", "R1", "R2", "R3", "Server"]


def test_simulation_nonexistent_nodes_handled_cleanly():
    """Verify that probing nonexistent source or destination does not crash."""
    res_missing_src = probe_simulator.run_health_test(
        ProbeRequest(source="NonexistentNode", destination="Server", probe_count=2)
    )
    assert res_missing_src.packet_loss_percentage == 100.0
    assert "does not exist" in (res_missing_src.probe_details[0].drop_reason or "")

    res_missing_dst = probe_simulator.run_health_test(
        ProbeRequest(source="PC1", destination="NonexistentNode", probe_count=2)
    )
    assert res_missing_dst.packet_loss_percentage == 100.0
    assert "does not exist" in (res_missing_dst.probe_details[0].drop_reason or "")

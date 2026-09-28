import pytest
from fastapi.testclient import TestClient

from main import app, topology_engine
from topology.network import NetworkTopology
from failure.signature import FailureSignatureGenerator

client = TestClient(app)


def test_normal_network_has_no_active_failure():
    topology = NetworkTopology()
    generator = FailureSignatureGenerator(topology)

    # Unit check on generator
    sig = generator.generate_signature(source="PC1", destination="Server")
    assert sig is None


def test_api_normal_network_failure_signature():
    # Reset topology to ensure clean state
    client.post("/api/topology/reset")

    response = client.get("/api/failure-signature")
    assert response.status_code == 200
    data = response.json()
    assert data["active"] is False
    assert data["signature"] is None
    assert "No active network failure" in data["message"]


def test_failure_signature_after_failing_r2_r3():
    topology = NetworkTopology()
    generator = FailureSignatureGenerator(topology)

    # Controlled failure of R2 <-> R3
    topology.fail_link("R2", "R3")

    # Generate failure signature with pre-failure baseline path
    sig = generator.generate_signature(
        source="PC1",
        destination="Server",
        baseline_path=["PC1", "R1", "R2", "R3", "Server"],
    )
    assert sig is not None

    # Verify all signature attributes
    assert sig.fault_type == "LINK_FAILURE"
    assert sig.failed_component in ["R2-R3", "R3-R2"]
    assert sig.source == "PC1"
    assert sig.destination == "Server"
    assert sig.baseline_path == ["PC1", "R1", "R2", "R3", "Server"]
    assert sig.reachable is False
    assert sig.packet_loss == 100
    assert sig.path is None
    assert sig.link_state == "down"
    assert sig.routing_change is True


def test_api_failure_signature_after_failing_and_restoring_r2_r3():
    # Reset topology first
    client.post("/api/topology/reset")

    # 1. Fail R2 -> R3 via API
    resp_fail = client.post(
        "/api/topology/fail-link", json={"source": "R2", "destination": "R3"}
    )
    assert resp_fail.status_code == 200

    # 2. Query failure signature
    resp_sig = client.get("/api/failure-signature")
    assert resp_sig.status_code == 200
    data = resp_sig.json()

    assert data["active"] is True
    assert data["fault_type"] == "LINK_FAILURE"
    assert data["failed_component"] in ["R2-R3", "R3-R2"]
    assert data["source"] == "PC1"
    assert data["destination"] == "Server"
    assert data["baseline_path"] == ["PC1", "R1", "R2", "R3", "Server"]
    assert data["reachable"] is False
    assert data["packet_loss"] == 100
    assert data["path"] is None
    assert data["link_state"] == "down"

    # Also verify the nested signature object matches
    assert data["signature"] is not None
    assert data["signature"]["fault_type"] == "LINK_FAILURE"
    assert data["signature"]["failed_component"] in ["R2-R3", "R3-R2"]
    assert data["signature"]["baseline_path"] == ["PC1", "R1", "R2", "R3", "Server"]
    assert data["signature"]["reachable"] is False
    assert data["signature"]["packet_loss"] == 100

    # 3. Restore R2 -> R3 via API
    resp_restore = client.post(
        "/api/topology/restore-link", json={"source": "R2", "destination": "R3"}
    )
    assert resp_restore.status_code == 200

    # 4. Failure state is cleared and normal reachability is restored
    resp_cleared = client.get("/api/failure-signature")
    assert resp_cleared.status_code == 200
    cleared_data = resp_cleared.json()
    assert cleared_data["active"] is False
    assert cleared_data["signature"] is None

    # Normal reachability check
    resp_reach = client.get(
        "/api/topology/reachability?source=PC1&destination=Server"
    )
    assert resp_reach.status_code == 200
    assert resp_reach.json()["reachable"] is True

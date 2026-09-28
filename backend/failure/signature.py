from typing import Optional, List
from pydantic import BaseModel
from topology.network import NetworkTopology


class FailureSignature(BaseModel):
    source: str
    destination: str
    baseline_path: Optional[List[str]] = None
    reachable: bool
    path: Optional[List[str]] = None
    packet_loss: float
    fault_type: str
    failed_component: Optional[str] = None
    routing_change: bool = False
    link_state: str


class FailureSignatureResponse(BaseModel):
    active: bool
    message: str
    signature: Optional[FailureSignature] = None
    # Mirror fields for flat and direct access
    source: Optional[str] = None
    destination: Optional[str] = None
    baseline_path: Optional[List[str]] = None
    reachable: Optional[bool] = None
    path: Optional[List[str]] = None
    packet_loss: Optional[float] = None
    fault_type: Optional[str] = None
    failed_component: Optional[str] = None
    routing_change: Optional[bool] = None
    link_state: Optional[str] = None


class FailureSignatureGenerator:
    """
    Observes the actual network topology and reachability state,
    then generates a structured FailureSignature without hardcoding assumptions.
    """

    def __init__(self, topology: NetworkTopology):
        self.topology = topology

    def generate_signature(
        self,
        source: str = "PC1",
        destination: str = "Server",
        baseline_path: Optional[List[str]] = None,
    ) -> Optional[FailureSignature]:
        # 1. Inspect actual links in the topology for any link with status 'down'
        failed_edges = [
            (u, v, data)
            for u, v, data in self.topology.graph.edges(data=True)
            if data.get("status") == "down"
        ]

        # 2. Inspect nodes in the topology for any node with health_status 'down'
        failed_nodes = [
            (n, data)
            for n, data in self.topology.graph.nodes(data=True)
            if data.get("health_status") == "down"
        ]

        # 3. Inspect interface states
        failed_interfaces = []
        for u, v, data in self.topology.graph.edges(data=True):
            if data.get("interfaces", {}).get(u) == "down":
                failed_interfaces.append((u, v))
            elif data.get("interfaces", {}).get(v) == "down":
                failed_interfaces.append((v, u))

        # If no component is failed, there is no active failure
        if not failed_edges and not failed_nodes and not failed_interfaces:
            return None

        # Determine fault type and failed component
        if failed_edges:
            u, v, data = failed_edges[0]
            failed_comp = f"{u}-{v}" if u <= v else f"{v}-{u}"
            link_state = data.get("status", "down")
            fault_type = "LINK_FAILURE"
        elif failed_nodes:
            n, data = failed_nodes[0]
            failed_comp = n
            link_state = "down"
            fault_type = "NODE_FAILURE"
        else:
            u, v = failed_interfaces[0]
            failed_comp = f"{u}-{v}"
            link_state = "down"
            fault_type = "INTERFACE_FAILURE"

        # Observe actual reachability on the topology
        is_reachable = self.topology.has_path(source, destination)
        observed_path = self.topology.get_path(source, destination)

        # Derive packet_loss from reachability observation (100% loss when unreachable)
        packet_loss = 0.0 if is_reachable else 100.0

        # Routing change indicates disruption/deviation of normal path
        routing_change = not is_reachable

        return FailureSignature(
            source=source,
            destination=destination,
            baseline_path=baseline_path,
            reachable=is_reachable,
            path=observed_path,
            packet_loss=packet_loss,
            fault_type=fault_type,
            failed_component=failed_comp,
            routing_change=routing_change,
            link_state=link_state,
        )

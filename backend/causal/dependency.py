from enum import Enum
from typing import List, Optional
from pydantic import BaseModel
from failure.signature import FailureSignatureGenerator, FailureSignature


class DependencyNodeType(str, Enum):
    PRE_FAILURE_CONNECTIVITY = "PRE_FAILURE_CONNECTIVITY"
    FAULT = "FAULT"
    STATE_CHANGE = "STATE_CHANGE"
    PATH_CHANGE = "PATH_CHANGE"
    REACHABILITY_FAILURE = "REACHABILITY_FAILURE"
    OBSERVATION = "OBSERVATION"


class DependencyRelationship(str, Enum):
    ENABLES = "ENABLES"
    CAUSES = "CAUSES"
    LEADS_TO = "LEADS_TO"
    RESULTS_IN = "RESULTS_IN"


class DependencyNode(BaseModel):
    id: str
    type: DependencyNodeType
    label: str


class DependencyEdge(BaseModel):
    source: str
    target: str
    relationship: DependencyRelationship


class DependencyGraph(BaseModel):
    nodes: List[DependencyNode]
    edges: List[DependencyEdge]


class CausalDependencyResponse(BaseModel):
    active: bool
    message: str
    graph: Optional[DependencyGraph] = None


class CausalDependencyGenerator:
    """
    Constructs a directed causal dependency graph connecting the observed
    network fault to the downstream failure events.
    """

    def __init__(self, failure_generator: FailureSignatureGenerator):
        self.failure_generator = failure_generator

    def generate_dependencies(
        self,
        source: str = "PC1",
        destination: str = "Server",
        baseline_path: Optional[List[str]] = None,
    ) -> Optional[DependencyGraph]:
        # Observe the current network failure state
        sig: Optional[FailureSignature] = self.failure_generator.generate_signature(
            source=source, destination=destination, baseline_path=baseline_path
        )

        # If no active failure is observed, return None
        if sig is None or sig.reachable:
            return None

        # Build causal dependency chain from actual observed fault and state
        failed_comp = sig.failed_component or "Unknown"

        # 1. Fault Node
        if sig.fault_type == "NODE_FAILURE":
            fault_label = f"{failed_comp} Router Node Failure"
            state_label = f"{failed_comp} Operational State Down"
        elif sig.fault_type == "INTERFACE_FAILURE":
            fault_label = f"{failed_comp} Interface Failure"
            state_label = f"{failed_comp} Interface State Down"
        else:
            fault_label = f"{failed_comp} Link Failure"
            state_label = f"{failed_comp} Link State Down"

        fault_node = DependencyNode(
            id=f"fault:{failed_comp}",
            type=DependencyNodeType.FAULT,
            label=fault_label,
        )

        # 2. State Change Node
        state_node = DependencyNode(
            id=f"state:{failed_comp}",
            type=DependencyNodeType.STATE_CHANGE,
            label=state_label,
        )

        # 3. Path Change Node
        path_node = DependencyNode(
            id=f"path:{sig.source}-{sig.destination}",
            type=DependencyNodeType.PATH_CHANGE,
            label=f"{sig.source} → {sig.destination} Path Unavailable",
        )

        # 4. Reachability Failure Node
        reachability_node = DependencyNode(
            id=f"reachability:{sig.source}-{sig.destination}",
            type=DependencyNodeType.REACHABILITY_FAILURE,
            label=f"{sig.source} → {sig.destination} Unreachable",
        )

        # 5. Observation Node
        obs_node = DependencyNode(
            id=f"obs:packet_loss:{sig.source}-{sig.destination}",
            type=DependencyNodeType.OBSERVATION,
            label=f"{int(sig.packet_loss)}% Packet Loss",
        )

        nodes: List[DependencyNode] = [
            fault_node,
            state_node,
            path_node,
            reachability_node,
            obs_node,
        ]

        # Connect the downstream causal chain with directed relationships
        edges: List[DependencyEdge] = [
            DependencyEdge(
                source=fault_node.id,
                target=state_node.id,
                relationship=DependencyRelationship.CAUSES,
            ),
            DependencyEdge(
                source=state_node.id,
                target=path_node.id,
                relationship=DependencyRelationship.LEADS_TO,
            ),
            DependencyEdge(
                source=path_node.id,
                target=reachability_node.id,
                relationship=DependencyRelationship.RESULTS_IN,
            ),
            DependencyEdge(
                source=reachability_node.id,
                target=obs_node.id,
                relationship=DependencyRelationship.RESULTS_IN,
            ),
        ]

        # Context: Pre-failure connectivity before the fault occurred
        if sig.baseline_path is not None:
            pre_node = DependencyNode(
                id=f"pre_failure:{sig.source}-{sig.destination}",
                type=DependencyNodeType.PRE_FAILURE_CONNECTIVITY,
                label=f"Pre-Failure Path: {' → '.join(sig.baseline_path)}",
            )
            pre_edge = DependencyEdge(
                source=pre_node.id,
                target=fault_node.id,
                relationship=DependencyRelationship.ENABLES,
            )
            nodes.insert(0, pre_node)
            edges.insert(0, pre_edge)

        return DependencyGraph(nodes=nodes, edges=edges)

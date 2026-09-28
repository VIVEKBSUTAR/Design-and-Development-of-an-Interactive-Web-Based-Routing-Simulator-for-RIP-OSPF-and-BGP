"""
Fault Injection Service for Module 3.
Provides explicit, controlled, reversible network fault simulation.
Ensures strict separation between injected ground-truth faults and diagnostic inference.
"""

import uuid
import time
from typing import Dict, List, Optional, Any
from topology.network import NetworkTopology
from diagnosis.models import (
    FaultType,
    FaultScenario,
    FaultInjectionRequest,
)


class FaultInjectionEngine:
    """
    Manages controlled, reversible network fault scenarios.
    Tracks active faults, validates network targets, and restores topology state safely.
    """

    def __init__(self, topology: NetworkTopology):
        self.topology = topology
        self.active_faults: Dict[str, FaultScenario] = {}

    def get_available_scenarios(self) -> List[Dict[str, Any]]:
        """
        Pre-configured standard controlled test scenarios for demonstration and benchmarking.
        """
        return [
            {
                "id": "scenario-link-r2-r3",
                "name": "R2-R3 Link Sever (Core Trunk Failure)",
                "fault_type": FaultType.LINK_FAILURE,
                "target_link": "R2-R3",
                "description": "Sever physical optical trunk between routers R2 and R3. Isolates Server while preserving branch PC1->PC2.",
                "scope": "PARTITIONED",
            },
            {
                "id": "scenario-node-r3",
                "name": "R3 Router Power Failure (Node Crash)",
                "fault_type": FaultType.NODE_FAILURE,
                "target_node": "R3",
                "description": "Complete power supply failure on router R3. All incident links and forwarding services drop.",
                "scope": "PARTITIONED",
            },
            {
                "id": "scenario-iface-r3-r2",
                "name": "R3 Ingress Interface Port Failure",
                "fault_type": FaultType.INTERFACE_FAILURE,
                "target_interface_node": "R3",
                "target_interface_remote": "R2",
                "description": "Administrative shutdown or PHY transceiver failure on R3 interface facing R2. Cable carrier may remain intact.",
                "scope": "PARTITIONED",
            },
            {
                "id": "scenario-link-r2-r4",
                "name": "R2-R4 Branch Link Sever",
                "fault_type": FaultType.LINK_FAILURE,
                "target_link": "R2-R4",
                "description": "Sever branch link to router R4. Isolates PC2 while keeping primary PC1->Server path intact.",
                "scope": "LOCALIZED",
            },
            {
                "id": "scenario-node-r2",
                "name": "R2 Transit Router Failure",
                "fault_type": FaultType.NODE_FAILURE,
                "target_node": "R2",
                "description": "Catastrophic failure of central distribution router R2. Partitions both Server and PC2 branches.",
                "scope": "WIDESPREAD",
            },
        ]

    def get_active_faults(self) -> List[FaultScenario]:
        """Returns all currently active fault conditions."""
        return list(self.active_faults.values())

    def inject_fault(self, request: FaultInjectionRequest) -> FaultScenario:
        """
        Safely injects a controlled fault into the live network topology.
        Maintains reversal metadata for deterministic rollback.
        """
        fault_id = f"FLT-{uuid.uuid4().hex[:6].upper()}"

        if request.fault_type == FaultType.LINK_FAILURE:
            if not request.target_link:
                raise ValueError("target_link is required for LINK_FAILURE")
            
            parts = request.target_link.split("-")
            if len(parts) != 2:
                raise ValueError(f"Invalid link format '{request.target_link}', expected 'NodeA-NodeB'")
            u, v = parts[0].strip(), parts[1].strip()

            if not self.topology.graph.has_edge(u, v):
                raise ValueError(f"Link between '{u}' and '{v}' does not exist in topology")

            prev_status = self.topology.get_link_status(u, v)
            success = self.topology.fail_link(u, v)
            if not success:
                raise RuntimeError(f"Failed to apply link failure on {u}-{v}")

            scenario = FaultScenario(
                fault_id=fault_id,
                fault_type=FaultType.LINK_FAILURE,
                target_link=f"{min(u, v)}-{max(u, v)}",
                description=f"Link {u} <-> {v} marked as DOWN (carrier lost)",
                is_active=True,
                metadata={"previous_status": prev_status, "endpoints": (u, v)},
            )

        elif request.fault_type == FaultType.NODE_FAILURE:
            if not request.target_node:
                raise ValueError("target_node is required for NODE_FAILURE")
            node = request.target_node.strip()

            if not self.topology.has_node(node):
                raise ValueError(f"Node '{node}' does not exist in topology")

            prev_health = self.topology.get_node_status(node)
            success = self.topology.fail_node(node)
            if not success:
                raise RuntimeError(f"Failed to apply node failure on {node}")

            scenario = FaultScenario(
                fault_id=fault_id,
                fault_type=FaultType.NODE_FAILURE,
                target_node=node,
                description=f"Node {node} powered DOWN / unresponsive",
                is_active=True,
                metadata={"previous_health": prev_health},
            )

        elif request.fault_type == FaultType.INTERFACE_FAILURE:
            if not request.target_interface_node or not request.target_interface_remote:
                raise ValueError("target_interface_node and target_interface_remote are required for INTERFACE_FAILURE")
            node = request.target_interface_node.strip()
            remote = request.target_interface_remote.strip()

            if not self.topology.graph.has_edge(node, remote):
                raise ValueError(f"No interface exists on '{node}' facing '{remote}'")

            prev_iface = self.topology.get_interface_status(node, remote)
            success = self.topology.fail_interface(node, remote)
            if not success:
                raise RuntimeError(f"Failed to disable interface on {node} facing {remote}")

            scenario = FaultScenario(
                fault_id=fault_id,
                fault_type=FaultType.INTERFACE_FAILURE,
                target_node=node,
                target_link=f"{min(node, remote)}-{max(node, remote)}",
                target_interface_node=node,
                target_interface_remote=remote,
                description=f"Interface on {node} facing {remote} administratively DOWN",
                is_active=True,
                metadata={"previous_interface_status": prev_iface, "node": node, "remote": remote},
            )

        elif request.fault_type in (FaultType.PACKET_LOSS, FaultType.PACKET_DELAY):
            # Extension hook for packet impairment parameters
            params = request.parameters or {}
            scenario = FaultScenario(
                fault_id=fault_id,
                fault_type=request.fault_type,
                target_link=request.target_link,
                target_node=request.target_node,
                description=f"Impairment {request.fault_type} configured with {params}",
                is_active=True,
                metadata={"parameters": params},
            )
        else:
            raise ValueError(f"Unsupported fault type: {request.fault_type}")

        self.active_faults[scenario.fault_id] = scenario
        return scenario

    def restore_fault(self, fault_id: str) -> bool:
        """
        Reverts a specific active fault and restores affected components to operational status.
        """
        if fault_id not in self.active_faults:
            return False

        scenario = self.active_faults[fault_id]

        if scenario.fault_type == FaultType.LINK_FAILURE:
            if scenario.target_link:
                u, v = scenario.target_link.split("-")
                self.topology.restore_link(u.strip(), v.strip())

        elif scenario.fault_type == FaultType.NODE_FAILURE:
            if scenario.target_node:
                self.topology.restore_node(scenario.target_node)

        elif scenario.fault_type == FaultType.INTERFACE_FAILURE:
            if scenario.target_interface_node and scenario.target_interface_remote:
                self.topology.restore_interface(
                    scenario.target_interface_node,
                    scenario.target_interface_remote,
                )

        del self.active_faults[fault_id]
        return True

    def restore_all_faults(self) -> int:
        """
        Restores all active injected faults, returning the count of restored conditions.
        """
        fault_ids = list(self.active_faults.keys())
        for fid in fault_ids:
            self.restore_fault(fid)
        
        # Ensure topology components are fully normalized
        for u, v in self.topology.graph.edges():
            self.topology.restore_link(u, v)
            self.topology.restore_interface(u, v)
            self.topology.restore_interface(v, u)

        for n in self.topology.graph.nodes():
            self.topology.restore_node(n)

        return len(fault_ids)

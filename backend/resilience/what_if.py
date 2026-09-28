"""
Lightweight What-If Resilience Engine (Module 4).
Evaluates prospective failure scenarios on arbitrary components (links or nodes)
without permanently mutating the active topology.
Reuses Module 1 (NetworkIntelligenceEngine) and Module 3 (ImpactAnalysisEngine).
"""

from typing import List, Optional
import networkx as nx
from topology.network import NetworkTopology
from intelligence.engine import NetworkIntelligenceEngine
from resilience.models import WhatIfRequest, WhatIfResponse, WhatIfFlowSummary


class WhatIfResilienceEngine:
    def __init__(
        self,
        topology: NetworkTopology,
        intelligence_engine: NetworkIntelligenceEngine,
    ):
        self.topology = topology
        self.intelligence_engine = intelligence_engine

    def simulate_what_if(self, request: WhatIfRequest) -> WhatIfResponse:
        """
        Simulates what happens if a specific component fails:
        1. Capture pre-fault baseline path and reachability for the primary flow.
        2. Take a non-destructive snapshot of the topology.
        3. Introduce the prospective fault in the snapshot sandbox.
        4. Re-calculate primary flow reachability and alternate paths using Module 1.
        5. Evaluate all flows across host/server endpoints to quantify network-wide impact.
        6. Restore topology immediately to maintain pristine baseline.
        """
        src = request.source
        dst = request.destination
        target = request.target_component.strip()
        target_type = request.target_type.upper().strip()

        # Step 1: Pre-fault state
        before_reachable = self.topology.has_path(src, dst)
        before_path = self.topology.get_path(src, dst) if before_reachable else []

        # Find endpoints in network
        nodes = self.topology.get_topology_data().nodes
        endpoint_ids = [n.id for n in nodes if n.type in ("host", "server")]
        if not endpoint_ids:
            endpoint_ids = [n.id for n in nodes]

        # Step 2: Take snapshot to sandbox prospective failure
        snapshot = self.topology.snapshot()

        try:
            # Step 3: Inject prospective fault
            if target_type == "LINK" or "-" in target:
                parts = target.split("-")
                if len(parts) == 2:
                    u, v = parts[0].strip(), parts[1].strip()
                    if self.topology.graph.has_edge(u, v):
                        self.topology.fail_link(u, v)
                    elif self.topology.graph.has_edge(v, u):
                        self.topology.fail_link(v, u)
            elif target_type == "NODE":
                if self.topology.has_node(target):
                    self.topology.fail_node(target)
            elif target_type == "INTERFACE":
                parts = target.split("-")
                if len(parts) == 2:
                    u, v = parts[0].strip(), parts[1].strip()
                    self.topology.fail_interface(u, v)

            # Step 4: Evaluate post-fault state for primary flow
            after_reachable = self.topology.has_path(src, dst)
            after_path = self.topology.get_path(src, dst) if after_reachable else None

            # Alternate paths check
            alt_res = self.intelligence_engine.get_alternate_paths(src, dst)
            alternate_paths = [p.hops for p in (alt_res.alternate_paths or [])]
            has_alternate_path = len(alternate_paths) > 0 and after_reachable

            # Step 5: Evaluate all endpoint pairs for blast radius
            affected_flows: List[WhatIfFlowSummary] = []
            unaffected_flows: List[WhatIfFlowSummary] = []

            for u in endpoint_ids:
                for v in endpoint_ids:
                    if u >= v:
                        continue
                    # Baseline path
                    orig_reach = (
                        snapshot.has_node(u)
                        and snapshot.has_node(v)
                        and nx.has_path(snapshot, u, v)
                    )
                    orig_p = nx.shortest_path(snapshot, u, v) if orig_reach else []
                    
                    # Current path in sandbox
                    curr_reach = self.topology.has_path(u, v)
                    curr_p = self.topology.get_path(u, v) if curr_reach else None

                    if orig_reach and not curr_reach:
                        status = "DISRUPTED"
                        affected_flows.append(WhatIfFlowSummary(
                            source=u,
                            destination=v,
                            before_path=orig_p,
                            after_path=None,
                            status=status,
                        ))
                    elif orig_reach and curr_reach and curr_p != orig_p:
                        status = "REROUTED"
                        affected_flows.append(WhatIfFlowSummary(
                            source=u,
                            destination=v,
                            before_path=orig_p,
                            after_path=curr_p,
                            status=status,
                        ))
                    else:
                        unaffected_flows.append(WhatIfFlowSummary(
                            source=u,
                            destination=v,
                            before_path=orig_p,
                            after_path=curr_p,
                            status="HEALTHY",
                        ))

            # Failure scope classification aligned with Module 3 ImpactAnalysis
            total_evaluated = len(affected_flows) + len(unaffected_flows)
            affected_count = len(affected_flows)
            if affected_count == 0:
                scope = "NONE"
            elif affected_count <= 2:
                scope = "LOCALIZED"
            elif len(unaffected_flows) > 0 and affected_count <= (total_evaluated * 0.75):
                scope = "PARTITIONED"
            else:
                scope = "WIDESPREAD"

            # Primary flow summary
            if before_reachable and not after_reachable:
                prim_status = "DISRUPTED"
                assessment = f"Failure on {target} severely breaks reachability between {src} and {dst} with NO alternate path."
            elif before_reachable and after_reachable and after_path != before_path:
                prim_status = "REROUTED"
                assessment = f"Resilient: Network dynamically reroutes {src} -> {dst} via alternate path: {' -> '.join(after_path or [])}."
            elif before_reachable and after_reachable:
                prim_status = "HEALTHY"
                assessment = f"Topology is resilient: Primary path for {src} -> {dst} is entirely independent of {target}."
            else:
                prim_status = "DISRUPTED"
                assessment = f"Flow was already unreachable prior to prospective failure."

            primary_flow = WhatIfFlowSummary(
                source=src,
                destination=dst,
                before_path=before_path,
                after_path=after_path,
                status=prim_status,
            )

            return WhatIfResponse(
                target_component=target,
                target_type=target_type,
                source=src,
                destination=dst,
                before_reachable=before_reachable,
                before_path=before_path,
                after_reachable=after_reachable,
                after_path=after_path,
                has_alternate_path=has_alternate_path,
                alternate_paths=alternate_paths,
                affected_flows_count=len(affected_flows),
                unaffected_flows_count=len(unaffected_flows),
                affected_flows=affected_flows,
                unaffected_flows=unaffected_flows,
                failure_scope=scope,
                resilience_assessment=assessment,
            )

        finally:
            # Step 6: Restore pristine snapshot state
            self.topology.restore_snapshot(snapshot)

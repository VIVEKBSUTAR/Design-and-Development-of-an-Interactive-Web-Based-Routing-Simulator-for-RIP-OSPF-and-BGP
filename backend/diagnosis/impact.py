"""
Failure Impact Analysis Engine for Module 3.
Consumes Module 1's NetworkIntelligenceEngine to compute network-wide flow reachability,
segregating affected and surviving flows, and classifying failure blast radius scope.
"""

from typing import List, Optional
from topology.network import NetworkTopology, NodeType
from intelligence.engine import NetworkIntelligenceEngine
from diagnosis.models import (
    ImpactAnalysisResult,
    ImpactedFlow,
    FailureScope,
)


class ImpactAnalysisEngine:
    """
    Evaluates topological reachability and flow dependencies to quantify
    the blast radius of active network failures without modifying simulation state.
    """

    def __init__(self, topology: NetworkTopology, intelligence: NetworkIntelligenceEngine):
        self.topology = topology
        self.intelligence = intelligence

    def analyze_impact(
        self,
        suspected_components: Optional[List[str]] = None,
    ) -> ImpactAnalysisResult:
        """
        Calculates network-wide reachability impact across all host/server endpoints.
        """
        # Discover all eligible host and server endpoints
        endpoints = [
            n for n, d in self.topology.graph.nodes(data=True)
            if d.get("type") in (NodeType.HOST, NodeType.SERVER, "Host", "Server")
        ]
        endpoints.sort()

        total_flows = 0
        affected_flows: List[ImpactedFlow] = []
        unaffected_flows: List[ImpactedFlow] = []
        isolated_endpoints = set()

        for src in endpoints:
            for dst in endpoints:
                if src == dst:
                    continue
                total_flows += 1

                # Query path via Module 1
                path_res = self.intelligence.analyze_path(src, dst)

                traverses = False
                if suspected_components and path_res.nodes_traversed:
                    for comp in suspected_components:
                        clean_comp = comp.replace("Link ", "").replace("Node ", "").replace("Interface ", "")
                        if "-" in clean_comp:
                            parts = clean_comp.split("-")
                            if len(parts) == 2 and parts[0] in path_res.nodes_traversed and parts[1] in path_res.nodes_traversed:
                                traverses = True
                        elif clean_comp in path_res.nodes_traversed:
                            traverses = True

                if path_res.reachable:
                    unaffected_flows.append(
                        ImpactedFlow(
                            source=src,
                            destination=dst,
                            status="HEALTHY",
                            path=path_res.nodes_traversed,
                            hops=path_res.hop_count,
                            traverses_failed_component=False,
                        )
                    )
                else:
                    affected_flows.append(
                        ImpactedFlow(
                            source=src,
                            destination=dst,
                            status="FAILED",
                            path=path_res.nodes_traversed,
                            hops=path_res.hop_count,
                            traverses_failed_component=traverses or True,
                        )
                    )
                    isolated_endpoints.add(dst)

        # Classify failure blast radius
        affected_count = len(affected_flows)
        if affected_count == 0:
            scope = FailureScope.NONE
            summary = "Network fully operational. 100% of host-to-host communication flows are healthy."
        elif affected_count <= 2:
            scope = FailureScope.LOCALIZED
            summary = f"Localized impact: {affected_count}/{total_flows} flows disrupted. Branch connectivity remains operational."
        elif len(unaffected_flows) > 0 and affected_count <= (total_flows * 0.75):
            scope = FailureScope.PARTITIONED
            summary = f"Partitioned network: {affected_count}/{total_flows} flows severed. Isolated endpoints: {', '.join(sorted(isolated_endpoints))}."
        else:
            scope = FailureScope.WIDESPREAD
            summary = f"Widespread network outage: {affected_count}/{total_flows} flows disrupted across multiple subnets."

        return ImpactAnalysisResult(
            failure_scope=scope,
            failed_components=suspected_components or [],
            total_flows_evaluated=total_flows,
            affected_flows_count=affected_count,
            unaffected_flows_count=len(unaffected_flows),
            affected_flows=affected_flows,
            unaffected_flows=unaffected_flows,
            isolated_endpoints=sorted(list(isolated_endpoints)),
            summary=summary,
        )

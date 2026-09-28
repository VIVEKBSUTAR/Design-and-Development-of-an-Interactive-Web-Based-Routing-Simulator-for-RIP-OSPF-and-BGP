"""
Network Intelligence Engine for Module 1.
Provides graph-theoretic path computation, alternate route evaluation,
path diff comparisons, reachability matrix computation, and component flow dependency tracking.
"""

from typing import List, Dict, Optional, Tuple, Set, Any
import networkx as nx

from topology.network import NetworkTopology, NodeType
from intelligence.models import (
    PathInfo,
    PathQueryResponse,
    AlternatePathsResponse,
    PathComparisonResponse,
    ReachabilityCell,
    ReachabilityMatrixResponse,
    DependentFlow,
    ComponentDependencyResponse,
)
from intelligence.strategy import (
    PathSelectionStrategy,
    DeterministicShortestPathStrategy,
)


class NetworkIntelligenceEngine:
    """
    Central path computation and network intelligence service.
    Operates on live NetworkTopology graphs with deterministic routing strategies.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        strategy: Optional[PathSelectionStrategy] = None,
    ):
        self.topology = topology
        self.strategy = strategy or DeterministicShortestPathStrategy()

    # =========================================================================
    # 1. Primary Path Computation
    # =========================================================================

    def analyze_path(self, source: str, destination: str) -> PathQueryResponse:
        """
        Analyzes active forwarding route between source and destination.
        Returns hop sequence, interface links traversed, bottlenecks, and alternate path counts.
        """
        if not self.topology.has_node(source) or not self.topology.has_node(destination):
            return PathQueryResponse(
                source=source,
                destination=destination,
                reachable=False,
                primary_path=None,
                hop_count=0,
                selection_rule=self.strategy.strategy_name,
            )

        active_path = self.strategy.select_path(source, destination, self.topology.graph)
        all_candidate_paths = self.strategy.find_all_candidate_paths(source, destination, self.topology.graph)

        if not active_path:
            return PathQueryResponse(
                source=source,
                destination=destination,
                reachable=False,
                primary_path=None,
                hop_count=0,
                alternate_paths_available=max(0, len(all_candidate_paths)),
                selection_rule=self.strategy.strategy_name,
            )

        links = [f"{active_path[i]}-{active_path[i+1]}" for i in range(len(active_path) - 1)]
        hop_count = len(active_path) - 1

        # Check for bridge links (critical cut-edges along active path)
        bottlenecks = self._identify_path_bottlenecks(active_path)

        path_info = PathInfo(
            path_id="primary",
            hops=active_path,
            hop_count=hop_count,
            links=links,
            status="active",
            is_primary=True,
            cost=float(hop_count),
        )

        # Count candidate alternates (excluding the active primary path)
        alternate_count = max(0, len(all_candidate_paths) - 1)

        return PathQueryResponse(
            source=source,
            destination=destination,
            reachable=True,
            primary_path=path_info,
            hop_count=hop_count,
            nodes_traversed=active_path,
            links_traversed=links,
            path_cost=float(hop_count),
            alternate_paths_available=alternate_count,
            selection_rule=self.strategy.strategy_name,
            bottlenecks=bottlenecks,
        )

    # =========================================================================
    # 2. Alternate Path Discovery & Redundancy Analysis
    # =========================================================================

    def get_alternate_paths(self, source: str, destination: str) -> AlternatePathsResponse:
        """
        Discovers all physical candidate loop-free paths between source and destination,
        classifying their operational status (active vs blocked).
        """
        if not self.topology.has_node(source) or not self.topology.has_node(destination):
            return AlternatePathsResponse(
                source=source,
                destination=destination,
                reachable=False,
                redundancy_status="NONE",
            )

        all_candidates = self.strategy.find_all_candidate_paths(source, destination, self.topology.graph)
        active_primary = self.strategy.select_path(source, destination, self.topology.graph)

        primary_info: Optional[PathInfo] = None
        alternate_infos: List[PathInfo] = []
        active_alternates_count = 0

        for idx, candidate in enumerate(all_candidates):
            is_primary = candidate == active_primary
            links = [f"{candidate[i]}-{candidate[i+1]}" for i in range(len(candidate) - 1)]
            hop_count = len(candidate) - 1

            # Check if all links and nodes in this candidate path are active
            is_active = True
            for i in range(len(candidate) - 1):
                u, v = candidate[i], candidate[i + 1]
                if self.topology.get_link_status(u, v) != "up":
                    is_active = False
                    break
                if self.topology.graph.nodes[u].get("health_status", "up") == "down":
                    is_active = False
                    break
                if self.topology.graph.nodes[v].get("health_status", "up") == "down":
                    is_active = False
                    break

            status = "active" if is_active else "blocked"

            path_obj = PathInfo(
                path_id="primary" if is_primary else f"alt-{idx}",
                hops=candidate,
                hop_count=hop_count,
                links=links,
                status=status,
                is_primary=is_primary,
                cost=float(hop_count),
            )

            if is_primary:
                primary_info = path_obj
            else:
                alternate_infos.append(path_obj)
                if is_active:
                    active_alternates_count += 1

        total_physical = len(all_candidates)
        if total_physical <= 1:
            redundancy = "NONE"
        elif active_alternates_count >= 1:
            redundancy = "HIGH"
        else:
            redundancy = "PARTIAL"

        return AlternatePathsResponse(
            source=source,
            destination=destination,
            reachable=active_primary is not None,
            primary_path=primary_info,
            alternate_paths=alternate_infos,
            total_physical_paths=total_physical,
            active_alternate_paths=active_alternates_count,
            redundancy_status=redundancy,
        )

    # =========================================================================
    # 3. Path Comparison
    # =========================================================================

    def compare_paths(self, path_a: List[str], path_b: List[str]) -> PathComparisonResponse:
        """
        Performs structured topological comparison between two paths.
        Identifies common/unique nodes, common/unique links, and shared dependency points.
        """
        hop_a = max(0, len(path_a) - 1)
        hop_b = max(0, len(path_b) - 1)

        links_a = [f"{path_a[i]}-{path_a[i+1]}" for i in range(len(path_a) - 1)]
        links_b = [f"{path_b[i]}-{path_b[i+1]}" for i in range(len(path_b) - 1)]

        # Canonical edge sets (undirected)
        def canonical_edge(e: str) -> str:
            u, v = e.split("-", 1)
            return f"{min(u, v)}-{max(u, v)}"

        edges_set_a = {canonical_edge(e) for e in links_a}
        edges_set_b = {canonical_edge(e) for e in links_b}

        common_edges = edges_set_a.intersection(edges_set_b)
        unique_edges_a = edges_set_a - edges_set_b
        unique_edges_b = edges_set_b - edges_set_a

        nodes_set_a = set(path_a)
        nodes_set_b = set(path_b)

        common_nodes = [n for n in path_a if n in nodes_set_b]
        unique_nodes_a = [n for n in path_a if n not in nodes_set_b]
        unique_nodes_b = [n for n in path_b if n not in nodes_set_a]

        # Shared intermediate routers that both paths depend on (excluding src & dst)
        src = path_a[0] if path_a else None
        dst = path_a[-1] if path_a else None
        shared_dependencies = [n for n in common_nodes if n != src and n != dst]

        # Similarity calculation (Jaccard index of edges)
        total_union_edges = len(edges_set_a.union(edges_set_b))
        sim_pct = round((len(common_edges) / total_union_edges) * 100.0, 1) if total_union_edges > 0 else 100.0

        return PathComparisonResponse(
            path_a=path_a,
            path_b=path_b,
            hop_count_a=hop_a,
            hop_count_b=hop_b,
            hop_difference=abs(hop_a - hop_b),
            common_nodes=common_nodes,
            common_links=list(common_edges),
            unique_nodes_a=unique_nodes_a,
            unique_nodes_b=unique_nodes_b,
            unique_links_a=list(unique_edges_a),
            unique_links_b=list(unique_edges_b),
            shared_dependency_points=shared_dependencies,
            similarity_percentage=sim_pct,
        )

    # =========================================================================
    # 4. Network Reachability Matrix
    # =========================================================================

    def get_reachability_matrix(
        self, endpoint_types: Optional[List[NodeType]] = None
    ) -> ReachabilityMatrixResponse:
        """
        Computes full pairwise reachability matrix across all host/server endpoints.
        Dynamically updates when links or nodes fail.
        """
        # Default endpoint filtering: Hosts and Servers
        if endpoint_types is None:
            endpoint_types = [NodeType.HOST, NodeType.SERVER]

        endpoints = [
            n for n, d in self.topology.graph.nodes(data=True)
            if d.get("type") in endpoint_types or d.get("type") in [t.value for t in endpoint_types]
        ]
        # If no hosts/servers found, fall back to all nodes
        if len(endpoints) < 2:
            endpoints = list(self.topology.graph.nodes)

        endpoints.sort()

        matrix: Dict[str, Dict[str, ReachabilityCell]] = {}
        total_pairs = 0
        reachable_pairs = 0
        unreachable_pairs = 0

        for u in endpoints:
            matrix[u] = {}
            for v in endpoints:
                if u == v:
                    matrix[u][v] = ReachabilityCell(
                        source=u,
                        destination=v,
                        status="SAME_NODE",
                        hop_count=0,
                        path=[u],
                    )
                else:
                    total_pairs += 1
                    path = self.strategy.select_path(u, v, self.topology.graph)
                    if path:
                        reachable_pairs += 1
                        matrix[u][v] = ReachabilityCell(
                            source=u,
                            destination=v,
                            status="REACHABLE",
                            hop_count=len(path) - 1,
                            path=path,
                        )
                    else:
                        unreachable_pairs += 1
                        matrix[u][v] = ReachabilityCell(
                            source=u,
                            destination=v,
                            status="UNREACHABLE",
                            hop_count=None,
                            path=None,
                        )

        health_pct = round((reachable_pairs / total_pairs) * 100.0, 1) if total_pairs > 0 else 100.0

        return ReachabilityMatrixResponse(
            endpoints=endpoints,
            matrix=matrix,
            total_pairs=total_pairs,
            reachable_pairs=reachable_pairs,
            unreachable_pairs=unreachable_pairs,
            network_health_percentage=health_pct,
        )

    # =========================================================================
    # 5. Component Flow Dependency & Impact Analysis
    # =========================================================================

    def analyze_component_dependencies(
        self, component_type: str, component_id: str
    ) -> ComponentDependencyResponse:
        """
        Determines which active network flows depend on a specific link or node.
        Identifies whether bypass alternate routes exist if the component fails.
        """
        comp_type = component_type.lower()
        status = "up"

        # Resolve component status
        if comp_type == "link":
            if "-" in component_id:
                u, v = component_id.split("-", 1)
            else:
                u, v = component_id.split(" ", 1)
            status = self.topology.get_link_status(u, v) or "unknown"
            canonical_target = f"{min(u, v)}-{max(u, v)}"
        else:
            if self.topology.has_node(component_id):
                status = self.topology.graph.nodes[component_id].get("health_status", "up")
            else:
                status = "unknown"
            canonical_target = component_id

        # Discover all host/server endpoints
        endpoints = [
            n for n, d in self.topology.graph.nodes(data=True)
            if d.get("type") in [NodeType.HOST, NodeType.SERVER, "Host", "Server"]
        ]
        if len(endpoints) < 2:
            endpoints = list(self.topology.graph.nodes)

        dependent_flows: List[DependentFlow] = []
        has_bypass_for_all = True

        for i in range(len(endpoints)):
            for j in range(len(endpoints)):
                if i == j:
                    continue
                src = endpoints[i]
                dst = endpoints[j]

                # Active primary path
                active_path = self.strategy.select_path(src, dst, self.topology.graph)
                if not active_path:
                    continue

                uses_component = False
                if comp_type == "link":
                    links = [f"{min(active_path[k], active_path[k+1])}-{max(active_path[k], active_path[k+1])}"
                             for k in range(len(active_path) - 1)]
                    if canonical_target in links:
                        uses_component = True
                else:
                    if component_id in active_path:
                        uses_component = True

                if uses_component:
                    dependent_flows.append(
                        DependentFlow(
                            source=src,
                            destination=dst,
                            path=active_path,
                            hops=len(active_path) - 1,
                        )
                    )

                    # Check if alternate bypass exists if component is temporarily disabled
                    temp_graph = self.topology.graph.copy()
                    if comp_type == "link":
                        temp_graph[u][v]["status"] = "down"
                    else:
                        temp_graph.nodes[component_id]["health_status"] = "down"

                    bypass_path = self.strategy.select_path(src, dst, temp_graph)
                    if not bypass_path:
                        has_bypass_for_all = False

        flow_count = len(dependent_flows)
        if flow_count == 0:
            criticality = "LOW"
            summary = f"No active endpoint flows currently traverse {comp_type} '{component_id}'."
        elif not has_bypass_for_all:
            criticality = "HIGH"
            summary = f"CRITICAL: {flow_count} active traffic flows depend on {comp_type} '{component_id}'. No topological bypass available."
        else:
            criticality = "MEDIUM"
            summary = f"{flow_count} active flows depend on {comp_type} '{component_id}', but redundant bypass paths are available."

        return ComponentDependencyResponse(
            component_type=comp_type,
            component_id=component_id,
            status=status,
            dependent_flows=dependent_flows,
            dependent_flow_count=flow_count,
            has_alternate_bypass=has_bypass_for_all if flow_count > 0 else True,
            criticality=criticality,
            summary=summary,
        )

    # -------------------------------------------------------------------------
    # Helper: Bottleneck Identification
    # -------------------------------------------------------------------------
    def _identify_path_bottlenecks(self, path: List[str]) -> List[str]:
        """Identifies bridge links along the active forwarding path."""
        bottlenecks: List[str] = []
        active_edges = [
            (u, v) for u, v, d in self.topology.graph.edges(data=True)
            if d.get("status", "up") == "up"
        ]
        active_subgraph = self.topology.graph.edge_subgraph(active_edges).copy()

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            if active_subgraph.has_edge(u, v):
                active_subgraph.remove_edge(u, v)
                if not nx.has_path(active_subgraph, path[0], path[-1]):
                    bottlenecks.append(f"{u}-{v}")
                active_subgraph.add_edge(u, v)
        return bottlenecks

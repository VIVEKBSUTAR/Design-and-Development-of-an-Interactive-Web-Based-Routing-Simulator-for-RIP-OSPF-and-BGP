"""
Routing & Path Selection Strategy Architecture for Module 1.
Provides an extensible strategy pattern for deterministic path resolution,
prepared for future routing protocol plug-ins (RIP, OSPF, BGP).
"""

from abc import ABC, abstractmethod
from typing import List, Optional
import networkx as nx


class PathSelectionStrategy(ABC):
    """
    Abstract routing strategy interface.
    Decouples network intelligence algorithms from specific routing protocol logic.
    """

    @property
    @abstractmethod
    def strategy_name(self) -> str:
        """Human-readable identifier for the routing algorithm."""
        pass

    @abstractmethod
    def select_path(
        self, source: str, destination: str, graph: nx.Graph
    ) -> Optional[List[str]]:
        """
        Determines the optimal forwarding path between source and destination.
        Returns a list of node IDs forming the hop sequence, or None if unreachable.
        """
        pass

    @abstractmethod
    def find_all_candidate_paths(
        self, source: str, destination: str, graph: nx.Graph, cutoff: int = 10
    ) -> List[List[str]]:
        """
        Finds all simple physical loop-free paths between source and destination.
        """
        pass


class DeterministicShortestPathStrategy(PathSelectionStrategy):
    """
    Deterministic Shortest Path Strategy (Default Engine).

    ALGORITHM SPECIFICATION:
    1. Evaluates all active links in the topology graph.
    2. Identifies all paths matching the minimum hop count distance.
    3. TIE-BREAKING RULE: If multiple equal-cost shortest paths exist, ties are
       broken deterministically by lexicographical ordering of the intermediate
       node identifiers (e.g. sorting paths as tuples: ('R1', 'R2') < ('R1', 'R4')).
    4. Guarantees 100% deterministic, reproducible path resolution without stochastic
       or ML-based variance.

    FUTURE EXPANSION HOOKS:
    - RIPStrategy: Vector-distance algorithm with 15-hop limit and periodic split-horizon.
    - OSPFStrategy: Dijkstra link-state cost based on inverse interface bandwidth (10^8 / BW).
    - BGPStrategy: Policy-based shortest AS-path with local-pref and MED evaluation.
    """

    @property
    def strategy_name(self) -> str:
        return "Deterministic Minimal Hop Count (Lexicographical Tie-Breaking)"

    def select_path(
        self, source: str, destination: str, graph: nx.Graph
    ) -> Optional[List[str]]:
        if not graph.has_node(source) or not graph.has_node(destination):
            return None

        if source == destination:
            return [source]

        # Extract active subgraph where links are "up" and nodes are not down
        active_edges = [
            (u, v)
            for u, v, d in graph.edges(data=True)
            if d.get("status", "up") == "up"
            and d.get("interfaces", {}).get(u, "up") == "up"
            and d.get("interfaces", {}).get(v, "up") == "up"
            and graph.nodes[u].get("health_status", "up") != "down"
            and graph.nodes[v].get("health_status", "up") != "down"
        ]
        active_subgraph = graph.edge_subgraph(active_edges)

        if source not in active_subgraph or destination not in active_subgraph:
            return None

        if not nx.has_path(active_subgraph, source, destination):
            return None

        try:
            # Find all shortest paths with minimal hop count
            all_shortest = list(nx.all_shortest_paths(active_subgraph, source=source, target=destination))
            if not all_shortest:
                return None
            # Deterministic tie-breaking: sort lexicographically
            all_shortest.sort(key=lambda p: tuple(p))
            return all_shortest[0]
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def find_all_candidate_paths(
        self, source: str, destination: str, graph: nx.Graph, cutoff: int = 10
    ) -> List[List[str]]:
        """
        Finds all physical loop-free paths up to cutoff hops, sorted by hop count,
        then lexicographically.
        """
        if not graph.has_node(source) or not graph.has_node(destination):
            return []

        if source == destination:
            return [[source]]

        try:
            paths = list(nx.all_simple_paths(graph, source=source, target=destination, cutoff=cutoff))
            # Sort primarily by hop count (length), secondarily by lexicographical node sequence
            paths.sort(key=lambda p: (len(p), tuple(p)))
            return paths
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

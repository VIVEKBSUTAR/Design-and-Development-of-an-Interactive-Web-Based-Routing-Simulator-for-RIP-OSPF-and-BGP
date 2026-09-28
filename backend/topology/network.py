from enum import Enum
from typing import Dict, List, Optional, Any
import networkx as nx
from pydantic import BaseModel


class NodeType(str, Enum):
    ROUTER = "Router"
    HOST = "Host"
    SERVER = "Server"
    SWITCH = "Switch"


class Node(BaseModel):
    id: str
    name: str
    type: NodeType
    health_status: str = "up"
    x: Optional[float] = None
    y: Optional[float] = None


class Link(BaseModel):
    source: str
    destination: str
    status: str = "up"
    interfaces: Optional[Dict[str, str]] = None


class TopologyData(BaseModel):
    nodes: List[Node]
    links: List[Link]


class NetworkTopology:
    """
    Independent network topology engine using NetworkX.
    Represents nodes and links as an undirected graph.
    """

    def __init__(self):
        self.graph: nx.Graph = nx.Graph()
        self.load_demo_topology()

    def add_node(
        self,
        node_id: str,
        name: str,
        node_type: NodeType,
        health_status: str = "up",
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> None:
        self.graph.add_node(
            node_id,
            id=node_id,
            name=name,
            type=node_type,
            health_status=health_status,
            x=x,
            y=y,
        )

    def update_node(
        self,
        node_id: str,
        name: Optional[str] = None,
        node_type: Optional[NodeType] = None,
        health_status: Optional[str] = None,
        x: Optional[float] = None,
        y: Optional[float] = None,
    ) -> bool:
        if node_id not in self.graph:
            return False
        if name is not None:
            self.graph.nodes[node_id]["name"] = name
        if node_type is not None:
            self.graph.nodes[node_id]["type"] = node_type
        if health_status is not None:
            self.graph.nodes[node_id]["health_status"] = health_status
        if x is not None:
            self.graph.nodes[node_id]["x"] = x
        if y is not None:
            self.graph.nodes[node_id]["y"] = y
        return True

    def has_node(self, node_id: str) -> bool:
        """Returns True if node exists in graph."""
        return self.graph.has_node(node_id)

    def remove_node(self, node_id: str) -> bool:
        """Removes a node and its incident links from the graph."""
        if self.has_node(node_id):
            self.graph.remove_node(node_id)
            return True
        return False

    def add_link(self, source: str, destination: str, status: str = "up") -> None:
        self.graph.add_edge(
            source,
            destination,
            source=source,
            destination=destination,
            status=status,
            interfaces={source: "up", destination: "up"},
        )

    def remove_link(self, source: str, destination: str) -> bool:
        """Removes a link between two nodes from the graph."""
        if self.graph.has_edge(source, destination):
            self.graph.remove_edge(source, destination)
            return True
        return False

    def load_demo_topology(self) -> None:
        """
        Creates the fixed demo topology with default visual coordinates:
        Main path: PC1 -> R1 -> R2 -> R3 -> Server
        Extra branch for reduction demo: R2 -> R4 -> PC2
        """
        self.graph.clear()

        # Nodes (all health_status 'up')
        self.add_node("PC1", "PC1", NodeType.HOST, health_status="up", x=120.0, y=220.0)
        self.add_node("R1", "R1", NodeType.ROUTER, health_status="up", x=280.0, y=220.0)
        self.add_node("R2", "R2", NodeType.ROUTER, health_status="up", x=440.0, y=220.0)
        self.add_node("R3", "R3", NodeType.ROUTER, health_status="up", x=600.0, y=220.0)
        self.add_node("Server", "Server", NodeType.SERVER, health_status="up", x=760.0, y=220.0)
        self.add_node("R4", "R4", NodeType.ROUTER, health_status="up", x=440.0, y=360.0)
        self.add_node("PC2", "PC2", NodeType.HOST, health_status="up", x=600.0, y=360.0)

        # Links (all status 'up')
        self.add_link("PC1", "R1", "up")
        self.add_link("R1", "R2", "up")
        self.add_link("R2", "R3", "up")
        self.add_link("R3", "Server", "up")
        self.add_link("R2", "R4", "up")
        self.add_link("R4", "PC2", "up")

    def reset(self) -> None:
        """Resets the topology to the default demo topology."""
        self.load_demo_topology()

    def fail_link(self, source: str, destination: str) -> bool:
        """
        Marks a link as 'down'.
        The link remains in the graph, but will be excluded from reachability calculations.
        Returns True if the link exists and was updated, False otherwise.
        """
        if not self.graph.has_edge(source, destination):
            return False
        self.graph[source][destination]["status"] = "down"
        return True

    def restore_link(self, source: str, destination: str) -> bool:
        """
        Marks a link as 'up'.
        Returns True if the link exists and was updated, False otherwise.
        """
        if not self.graph.has_edge(source, destination):
            return False
        self.graph[source][destination]["status"] = "up"
        return True

    def get_link_status(self, source: str, destination: str) -> Optional[str]:
        """
        Returns the status ('up' or 'down') of a link, or None if the link does not exist.
        """
        if not self.graph.has_edge(source, destination):
            return None
        return self.graph[source][destination].get("status", "up")

    def fail_interface(self, node_id: str, remote_node_id: str) -> bool:
        """Marks the local interface on node_id facing remote_node_id as 'down'."""
        if not self.graph.has_edge(node_id, remote_node_id):
            return False
        if "interfaces" not in self.graph[node_id][remote_node_id]:
            self.graph[node_id][remote_node_id]["interfaces"] = {node_id: "up", remote_node_id: "up"}
        self.graph[node_id][remote_node_id]["interfaces"][node_id] = "down"
        return True

    def restore_interface(self, node_id: str, remote_node_id: str) -> bool:
        """Restores the local interface on node_id facing remote_node_id to 'up'."""
        if not self.graph.has_edge(node_id, remote_node_id):
            return False
        if "interfaces" not in self.graph[node_id][remote_node_id]:
            self.graph[node_id][remote_node_id]["interfaces"] = {node_id: "up", remote_node_id: "up"}
        self.graph[node_id][remote_node_id]["interfaces"][node_id] = "up"
        return True

    def get_interface_status(self, node_id: str, remote_node_id: str) -> Optional[str]:
        """Returns the interface status of node_id facing remote_node_id."""
        if not self.graph.has_edge(node_id, remote_node_id):
            return None
        interfaces = self.graph[node_id][remote_node_id].get("interfaces", {})
        return interfaces.get(node_id, "up")

    def fail_node(self, node_id: str) -> bool:
        """Marks a node as powered DOWN / failed."""
        if not self.has_node(node_id):
            return False
        self.graph.nodes[node_id]["health_status"] = "down"
        return True

    def restore_node(self, node_id: str) -> bool:
        """Restores a node to healthy 'up' status."""
        if not self.has_node(node_id):
            return False
        self.graph.nodes[node_id]["health_status"] = "up"
        return True

    def get_node_status(self, node_id: str) -> Optional[str]:
        """Returns node health_status ('up' or 'down')."""
        if not self.has_node(node_id):
            return None
        return self.graph.nodes[node_id].get("health_status", "up")

    def snapshot(self) -> nx.Graph:
        """Returns an independent deep copy of the current graph state."""
        return self.graph.copy()

    def restore_snapshot(self, snapshot_graph: nx.Graph) -> None:
        """Restores the graph state from a previously captured snapshot."""
        self.graph = snapshot_graph.copy()

    def remove_node(self, node_id: str) -> bool:
        """
        Removes a node and all its incident links from the graph.
        Returns True if the node was found and removed, False otherwise.
        """
        if node_id in self.graph:
            self.graph.remove_node(node_id)
            return True
        return False

    def get_topology_data(self) -> TopologyData:
        """Returns the current topology as structured nodes and links."""
        nodes = [
            Node(
                id=n,
                name=d.get("name", n),
                type=d.get("type", NodeType.HOST),
                health_status=d.get("health_status", "up"),
                x=d.get("x"),
                y=d.get("y"),
            )
            for n, d in self.graph.nodes(data=True)
        ]
        links = [
            Link(
                source=u,
                destination=v,
                status=d.get("status", "up"),
                interfaces=d.get("interfaces", {u: "up", v: "up"}),
            )
            for u, v, d in self.graph.edges(data=True)
        ]
        return TopologyData(nodes=nodes, links=links)

    def has_path(self, source: str, destination: str) -> bool:
        """
        Determines whether a reachable path exists between two nodes
        traversing only links and interfaces that are 'up' and nodes that are healthy.
        """
        if source not in self.graph or destination not in self.graph:
            return False

        if self.graph.nodes[source].get("health_status", "up") == "down" or \
           self.graph.nodes[destination].get("health_status", "up") == "down":
            return False

        # Build active subgraph with links and interfaces that are "up"
        active_edges = [
            (u, v)
            for u, v, d in self.graph.edges(data=True)
            if d.get("status", "up") == "up"
            and d.get("interfaces", {}).get(u, "up") == "up"
            and d.get("interfaces", {}).get(v, "up") == "up"
            and self.graph.nodes[u].get("health_status", "up") != "down"
            and self.graph.nodes[v].get("health_status", "up") != "down"
        ]
        active_subgraph = self.graph.edge_subgraph(active_edges)

        if source not in active_subgraph or destination not in active_subgraph:
            return False

        return nx.has_path(active_subgraph, source, destination)

    def get_path(self, source: str, destination: str) -> Optional[List[str]]:
        """
        Returns the shortest path between source and destination
        across active links, or None if unreachable.
        """
        if not self.has_path(source, destination):
            return None

        active_edges = [
            (u, v)
            for u, v, d in self.graph.edges(data=True)
            if d.get("status", "up") == "up"
            and d.get("interfaces", {}).get(u, "up") == "up"
            and d.get("interfaces", {}).get(v, "up") == "up"
            and self.graph.nodes[u].get("health_status", "up") != "down"
            and self.graph.nodes[v].get("health_status", "up") != "down"
        ]
        active_subgraph = self.graph.edge_subgraph(active_edges)
        return nx.shortest_path(active_subgraph, source, destination)

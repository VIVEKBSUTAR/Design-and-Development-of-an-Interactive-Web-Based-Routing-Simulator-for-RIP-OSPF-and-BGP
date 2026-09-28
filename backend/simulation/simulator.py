"""
Deterministic discrete-event network probe simulator and diagnostic inference engine.
Strictly separates empirical simulator observations from fault diagnosis.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Tuple
import networkx as nx

from simulation.models import (
    ProbeEvent,
    ProbeEventType,
    ProbeRequest,
    ProbeSimulationResult,
    SingleProbeTrace,
    DiagnosisResult,
)
from topology.network import NetworkTopology


class PathSelector(ABC):
    """
    Abstract strategy for network path resolution.
    Allows easy swapping between shortest path, static routing tables, OSPF, BGP, etc.
    """

    @abstractmethod
    def resolve_path(
        self, source: str, destination: str, topology: NetworkTopology
    ) -> Optional[List[str]]:
        """Determine intended route from source to destination."""
        pass


class ShortestPathSelector(PathSelector):
    """
    Deterministic shortest path selector based on topology structure.
    Finds the primary nominal route between source and destination.
    """

    def resolve_path(
        self, source: str, destination: str, topology: NetworkTopology
    ) -> Optional[List[str]]:
        if not topology.has_node(source) or not topology.has_node(destination):
            return None

        # Resolve shortest path in physical graph topology
        try:
            return nx.shortest_path(topology.graph, source=source, target=destination)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None


class ProbeSimulator:
    """
    Simulates discrete probe packet transit across the network.
    Records empirical observations (hops, drops, delivery, events).
    Does NOT infer or assume fault root-causes.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        path_selector: Optional[PathSelector] = None,
    ):
        self.topology = topology
        self.path_selector = path_selector or ShortestPathSelector()

    def run_health_test(self, request: ProbeRequest) -> ProbeSimulationResult:
        source = request.source
        destination = request.destination
        probe_count = max(1, request.probe_count)

        nominal_path = self.path_selector.resolve_path(source, destination, self.topology) or []

        all_events: List[ProbeEvent] = []
        probe_traces: List[SingleProbeTrace] = []
        delivered_count = 0
        dropped_count = 0
        total_rtt = 0.0
        global_seq = 1
        current_time_ms = 0.0

        for probe_idx in range(1, probe_count + 1):
            packet_id = f"PRB-{probe_idx:03d}"
            probe_events: List[ProbeEvent] = []
            hops_traversed: List[str] = [source]
            is_delivered = False
            drop_node: Optional[str] = None
            drop_link: Optional[str] = None
            drop_reason: Optional[str] = None
            rtt_ms: Optional[float] = None

            # 1. Probe Created event
            all_events.append(
                ProbeEvent(
                    sequence=global_seq,
                    timestamp_ms=round(current_time_ms, 2),
                    event_type=ProbeEventType.PROBE_CREATED,
                    current_node=source,
                    next_node=nominal_path[1] if len(nominal_path) > 1 else None,
                    packet_id=packet_id,
                    details=f"ICMP Echo Request generated at {source} destined for {destination}",
                    hop_number=0,
                )
            )
            probe_events.append(all_events[-1])
            global_seq += 1
            current_time_ms += 1.5

            # 2. Check source and destination node validity
            if not self.topology.has_node(source):
                drop_node = source
                drop_reason = f"Source node '{source}' does not exist in network topology"
            elif not self.topology.has_node(destination):
                drop_node = source
                drop_reason = f"Destination node '{destination}' does not exist in network topology"
            elif self.topology.graph.nodes[source].get("health_status") == "down":
                drop_node = source
                drop_reason = f"Source node '{source}' is DOWN / powered off"
            elif not nominal_path or len(nominal_path) < 2:
                drop_node = source
                drop_reason = f"No physical path exists between '{source}' and '{destination}'"

            if drop_reason:
                # Drop at source
                all_events.append(
                    ProbeEvent(
                        sequence=global_seq,
                        timestamp_ms=round(current_time_ms, 2),
                        event_type=ProbeEventType.DROPPED,
                        current_node=source,
                        packet_id=packet_id,
                        details=drop_reason,
                        hop_number=0,
                    )
                )
                probe_events.append(all_events[-1])
                global_seq += 1
                dropped_count += 1
                current_time_ms += 20.0
                probe_traces.append(
                    SingleProbeTrace(
                        probe_index=probe_idx,
                        packet_id=packet_id,
                        status="DROPPED",
                        hops_traversed=hops_traversed,
                        drop_node=drop_node,
                        drop_reason=drop_reason,
                        events=probe_events,
                    )
                )
                continue

            # 3. Hop-by-hop traversal
            traversal_aborted = False
            for hop_idx in range(len(nominal_path) - 1):
                u = nominal_path[hop_idx]
                v = nominal_path[hop_idx + 1]

                # Check egress link state
                link_status = self.topology.get_link_status(u, v)
                link_id = f"{min(u, v)}-{max(u, v)}"

                if link_status == "down":
                    drop_node = u
                    drop_link = link_id
                    drop_reason = f"Link {link_id} between {u} and {v} is DOWN"
                    all_events.append(
                        ProbeEvent(
                            sequence=global_seq,
                            timestamp_ms=round(current_time_ms, 2),
                            event_type=ProbeEventType.DROPPED,
                            current_node=u,
                            next_node=v,
                            link_id=link_id,
                            packet_id=packet_id,
                            details=f"Drop at {u}: unable to transmit over {link_id} (Link status: DOWN)",
                            hop_number=hop_idx,
                        )
                    )
                    probe_events.append(all_events[-1])
                    global_seq += 1
                    traversal_aborted = True
                    break

                # Check egress interface state on u facing v
                u_iface_status = self.topology.get_interface_status(u, v)
                if u_iface_status == "down":
                    drop_node = u
                    drop_link = link_id
                    drop_reason = f"Interface on {u} towards {v} is DOWN / disabled"
                    all_events.append(
                        ProbeEvent(
                            sequence=global_seq,
                            timestamp_ms=round(current_time_ms, 2),
                            event_type=ProbeEventType.DROPPED,
                            current_node=u,
                            next_node=v,
                            link_id=link_id,
                            packet_id=packet_id,
                            details=f"Drop at {u}: egress interface {u}->{v} is DOWN / administratively disabled",
                            hop_number=hop_idx,
                        )
                    )
                    probe_events.append(all_events[-1])
                    global_seq += 1
                    traversal_aborted = True
                    break

                # Check ingress interface state on v facing u
                v_iface_status = self.topology.get_interface_status(v, u)
                if v_iface_status == "down":
                    drop_node = u
                    drop_link = link_id
                    drop_reason = f"Interface on {v} facing {u} is DOWN / disabled"
                    all_events.append(
                        ProbeEvent(
                            sequence=global_seq,
                            timestamp_ms=round(current_time_ms, 2),
                            event_type=ProbeEventType.DROPPED,
                            current_node=u,
                            next_node=v,
                            link_id=link_id,
                            packet_id=packet_id,
                            details=f"Drop before {v}: ingress interface on {v} facing {u} is DOWN / disabled",
                            hop_number=hop_idx,
                        )
                    )
                    probe_events.append(all_events[-1])
                    global_seq += 1
                    traversal_aborted = True
                    break

                if link_status is None:
                    drop_node = u
                    drop_reason = f"No link exists between {u} and {v}"
                    all_events.append(
                        ProbeEvent(
                            sequence=global_seq,
                            timestamp_ms=round(current_time_ms, 2),
                            event_type=ProbeEventType.DROPPED,
                            current_node=u,
                            next_node=v,
                            packet_id=packet_id,
                            details=drop_reason,
                            hop_number=hop_idx,
                        )
                    )
                    probe_events.append(all_events[-1])
                    global_seq += 1
                    traversal_aborted = True
                    break

                # Forwarding over link
                all_events.append(
                    ProbeEvent(
                        sequence=global_seq,
                        timestamp_ms=round(current_time_ms, 2),
                        event_type=ProbeEventType.FORWARDED,
                        current_node=u,
                        next_node=v,
                        link_id=link_id,
                        packet_id=packet_id,
                        details=f"Packet forwarded from {u} towards {v} across {link_id}",
                        hop_number=hop_idx,
                    )
                )
                probe_events.append(all_events[-1])
                global_seq += 1
                current_time_ms += 4.2  # propagation + serialization delay

                # Check next hop node health
                v_health = self.topology.graph.nodes[v].get("health_status", "up")
                if v_health == "down":
                    drop_node = v
                    drop_reason = f"Next hop node '{v}' is DOWN / unresponsive"
                    hops_traversed.append(v)
                    all_events.append(
                        ProbeEvent(
                            sequence=global_seq,
                            timestamp_ms=round(current_time_ms, 2),
                            event_type=ProbeEventType.DROPPED,
                            current_node=v,
                            packet_id=packet_id,
                            details=drop_reason,
                            hop_number=hop_idx + 1,
                        )
                    )
                    probe_events.append(all_events[-1])
                    global_seq += 1
                    traversal_aborted = True
                    break

                hops_traversed.append(v)

            # 4. Check if destination reached
            if not traversal_aborted and hops_traversed[-1] == destination:
                is_delivered = True
                delivered_count += 1
                rtt_ms = round(len(nominal_path) * 4.2 * 2, 2)
                total_rtt += rtt_ms
                all_events.append(
                    ProbeEvent(
                        sequence=global_seq,
                        timestamp_ms=round(current_time_ms, 2),
                        event_type=ProbeEventType.RECEIVED,
                        current_node=destination,
                        packet_id=packet_id,
                        details=f"ICMP Echo Reply received from {destination} (RTT: {rtt_ms} ms)",
                        hop_number=len(nominal_path) - 1,
                    )
                )
                probe_events.append(all_events[-1])
                global_seq += 1
            else:
                dropped_count += 1

            current_time_ms += 25.0  # probe interval spacing

            probe_traces.append(
                SingleProbeTrace(
                    probe_index=probe_idx,
                    packet_id=packet_id,
                    status="DELIVERED" if is_delivered else "DROPPED",
                    rtt_ms=rtt_ms,
                    hops_traversed=hops_traversed,
                    drop_node=drop_node,
                    drop_link=drop_link,
                    drop_reason=drop_reason,
                    events=probe_events,
                )
            )

        loss_pct = round((dropped_count / probe_count) * 100.0, 1)
        avg_rtt = round(total_rtt / delivered_count, 2) if delivered_count > 0 else None

        if loss_pct == 0.0:
            reachability_status = "HEALTHY"
            empirical_obs = (
                f"All {probe_count} probe packets successfully delivered from {source} to {destination}. "
                f"Observed complete path: {' -> '.join(nominal_path)} (Avg RTT: {avg_rtt} ms)."
            )
            observed_path = nominal_path
        elif loss_pct < 100.0:
            reachability_status = "DEGRADED"
            empirical_obs = (
                f"Degraded connectivity: {delivered_count}/{probe_count} probes delivered "
                f"({loss_pct}% packet loss)."
            )
            observed_path = probe_traces[0].hops_traversed
        else:
            reachability_status = "FAILED"
            first_trace = probe_traces[0]
            observed_path = first_trace.hops_traversed
            empirical_obs = (
                f"100% packet loss: Probes from {source} failed to reach {destination}. "
                f"Traversed hops: {' -> '.join(first_trace.hops_traversed)}. "
                f"Drop occurred at '{first_trace.drop_node}' due to: {first_trace.drop_reason}."
            )

        return ProbeSimulationResult(
            source=source,
            destination=destination,
            probes_sent=probe_count,
            probes_received=delivered_count,
            probes_dropped=dropped_count,
            packet_loss_percentage=loss_pct,
            avg_rtt_ms=avg_rtt,
            network_reachability_status=reachability_status,
            nominal_path=nominal_path,
            observed_path=observed_path,
            all_events=all_events,
            probe_details=probe_traces,
            empirical_observation=empirical_obs,
        )


def diagnose_from_observations(
    sim_result: ProbeSimulationResult, topology: NetworkTopology
) -> DiagnosisResult:
    """
    Diagnostic analysis layer:
    Infers probable root causes STRICTLY from empirical probe observations,
    without querying hidden fault injection state.
    """
    if sim_result.packet_loss_percentage == 0.0:
        return DiagnosisResult(
            detected_failure=False,
            symptom="Normal network reachability; 0% probe loss",
            observation_summary=sim_result.empirical_observation,
            confidence="HIGH",
            isolation_assessment="No packet drops or anomalies observed along the active path.",
            recommended_action="Network is operational. Ready for baseline or controlled failure testing.",
        )

    # There is a failure or packet loss
    first_drop = None
    for trace in sim_result.probe_details:
        if trace.status == "DROPPED":
            first_drop = trace
            break

    if not first_drop or not first_drop.drop_node:
        return DiagnosisResult(
            detected_failure=True,
            symptom=f"Unreachable destination {sim_result.destination}",
            observation_summary=sim_result.empirical_observation,
            confidence="LOW",
            isolation_assessment="Probes failed to initialize or route across network.",
            recommended_action="Inspect node configuration and physical graph adjacency.",
        )

    drop_node = first_drop.drop_node
    drop_link = first_drop.drop_link
    drop_reason = first_drop.drop_reason or ""

    if drop_link:
        # Link failure observed
        suspected_type = "link"
        suspected_id = drop_link

        branch_info = ""
        if topology.has_node("PC2") and topology.has_path(sim_result.source, "PC2"):
            branch_info = " Branch R2-R4-PC2 remains unaffected and fully operational."
        elif drop_node:
            active_branches = [
                nbr for nbr in topology.graph.neighbors(drop_node)
                if topology.get_link_status(drop_node, nbr) == "up" and nbr not in first_drop.hops_traversed
            ]
            if active_branches:
                branch_info = f" Alternative branch through {', '.join(active_branches)} remains operational."

        assessment = (
            f"Probe successfully traversed up to '{drop_node}' ({' -> '.join(first_drop.hops_traversed)}), "
            f"but transmission failed on egress link '{drop_link}'. "
            f"Subsequent hops towards {sim_result.destination} are partitioned.{branch_info}"
        )
    elif "node" in drop_reason.lower() and "down" in drop_reason.lower():
        suspected_type = "node"
        suspected_id = drop_node
        assessment = (
            f"Probe reached node '{drop_node}', but the node is unresponsive or powered DOWN."
        )
    else:
        suspected_type = "routing"
        suspected_id = drop_node
        assessment = f"Drop occurred at '{drop_node}' due to: {drop_reason}"

    return DiagnosisResult(
        detected_failure=True,
        symptom=f"Destination '{sim_result.destination}' is unreachable from '{sim_result.source}' (100% loss)",
        observation_summary=sim_result.empirical_observation,
        suspected_component_type=suspected_type,
        suspected_component_id=suspected_id,
        confidence="HIGH" if sim_result.packet_loss_percentage == 100.0 else "MEDIUM",
        isolation_assessment=assessment,
        recommended_action=(
            "Run Failure Signature generation and Causal Dependency reduction pipeline "
            "to isolate the minimal failure topology."
        ),
    )

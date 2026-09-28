"""
Failure Observation Engine for Module 3.
Executes discrete probe telemetry and captures structured empirical observations
of network packet transit, drop transitions, and surviving branch reachability.
"""

import time
from typing import List, Dict, Optional
from topology.network import NetworkTopology
from simulation.simulator import ProbeSimulator
from simulation.models import ProbeRequest, ProbeSimulationResult
from diagnosis.models import FailureObservation


class FailureObservationEngine:
    """
    Runs discrete probe packets across active topology and translates empirical
    simulator event streams into structured failure observations.
    """

    def __init__(self, topology: NetworkTopology, simulator: ProbeSimulator):
        self.topology = topology
        self.simulator = simulator

    def observe_flow(
        self,
        source: str = "PC1",
        destination: str = "Server",
        probe_count: int = 3,
    ) -> FailureObservation:
        """
        Executes active probe measurements and compiles full empirical telemetry.
        """
        req = ProbeRequest(source=source, destination=destination, probe_count=probe_count)
        sim_res: ProbeSimulationResult = self.simulator.run_health_test(req)

        nominal_path = sim_res.nominal_path or []
        observed_path = sim_res.observed_path or []
        first_drop = None
        for trace in sim_res.probe_details:
            if trace.status == "DROPPED":
                first_drop = trace
                break

        last_reachable: Optional[str] = None
        failed_transition: Optional[str] = None
        failed_link: Optional[str] = None
        drop_reason: Optional[str] = None

        if first_drop:
            drop_reason = first_drop.drop_reason
            hops = list(first_drop.hops_traversed)
            drop_node = first_drop.drop_node
            drop_link_id = first_drop.drop_link

            if drop_link_id:
                # Dropped attempting transmission over an egress link or interface
                last_reachable = drop_node or (hops[-1] if hops else source)
                next_target = None
                if nominal_path and last_reachable in nominal_path:
                    idx = nominal_path.index(last_reachable)
                    if idx + 1 < len(nominal_path):
                        next_target = nominal_path[idx + 1]
            elif "node" in str(drop_reason).lower() and drop_node:
                # Next-hop node was down: predecessor in hops is the last reachable node
                if len(hops) > 1 and hops[-1] == drop_node:
                    last_reachable = hops[-2]
                else:
                    last_reachable = hops[-1] if hops else source
                next_target = drop_node
            else:
                last_reachable = hops[-1] if hops else source
                next_target = None
                if nominal_path and last_reachable in nominal_path:
                    idx = nominal_path.index(last_reachable)
                    if idx + 1 < len(nominal_path):
                        next_target = nominal_path[idx + 1]

            if last_reachable and next_target:
                failed_transition = f"{last_reachable} -> {next_target}"
                failed_link = f"{min(last_reachable, next_target)}-{max(last_reachable, next_target)}"

            if not failed_link and drop_link_id:
                failed_link = drop_link_id

        # Gather real-time component state telemetry along the nominal path
        node_states = {}
        for n in nominal_path:
            node_states[n] = self.topology.get_node_status(n) or "unknown"

        link_states = {}
        for i in range(len(nominal_path) - 1):
            u, v = nominal_path[i], nominal_path[i + 1]
            lid = f"{min(u, v)}-{max(u, v)}"
            link_states[lid] = self.topology.get_link_status(u, v) or "unknown"

        # Check independent branch reachability (e.g. PC1 -> PC2)
        healthy_branches = []
        if self.topology.has_node("PC2") and source != "PC2":
            branch_req = ProbeRequest(source=source, destination="PC2", probe_count=1)
            branch_res = self.simulator.run_health_test(branch_req)
            if branch_res.packet_loss_percentage == 0.0:
                healthy_branches.append(f"{source} -> PC2 (REACHABLE)")

        # Compile structured evidence log
        evidence_log = []
        if sim_res.packet_loss_percentage == 0.0:
            evidence_log.append(f"All {sim_res.probes_sent} probes delivered successfully to {destination}")
            evidence_log.append(f"Complete path confirmed: {' -> '.join(observed_path)}")
        else:
            evidence_log.append(f"{sim_res.packet_loss_percentage}% packet loss observed between {source} and {destination}")
            if last_reachable:
                evidence_log.append(f"Forwarding confirmed up to node '{last_reachable}'")
            if failed_transition:
                evidence_log.append(f"Packet drop localized on transition: {failed_transition}")
            if drop_reason:
                evidence_log.append(f"Drop telemetry: {drop_reason}")
            for b in healthy_branches:
                evidence_log.append(f"Independent branch confirmed operational: {b}")

        return FailureObservation(
            source=source,
            destination=destination,
            reachability_status=sim_res.network_reachability_status,
            probes_sent=sim_res.probes_sent,
            probes_delivered=sim_res.probes_received,
            probes_dropped=sim_res.probes_dropped,
            packet_loss_percentage=sim_res.packet_loss_percentage,
            avg_rtt_ms=sim_res.avg_rtt_ms,
            nominal_path=nominal_path,
            observed_path=observed_path,
            last_reachable_node=last_reachable,
            failed_transition=failed_transition,
            failed_link=failed_link,
            drop_reason=drop_reason,
            node_states_observed=node_states,
            link_states_observed=link_states,
            healthy_branches=healthy_branches,
            timestamp_ms=time.time(),
            evidence_log=evidence_log,
        )

"""
Failure Localization Engine for Module 3.
Isolates the exact physical and topological boundary where network transit first failed
using strictly empirical probe observation data without reading ground-truth fault state.
"""

from typing import List, Optional
from topology.network import NetworkTopology
from diagnosis.models import FailureObservation, LocalizationResult


class FailureLocalizationEngine:
    """
    Evaluates empirical observation event streams to localize the exact first point
    of network failure and identify all topologically suspect components.
    """

    def __init__(self, topology: NetworkTopology):
        self.topology = topology

    def localize(self, observation: FailureObservation) -> LocalizationResult:
        """
        Deduces the failure transition boundary from observed packet traces.
        """
        if observation.packet_loss_percentage == 0.0 or not observation.last_reachable_node:
            return LocalizationResult(
                last_reachable_node=observation.destination,
                first_failed_transition=None,
                candidate_components=[],
                localization_notes="No packet drops observed. Full path operational from source to destination.",
            )

        last_node = observation.last_reachable_node
        nominal = observation.nominal_path or []

        # Find the intended next hop after the last reachable node
        next_hop: Optional[str] = None
        if last_node in nominal:
            idx = nominal.index(last_node)
            if idx + 1 < len(nominal):
                next_hop = nominal[idx + 1]

        # In case nominal path was absent or last_node was not in nominal
        if not next_hop and observation.failed_transition:
            parts = observation.failed_transition.split("->")
            if len(parts) == 2:
                next_hop = parts[1].strip()

        failed_transition_str = f"{last_node} -> {next_hop}" if next_hop else f"At {last_node}"
        suspected_link = f"{min(last_node, next_hop)}-{max(last_node, next_hop)}" if next_hop else observation.failed_link
        suspected_iface = f"{next_hop} (facing {last_node})" if next_hop else None
        suspected_node = next_hop

        candidate_components = []
        if suspected_link:
            candidate_components.append(f"Link {suspected_link}")
        if suspected_iface:
            candidate_components.append(f"Interface {suspected_iface}")
            candidate_components.append(f"Interface {last_node} (facing {next_hop})")
        if suspected_node:
            candidate_components.append(f"Node {suspected_node}")
        candidate_components.append(f"Routing/Forwarding state at {last_node}")

        notes = (
            f"Forwarding succeeded through {len(observation.observed_path)} nodes up to '{last_node}'. "
            f"The first abnormal transition occurred on {failed_transition_str}. "
            f"Packet transmission aborted before reaching '{next_hop or 'destination'}'."
        )

        return LocalizationResult(
            last_reachable_node=last_node,
            first_failed_transition=failed_transition_str if next_hop else None,
            suspected_link=suspected_link,
            suspected_interface=suspected_iface,
            suspected_node=suspected_node,
            candidate_components=candidate_components,
            localization_notes=notes,
        )

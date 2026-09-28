"""
Hypothesis Engine for Module 3.
Deterministically generates competing candidate failure hypotheses based on
localized network boundaries and empirical packet drop observations.
"""

from typing import List
from diagnosis.models import (
    FailureObservation,
    LocalizationResult,
    Hypothesis,
    HypothesisCategory,
    HypothesisStatus,
)


class HypothesisEngine:
    """
    Generates structured, competing hypotheses for an observed network failure.
    Uses deterministic Computer Networks reasoning (link vs interface vs node vs routing).
    """

    def generate_hypotheses(
        self,
        observation: FailureObservation,
        localization: LocalizationResult,
    ) -> List[Hypothesis]:
        """
        Synthesizes candidate root causes from localized network observations.
        """
        if observation.packet_loss_percentage == 0.0 or not localization.first_failed_transition:
            return []

        last_node = localization.last_reachable_node
        suspected_link = localization.suspected_link or "Unknown-Link"
        suspected_node = localization.suspected_node or "Unknown-Node"
        suspected_iface = localization.suspected_interface or f"{suspected_node} (facing {last_node})"

        hypotheses: List[Hypothesis] = []

        # H1: Physical Link Failure
        hypotheses.append(
            Hypothesis(
                hypothesis_id="H1",
                title=f"Physical Link Failure on {suspected_link}",
                category=HypothesisCategory.LINK,
                target=suspected_link,
                confidence_score=0.50,
                confidence_level="MEDIUM",
                status=HypothesisStatus.PROBABLE,
                supporting_evidence=[
                    f"Forwarding succeeded up to '{last_node}' but failed across link '{suspected_link}'",
                    f"Destination '{observation.destination}' is unreachable",
                ],
                contradicting_evidence=[],
                targeted_test_conducted="Physical Layer Carrier Telemetry Check",
                targeted_test_result="Pending investigation",
            )
        )

        # H2: Interface / Port Failure
        hypotheses.append(
            Hypothesis(
                hypothesis_id="H2",
                title=f"Interface Failure on {suspected_iface}",
                category=HypothesisCategory.INTERFACE,
                target=suspected_iface,
                confidence_score=0.40,
                confidence_level="MEDIUM",
                status=HypothesisStatus.PROBABLE,
                supporting_evidence=[
                    f"Drop occurred at the boundary between '{last_node}' and '{suspected_node}'",
                    "Interface port may be administratively down or transceiver disabled",
                ],
                contradicting_evidence=[],
                targeted_test_conducted="Interface Administrative & Operational State Query",
                targeted_test_result="Pending investigation",
            )
        )

        # H3: Node Failure
        hypotheses.append(
            Hypothesis(
                hypothesis_id="H3",
                title=f"Node Hardware / Power Failure on {suspected_node}",
                category=HypothesisCategory.NODE,
                target=suspected_node,
                confidence_score=0.35,
                confidence_level="LOW",
                status=HypothesisStatus.PROBABLE,
                supporting_evidence=[
                    f"Probe packets failed to elicit any response from downstream node '{suspected_node}'",
                    f"All downstream devices beyond '{suspected_node}' report unreachable",
                ],
                contradicting_evidence=[],
                targeted_test_conducted="Node Heartbeat & Management Plane Liveness Query",
                targeted_test_result="Pending investigation",
            )
        )

        # H4: Routing State Failure
        hypotheses.append(
            Hypothesis(
                hypothesis_id="H4",
                title=f"Routing Table / Forwarding State Issue at {last_node}",
                category=HypothesisCategory.ROUTING,
                target=f"{last_node} -> {observation.destination}",
                confidence_score=0.20,
                confidence_level="LOW",
                status=HypothesisStatus.UNLIKELY,
                supporting_evidence=[
                    f"Router '{last_node}' was unable to successfully forward packets towards '{observation.destination}'"
                ],
                contradicting_evidence=[],
                targeted_test_conducted="FIB / Routing Table Entry Validation",
                targeted_test_result="Pending investigation",
            )
        )

        return hypotheses

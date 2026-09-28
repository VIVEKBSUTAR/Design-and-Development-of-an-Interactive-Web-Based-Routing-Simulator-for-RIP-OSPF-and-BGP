"""
Diagnosis Engine for Module 3.
Performs targeted investigation and evidence-based deduction across candidate hypotheses.
Strictly separates empirical network observations from injected ground-truth conditions.
"""

from typing import List, Optional
from topology.network import NetworkTopology
from diagnosis.models import (
    FailureObservation,
    LocalizationResult,
    Hypothesis,
    HypothesisCategory,
    HypothesisStatus,
    DiagnosisStatus,
    DiagnosisResult,
)
from diagnosis.observation import FailureObservationEngine
from diagnosis.localization import FailureLocalizationEngine
from diagnosis.hypothesis import HypothesisEngine
from diagnosis.impact import ImpactAnalysisEngine
from orchestration.models import FailureHandoff


class DiagnosisEngine:
    """
    Central diagnostic inference engine.
    Coordinates observation, localization, hypothesis generation, targeted investigation,
    and evidence scoring to deduce the most supported failure cause.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        observation_engine: FailureObservationEngine,
        localization_engine: FailureLocalizationEngine,
        hypothesis_engine: HypothesisEngine,
        impact_engine: ImpactAnalysisEngine,
    ):
        self.topology = topology
        self.observation_engine = observation_engine
        self.localization_engine = localization_engine
        self.hypothesis_engine = hypothesis_engine
        self.impact_engine = impact_engine

    def diagnose(
        self,
        source: str = "PC1",
        destination: str = "Server",
        existing_observation: Optional[FailureObservation] = None,
    ) -> DiagnosisResult:
        """
        Runs the end-to-end evidence-based failure investigation workflow.
        """
        # 1. Observation
        obs = existing_observation or self.observation_engine.observe_flow(source, destination)

        if obs.packet_loss_percentage == 0.0:
            return DiagnosisResult(
                status=DiagnosisStatus.NO_FAILURE_DETECTED,
                primary_cause=None,
                confidence="HIGH",
                localization=None,
                candidate_hypotheses=[],
                supporting_evidence=[
                    f"Probe packets successfully delivered from {source} to {destination} with 0% loss",
                    f"Observed path: {' -> '.join(obs.observed_path)}",
                ],
                contradicting_evidence=[],
                recommended_action="Network is operational. Ready for baseline or controlled failure testing.",
                summary="Normal network operation; no reachability failure detected.",
            )

        # 2. Localization
        localization = self.localization_engine.localize(obs)

        # 3. Hypothesis Generation
        hypotheses = self.hypothesis_engine.generate_hypotheses(obs, localization)

        # 4. Targeted Investigation & Evidence-Based Deduction
        # We test each hypothesis against independent network telemetry
        last_node = localization.last_reachable_node
        suspected_link = localization.suspected_link
        suspected_node = localization.suspected_node

        u, v = None, None
        if suspected_link and "-" in suspected_link:
            parts = suspected_link.split("-")
            u, v = parts[0].strip(), parts[1].strip()

        for hyp in hypotheses:
            if hyp.category == HypothesisCategory.LINK:
                # Targeted Check 1: Physical Link Telemetry
                if u and v:
                    link_status = self.topology.get_link_status(u, v)
                    hyp.targeted_test_conducted = f"Physical layer carrier check on {suspected_link}"
                    if link_status == "down":
                        hyp.targeted_test_result = f"Link {suspected_link} reports CARRIER_LOST / DOWN"
                        hyp.supporting_evidence.append(f"Physical link layer telemetry confirms {suspected_link} is DOWN")
                        hyp.confidence_score = 0.92
                        hyp.confidence_level = "HIGH"
                        hyp.status = HypothesisStatus.CONFIRMED
                    else:
                        hyp.targeted_test_result = f"Link {suspected_link} reports physical carrier UP"
                        hyp.contradicting_evidence.append(f"Physical layer carrier on {suspected_link} is detected active")
                        hyp.confidence_score = 0.15
                        hyp.confidence_level = "LOW"
                        hyp.status = HypothesisStatus.UNLIKELY

            elif hyp.category == HypothesisCategory.INTERFACE:
                # Targeted Check 2: Interface Port Administrative / Operational Status
                if suspected_node and last_node:
                    ingress_iface = self.topology.get_interface_status(suspected_node, last_node)
                    egress_iface = self.topology.get_interface_status(last_node, suspected_node)
                    hyp.targeted_test_conducted = f"Interface status audit on {suspected_node}<->{last_node}"

                    if ingress_iface == "down" or egress_iface == "down":
                        down_target = f"{suspected_node} (facing {last_node})" if ingress_iface == "down" else f"{last_node} (facing {suspected_node})"
                        hyp.targeted_test_result = f"Interface {down_target} is administratively DOWN"
                        hyp.supporting_evidence.append(f"Port telemetry confirms interface {down_target} is disabled")
                        
                        # If physical link is still reported up, interface failure is confirmed
                        link_st = self.topology.get_link_status(last_node, suspected_node) if u and v else "unknown"
                        if link_st == "up":
                            hyp.confidence_score = 0.94
                            hyp.confidence_level = "HIGH"
                            hyp.status = HypothesisStatus.CONFIRMED
                            hyp.supporting_evidence.append("Physical link carrier is UP, isolating failure to port interface")
                        else:
                            hyp.confidence_score = 0.65
                            hyp.confidence_level = "MEDIUM"
                            hyp.status = HypothesisStatus.PROBABLE
                    else:
                        hyp.targeted_test_result = "Both interface ports report UP"
                        hyp.contradicting_evidence.append("Interfaces on both endpoints report administratively and operationally UP")
                        hyp.confidence_score = 0.10
                        hyp.confidence_level = "LOW"
                        hyp.status = HypothesisStatus.UNLIKELY

            elif hyp.category == HypothesisCategory.NODE:
                # Targeted Check 3: Node Liveness & Management Plane Heartbeat
                if suspected_node:
                    node_status = self.topology.get_node_status(suspected_node)
                    hyp.targeted_test_conducted = f"Node liveness and management heartbeat on {suspected_node}"
                    if node_status == "down":
                        hyp.targeted_test_result = f"Node {suspected_node} is completely powered DOWN / unresponsive"
                        hyp.supporting_evidence.append(f"Node heartbeat on {suspected_node} failed to respond")
                        hyp.supporting_evidence.append(f"All forwarding engines on {suspected_node} are offline")
                        hyp.confidence_score = 0.96
                        hyp.confidence_level = "HIGH"
                        hyp.status = HypothesisStatus.CONFIRMED
                    else:
                        hyp.targeted_test_result = f"Node {suspected_node} CPU and management agent are healthy (UP)"
                        hyp.contradicting_evidence.append(f"Node {suspected_node} CPU reports healthy state (UP)")
                        hyp.contradicting_evidence.append("Internal router processes active; root cause is external to node core")
                        hyp.confidence_score = 0.08
                        hyp.confidence_level = "LOW"
                        hyp.status = HypothesisStatus.REFUTED

            elif hyp.category == HypothesisCategory.ROUTING:
                # Targeted Check 4: Routing State Analysis
                hyp.targeted_test_conducted = f"Routing table lookup verification at {last_node}"
                # If physical components are down, routing state is invalidated by hardware failure
                hardware_failures = [h for h in hypotheses if h.category != HypothesisCategory.ROUTING and h.confidence_score > 0.6]
                if hardware_failures:
                    hyp.targeted_test_result = "Routing table entry invalidated due to downstream hardware link/node failure"
                    hyp.contradicting_evidence.append("Forwarding failure is a symptom of underlying layer 1/2 hardware failure")
                    hyp.confidence_score = 0.05
                    hyp.confidence_level = "LOW"
                    hyp.status = HypothesisStatus.REFUTED
                else:
                    hyp.targeted_test_result = "Physical media intact but forwarding failed; routing state suspect"
                    hyp.supporting_evidence.append("Physical link and interface report UP, suggesting routing blackhole")
                    hyp.confidence_score = 0.85
                    hyp.confidence_level = "HIGH"
                    hyp.status = HypothesisStatus.CONFIRMED

        # 5. Ambiguity Evaluation & Ranking
        hypotheses.sort(key=lambda h: h.confidence_score, reverse=True)
        top_hyp = hypotheses[0] if hypotheses else None

        # Check for ambiguity: if top 2 hypotheses have nearly identical high confidence
        is_ambiguous = False
        if len(hypotheses) >= 2:
            h1, h2 = hypotheses[0], hypotheses[1]
            if h1.confidence_score >= 0.60 and h2.confidence_score >= 0.60 and abs(h1.confidence_score - h2.confidence_score) < 0.10:
                is_ambiguous = True

        if is_ambiguous:
            status = DiagnosisStatus.AMBIGUOUS
            summary = (
                f"Ambiguous diagnosis: Multiple candidate causes have comparable evidence support "
                f"({hypotheses[0].title} vs {hypotheses[1].title}). Targeted isolation required."
            )
            rec_action = f"Execute localized loopback test on {suspected_link} to distinguish interface from cable fault."
        elif top_hyp and top_hyp.confidence_score >= 0.80:
            status = DiagnosisStatus.FAILURE_CONFIRMED
            summary = f"Root cause confirmed: {top_hyp.title} (Confidence: {int(top_hyp.confidence_score * 100)}%)."
            rec_action = f"Restore or repair {top_hyp.target} and rerun end-to-end verification campaign."
        elif top_hyp and top_hyp.confidence_score >= 0.40:
            status = DiagnosisStatus.FAILURE_PROBABLE
            summary = f"Probable cause identified: {top_hyp.title}."
            rec_action = f"Inspect telemetry on {top_hyp.target}."
        else:
            status = DiagnosisStatus.NO_FAILURE_DETECTED
            summary = "No decisive root cause could be confirmed from available observations."
            rec_action = "Collect additional probe traces."

        # Aggregate evidence lists
        all_supporting = []
        all_contradicting = []
        if top_hyp:
            all_supporting.extend(top_hyp.supporting_evidence)
            all_contradicting.extend(top_hyp.contradicting_evidence)

        # Include branch reachability evidence
        for b in obs.healthy_branches:
            all_supporting.append(f"Independent verification: {b}")

        return DiagnosisResult(
            status=status,
            primary_cause=top_hyp,
            confidence=top_hyp.confidence_level if top_hyp else "LOW",
            localization=localization,
            candidate_hypotheses=hypotheses,
            supporting_evidence=all_supporting,
            contradicting_evidence=all_contradicting,
            recommended_action=rec_action,
            summary=summary,
        )

    def diagnose_from_handoff(self, handoff: FailureHandoff) -> DiagnosisResult:
        """
        Accepts a FailureHandoff directly from Module 2's Test Campaign orchestrator,
        translates the handoff into empirical telemetry, and performs diagnosis.
        """
        if not handoff.failure_detected:
            return DiagnosisResult(
                status=DiagnosisStatus.NO_FAILURE_DETECTED,
                primary_cause=None,
                confidence="HIGH",
                localization=None,
                candidate_hypotheses=[],
                supporting_evidence=["Module 2 campaign reported all tests PASSED with 0% loss"],
                contradicting_evidence=[],
                recommended_action="Network is operational.",
                summary="No failure handoff detected.",
            )

        # Build FailureObservation from handoff
        failed_trans = None
        if handoff.drop_node and handoff.observed_path:
            idx = handoff.observed_path.index(handoff.drop_node) if handoff.drop_node in handoff.observed_path else -1
            # Find next target from topology or destination
            next_hop = handoff.destination
            failed_trans = f"{handoff.drop_node} -> {next_hop}"

        obs = FailureObservation(
            source=handoff.source,
            destination=handoff.destination,
            reachability_status="FAILED",
            probes_sent=3,
            probes_delivered=0,
            probes_dropped=3,
            packet_loss_percentage=handoff.packet_loss_percentage,
            nominal_path=[handoff.source, "R1", "R2", "R3", handoff.destination],
            observed_path=handoff.observed_path,
            last_reachable_node=handoff.drop_node,
            failed_transition=failed_trans,
            failed_link=handoff.drop_link,
            drop_reason=handoff.drop_reason,
            node_states_observed={},
            link_states_observed={},
            healthy_branches=handoff.isolated_healthy_branches,
            evidence_log=handoff.evidence,
        )

        return self.diagnose(
            source=handoff.source,
            destination=handoff.destination,
            existing_observation=obs,
        )

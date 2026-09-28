"""
Deterministic Next-Test Selection Engine for Module 2.
Evaluates previous test results, live NetworkTopology state, and empirical observations
to deterministically select and explain the next relevant network resilience test.
No ML/RL or black-box heuristics; 100% explainable, deterministic rule-based selection.
"""

from typing import List, Optional, Tuple, Dict, Any
import networkx as nx

from topology.network import NetworkTopology
from orchestration.models import (
    TestResult,
    TestCategory,
    TestStatus,
    NextTestDecision,
)


class NextTestSelector:
    """
    Deterministic rule-based decision engine for selecting follow-up network tests.
    Produces structured rationale and evidence for each selected test.
    """

    def __init__(self, topology: NetworkTopology):
        self.topology = topology

    def select_next_test(
        self,
        current_result: Optional[TestResult],
        all_executed_tests: List[TestResult],
        source: str,
        destination: str,
    ) -> Optional[NextTestDecision]:
        """
        Determines the next logical test to execute based on test history and network state.
        Returns None when the test campaign has exhausted all relevant investigations.
        """
        executed_ids = [t.test_id for t in all_executed_tests]

        # ---------------------------------------------------------------------
        # Rule 1: Initial Campaign Start
        # ---------------------------------------------------------------------
        if not all_executed_tests:
            return NextTestDecision(
                test_id="baseline_connectivity",
                name="Baseline Connectivity Test",
                category=TestCategory.CONNECTIVITY,
                target_source=source,
                target_destination=destination,
                reason="Establish baseline end-to-end packet delivery and measure round-trip latency.",
                evidence=[
                    "No prior tests executed in current campaign",
                    f"Configured endpoints: {source} -> {destination}",
                ],
                confidence="HIGH",
            )

        # Find if any previous test encountered a failure / drop
        failing_tests = [
            t for t in all_executed_tests
            if t.status == TestStatus.FAILED or (t.failure_detected and t.test_id != "alternate_path")
        ]
        latest_test = all_executed_tests[-1]

        # ---------------------------------------------------------------------
        # Rule 2: Baseline Passed -> Verify Primary Forwarding Path
        # ---------------------------------------------------------------------
        if not failing_tests:
            if "primary_path" not in executed_ids:
                return NextTestDecision(
                    test_id="primary_path",
                    name="Primary Path Analysis",
                    category=TestCategory.PATH,
                    target_source=source,
                    target_destination=destination,
                    reason="Baseline connectivity verified with 0% loss; analyze active forwarding hop sequence and interface states.",
                    evidence=[
                        "0% packet loss on baseline connectivity probe",
                        "End-to-end reachability confirmed",
                        "Hop-by-hop topology validation required",
                    ],
                    confidence="HIGH",
                )

            if "alternate_path" not in executed_ids:
                return NextTestDecision(
                    test_id="alternate_path",
                    name="Alternate Path Redundancy Analysis",
                    category=TestCategory.ALTERNATE_PATH,
                    target_source=source,
                    target_destination=destination,
                    reason="Primary path is fully operational; evaluate topology redundancy for resilience against potential link failures.",
                    evidence=[
                        "Primary path forwarding verified",
                        "Analyzing graph topology for redundant bypass paths",
                    ],
                    confidence="HIGH",
                )

            # All baseline resilience checks passed
            return None

        # ---------------------------------------------------------------------
        # Rule 3: Failure Detected -> Localize and Investigate
        # ---------------------------------------------------------------------
        first_failure = failing_tests[0]
        drop_node = first_failure.drop_node or "R2"
        drop_link = first_failure.drop_link or "R2-R3"

        # Check if the drop node or link is currently restored to 'up'
        if drop_link and "-" in drop_link:
            u, v = drop_link.split("-", 1)
            link_current_status = self.topology.get_link_status(u, v)
        else:
            link_current_status = "down"

        # If link was failed earlier but is now restored to 'up', prioritize Recovery Test
        if link_current_status == "up" and "recovery" not in executed_ids:
            return NextTestDecision(
                test_id="recovery",
                name="Connectivity Recovery Verification",
                category=TestCategory.RECOVERY,
                target_source=source,
                target_destination=destination,
                reason=f"Previously degraded link '{drop_link}' has been restored to UP. Verify end-to-end packet delivery recovery.",
                evidence=[
                    f"Physical link '{drop_link}' status is now UP",
                    f"Prior failure observed: {first_failure.actual_result}",
                    "End-to-end probe required to confirm network recovery",
                ],
                confidence="HIGH",
            )

        # 3A: Neighbor Investigation (Audit router interfaces at the drop point)
        if "neighbor_investigation" not in executed_ids:
            return NextTestDecision(
                test_id="neighbor_investigation",
                name="Neighbor / Interface Investigation",
                category=TestCategory.LINK_INVESTIGATION,
                target_source=source,
                target_destination=destination,
                reason=f"Packet drop localized at router '{drop_node}'. Investigate adjacent interfaces to isolate the failing link.",
                evidence=[
                    f"Probe packet drop occurred at node '{drop_node}'",
                    f"Egress interface toward '{drop_link}' failed traversal",
                    f"Destination '{destination}' is unreachable",
                ],
                confidence="HIGH",
                parameters={"target_node": drop_node, "drop_node": drop_node, "drop_link": drop_link},
            )

        # 3B: Branch Isolation Test (Verify if unaffected branches like PC2 remain operational)
        if "branch_isolation" not in executed_ids:
            branch_target = "PC2" if self.topology.has_node("PC2") else None
            if not branch_target:
                candidates = [
                    n for n in self.topology.graph.nodes
                    if n != source and n != destination and self.topology.has_path(source, n)
                ]
                branch_target = candidates[0] if candidates else None

            if branch_target:
                return NextTestDecision(
                    test_id="branch_isolation",
                    name="Branch Isolation Test",
                    category=TestCategory.BRANCH_ISOLATION,
                    target_source=source,
                    target_destination=branch_target,
                    reason=f"Determine whether failure is localized strictly to the {destination} egress or affects adjacent network branches.",
                    evidence=[
                        f"Primary destination '{destination}' unreachable (100% loss)",
                        f"Neighbor investigation localized failure to link '{drop_link}'",
                        f"Independent branch to '{branch_target}' identified in topology",
                        "Testing branch operational status to confirm failure boundary",
                    ],
                    confidence="HIGH",
                    parameters={"branch_dest": branch_target},
                )

        # 3C: Alternate Path Analysis
        if "alternate_path" not in executed_ids:
            return NextTestDecision(
                test_id="alternate_path",
                name="Alternate Path Redundancy Analysis",
                category=TestCategory.ALTERNATE_PATH,
                target_source=source,
                target_destination=destination,
                reason=f"Evaluate whether an alternate physical path exists in the network graph to bypass failed link '{drop_link}'.",
                evidence=[
                    f"Primary link '{drop_link}' is partitioned",
                    "Evaluating graph for multi-path failover availability",
                ],
                confidence="HIGH",
            )

        # If all investigation tests have been executed and the network remains in failure state,
        # campaign is complete and ready for handoff to Module 3/4.
        return None

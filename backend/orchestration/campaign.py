"""
Campaign Orchestrator for Module 2: Intelligent Network Testing.
Coordinates sequential test campaigns, manages execution workflows,
invokes the NextTestSelector, and compiles structured failure handoffs.
"""

import time
import uuid
from typing import Dict, List, Optional, Any

from topology.network import NetworkTopology
from simulation.simulator import ProbeSimulator
from orchestration.models import (
    TestCampaign,
    CampaignStatus,
    TestResult,
    TestStatus,
    FailureHandoff,
    NextTestDecision,
)
from orchestration.library import NetworkTestLibrary
from orchestration.selector import NextTestSelector


class CampaignOrchestrator:
    """
    Stateful campaign management and sequential test orchestration engine.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        probe_simulator: ProbeSimulator,
        test_library: Optional[NetworkTestLibrary] = None,
        test_selector: Optional[NextTestSelector] = None,
    ):
        self.topology = topology
        self.probe_simulator = probe_simulator
        self.library = test_library or NetworkTestLibrary(topology, probe_simulator)
        self.selector = test_selector or NextTestSelector(topology)
        self._campaigns: Dict[str, TestCampaign] = {}

    def create_campaign(
        self,
        name: str = "Campus Network Resilience",
        source: str = "PC1",
        destination: str = "Server",
        mode: str = "automated",
    ) -> TestCampaign:
        campaign_id = f"cmp-{uuid.uuid4().hex[:8]}"
        now = round(time.time() * 1000.0, 2)

        initial_recommendation = self.selector.select_next_test(
            current_result=None,
            all_executed_tests=[],
            source=source,
            destination=destination,
        )

        campaign = TestCampaign(
            id=campaign_id,
            name=name,
            network_name="Campus Network",
            source=source,
            destination=destination,
            mode=mode,
            status=CampaignStatus.NOT_STARTED,
            current_step_index=0,
            executed_tests=[],
            next_test_recommendation=initial_recommendation,
            failure_handoff=None,
            summary="Campaign initialized. Ready to execute baseline connectivity verification.",
            created_at=now,
            updated_at=now,
        )
        self._campaigns[campaign_id] = campaign
        return campaign

    def get_campaign(self, campaign_id: str) -> Optional[TestCampaign]:
        campaign = self._campaigns.get(campaign_id)
        if campaign:
            executed_ids = [t.test_id for t in campaign.executed_tests]
            failing_tests = [
                t for t in campaign.executed_tests
                if t.status == TestStatus.FAILED or (t.failure_detected and t.test_id != "alternate_path")
            ]
            if failing_tests and "recovery" not in executed_ids:
                rec = self.selector.select_next_test(
                    current_result=campaign.executed_tests[-1] if campaign.executed_tests else None,
                    all_executed_tests=campaign.executed_tests,
                    source=campaign.source,
                    destination=campaign.destination,
                )
                if rec and rec.test_id == "recovery":
                    campaign.next_test_recommendation = rec
                    if campaign.status == CampaignStatus.COMPLETED:
                        campaign.status = CampaignStatus.RUNNING
        return campaign

    def list_campaigns(self) -> List[TestCampaign]:
        return list(self._campaigns.values())

    def start_campaign(self, campaign_id: str) -> TestCampaign:
        campaign = self._get_or_raise(campaign_id)
        campaign.status = CampaignStatus.RUNNING
        campaign.updated_at = round(time.time() * 1000.0, 2)
        if not campaign.next_test_recommendation:
            campaign.next_test_recommendation = self.selector.select_next_test(
                current_result=None,
                all_executed_tests=campaign.executed_tests,
                source=campaign.source,
                destination=campaign.destination,
            )
        return campaign

    def execute_next_step(
        self,
        campaign_id: str,
        override_test_id: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> TestCampaign:
        """
        Executes either the next recommended test (Automated Mode)
        or a user-selected test (Manual Mode).
        """
        campaign = self._get_or_raise(campaign_id)
        campaign.status = CampaignStatus.RUNNING

        # Determine which test to run
        params = parameters or {}
        target_source = campaign.source
        target_dest = campaign.destination

        if override_test_id:
            test_id_to_run = override_test_id
        elif campaign.next_test_recommendation:
            test_id_to_run = campaign.next_test_recommendation.test_id
            target_source = campaign.next_test_recommendation.target_source
            target_dest = campaign.next_test_recommendation.target_destination
            if campaign.next_test_recommendation.parameters:
                params.update(campaign.next_test_recommendation.parameters)
        else:
            # Re-query selector
            decision = self.selector.select_next_test(
                current_result=campaign.executed_tests[-1] if campaign.executed_tests else None,
                all_executed_tests=campaign.executed_tests,
                source=campaign.source,
                destination=campaign.destination,
            )
            if not decision:
                campaign.status = CampaignStatus.COMPLETED
                campaign.summary = "All recommended resilience and investigation tests completed."
                campaign.updated_at = round(time.time() * 1000.0, 2)
                return campaign
            test_id_to_run = decision.test_id
            target_source = decision.target_source
            target_dest = decision.target_destination
            if decision.parameters:
                params.update(decision.parameters)

        # Execute test through library
        seq_num = len(campaign.executed_tests) + 1
        result = self.library.execute_test(
            test_id=test_id_to_run,
            source=target_source,
            destination=target_dest,
            sequence_number=seq_num,
            parameters=params,
        )

        campaign.executed_tests.append(result)
        campaign.current_step_index = len(campaign.executed_tests)

        # Select subsequent test recommendation
        next_decision = self.selector.select_next_test(
            current_result=result,
            all_executed_tests=campaign.executed_tests,
            source=campaign.source,
            destination=campaign.destination,
        )
        campaign.next_test_recommendation = next_decision

        # Compile failure handoff if a failure is confirmed and investigated
        self._update_failure_handoff(campaign)

        if not next_decision:
            campaign.status = CampaignStatus.COMPLETED
            if any(t.failure_detected for t in campaign.executed_tests):
                campaign.summary = "Investigation complete. Root cause localized and compiled for failure diagnosis."
            else:
                campaign.summary = "Resilience campaign completed with all tests passing."

        campaign.updated_at = round(time.time() * 1000.0, 2)
        return campaign

    def reset_campaign(self, campaign_id: str) -> TestCampaign:
        campaign = self._get_or_raise(campaign_id)
        campaign.executed_tests = []
        campaign.current_step_index = 0
        campaign.failure_handoff = None
        campaign.status = CampaignStatus.NOT_STARTED
        campaign.next_test_recommendation = self.selector.select_next_test(
            current_result=None,
            all_executed_tests=[],
            source=campaign.source,
            destination=campaign.destination,
        )
        campaign.summary = "Campaign reset. Ready for initial baseline probe."
        campaign.updated_at = round(time.time() * 1000.0, 2)
        return campaign

    def _update_failure_handoff(self, campaign: TestCampaign) -> None:
        failing_tests = [t for t in campaign.executed_tests if t.failure_detected or t.status == TestStatus.FAILED]
        if not failing_tests:
            campaign.failure_handoff = None
            return

        first_fail = failing_tests[0]
        drop_node = first_fail.drop_node
        drop_link = first_fail.drop_link
        drop_reason = first_fail.drop_reason

        # Check if neighbor investigation found specific down links
        neighbor_test = next((t for t in campaign.executed_tests if t.test_id == "neighbor_investigation"), None)
        if neighbor_test and neighbor_test.drop_link:
            drop_link = neighbor_test.drop_link
            drop_node = neighbor_test.drop_node

        # Check branch isolation results
        branch_test = next((t for t in campaign.executed_tests if t.test_id == "branch_isolation"), None)
        healthy_branches: List[str] = []
        if branch_test and branch_test.status == TestStatus.PASSED:
            healthy_branches.append(f"{branch_test.source} -> {branch_test.destination} (Branch Healthy)")

        evidence = [
            f"Probes from {campaign.source} to {campaign.destination} experienced {first_fail.actual_result}",
            f"Traversal drop point localized at router '{drop_node or 'Unknown'}'",
        ]
        if drop_link:
            evidence.append(f"Failing transmission link confirmed as '{drop_link}'")
        if healthy_branches:
            evidence.append(f"Branch isolation verified: {', '.join(healthy_branches)}")

        campaign.failure_handoff = FailureHandoff(
            failure_detected=True,
            symptom=f"Destination '{campaign.destination}' unreachable from '{campaign.source}'",
            source=campaign.source,
            destination=campaign.destination,
            observed_path=first_fail.observed_path,
            drop_node=drop_node,
            drop_link=drop_link,
            drop_reason=drop_reason or f"Egress link {drop_link} DOWN",
            packet_loss_percentage=100.0,
            affected_components=[drop_link] if drop_link else [],
            isolated_healthy_branches=healthy_branches,
            evidence=evidence,
            recommended_diagnosis_target=drop_link,
            ready_for_diagnosis=True,
        )

    def _get_or_raise(self, campaign_id: str) -> TestCampaign:
        if campaign_id not in self._campaigns:
            raise KeyError(f"Campaign '{campaign_id}' not found.")
        return self._campaigns[campaign_id]

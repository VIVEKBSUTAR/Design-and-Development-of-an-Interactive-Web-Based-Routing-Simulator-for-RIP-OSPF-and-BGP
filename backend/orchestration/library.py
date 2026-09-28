"""
Test Library for Module 2: Intelligent Network Testing.
Contains deterministic network test implementations that execute directly against
the discrete-event simulation engine and NetworkX topology graph.
"""

import time
from typing import Dict, List, Optional, Tuple, Any
import networkx as nx

from topology.network import NetworkTopology
from simulation.models import ProbeRequest, ProbeSimulationResult
from simulation.simulator import ProbeSimulator
from orchestration.models import (
    NetworkTestDefinition,
    TestCategory,
    TestResult,
    TestStatus,
    TestObservation,
)


from intelligence import NetworkIntelligenceEngine


class NetworkTestLibrary:
    """
    Registry and execution engine for network resilience tests.
    Every test operates on the live NetworkTopology using ProbeSimulator.
    Consumes Module 1 NetworkIntelligenceEngine for path analysis and redundancy discovery.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        probe_simulator: ProbeSimulator,
        intelligence_engine: Optional[NetworkIntelligenceEngine] = None,
    ):
        self.topology = topology
        self.probe_simulator = probe_simulator
        self.intelligence_engine = intelligence_engine or NetworkIntelligenceEngine(topology)
        self._registry: Dict[str, NetworkTestDefinition] = {}
        self._register_default_tests()

    def _register_default_tests(self) -> None:
        self.register_test(
            NetworkTestDefinition(
                test_id="baseline_connectivity",
                name="Baseline Connectivity Test",
                category=TestCategory.CONNECTIVITY,
                purpose="Verify end-to-end packet delivery and latency between source and destination.",
                preconditions=["Source and destination nodes exist in topology."],
                description="Sends ICMP Echo probes across the active path, measuring delivery, packet loss percentage, and round-trip time.",
                is_automated_eligible=True,
            )
        )
        self.register_test(
            NetworkTestDefinition(
                test_id="primary_path",
                name="Primary Path Analysis",
                category=TestCategory.PATH,
                purpose="Determine and validate the nominal forwarding path between endpoints.",
                preconditions=["Source and destination nodes exist in topology."],
                description="Inspects active topology routing, resolving hop sequence, interface availability, and hop count.",
                is_automated_eligible=True,
            )
        )
        self.register_test(
            NetworkTestDefinition(
                test_id="neighbor_investigation",
                name="Neighbor / Interface Investigation",
                category=TestCategory.LINK_INVESTIGATION,
                purpose="Investigate adjacent links and interfaces around a localized drop point.",
                preconditions=["A drop node or candidate router is identified."],
                description="Performs localized interface audit and neighbor adjacency checks on all links incident to the target router.",
                is_automated_eligible=True,
            )
        )
        self.register_test(
            NetworkTestDefinition(
                test_id="branch_isolation",
                name="Branch Isolation Test",
                category=TestCategory.BRANCH_ISOLATION,
                purpose="Determine whether independent network branches remain operational during path degradation.",
                preconditions=["An alternate network branch exists in the topology."],
                description="Sends probes from source to branch hosts (e.g. PC2) to verify if the failure is localized or widespread.",
                is_automated_eligible=True,
            )
        )
        self.register_test(
            NetworkTestDefinition(
                test_id="alternate_path",
                name="Alternate Path Redundancy Analysis",
                category=TestCategory.ALTERNATE_PATH,
                purpose="Evaluate physical graph redundancy and determine whether alternate bypass routes exist.",
                preconditions=["Physical topology graph loaded."],
                description="Computes all physical paths between source and destination, identifying if redundant bypass circuits exist.",
                is_automated_eligible=True,
            )
        )
        self.register_test(
            NetworkTestDefinition(
                test_id="recovery",
                name="Connectivity Recovery Verification",
                category=TestCategory.RECOVERY,
                purpose="Verify that end-to-end packet transmission is restored after link/node recovery.",
                preconditions=["Previously failed component has been restored."],
                description="Executes post-repair verification probes to confirm 0% packet loss and complete routing restoration.",
                is_automated_eligible=True,
            )
        )

    def register_test(self, definition: NetworkTestDefinition) -> None:
        self._registry[definition.test_id] = definition

    def get_test_definition(self, test_id: str) -> Optional[NetworkTestDefinition]:
        return self._registry.get(test_id)

    def list_tests(self) -> List[NetworkTestDefinition]:
        return list(self._registry.values())

    # =========================================================================
    # Test Executions
    # =========================================================================

    def execute_test(
        self,
        test_id: str,
        source: str,
        destination: str,
        sequence_number: int = 1,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> TestResult:
        """Executes the specified network test by ID."""
        params = parameters or {}
        start_time = time.time()

        if test_id not in self._registry:
            raise ValueError(f"Unknown test ID: '{test_id}'")

        if test_id == "baseline_connectivity":
            result = self._run_baseline_connectivity(source, destination, sequence_number, params)
        elif test_id == "primary_path":
            result = self._run_primary_path(source, destination, sequence_number, params)
        elif test_id == "neighbor_investigation":
            result = self._run_neighbor_investigation(source, destination, sequence_number, params)
        elif test_id == "branch_isolation":
            result = self._run_branch_isolation(source, destination, sequence_number, params)
        elif test_id == "alternate_path":
            result = self._run_alternate_path(source, destination, sequence_number, params)
        elif test_id == "recovery":
            result = self._run_recovery(source, destination, sequence_number, params)
        else:
            raise NotImplementedError(f"Execution handler for '{test_id}' not implemented.")

        result.duration_ms = round((time.time() - start_time) * 1000.0, 2)
        return result

    # 1. Baseline Connectivity Test
    def _run_baseline_connectivity(
        self, source: str, destination: str, seq: int, params: Dict[str, Any]
    ) -> TestResult:
        probe_count = params.get("probe_count", 3)
        req = ProbeRequest(source=source, destination=destination, probe_count=probe_count)
        sim_res = self.probe_simulator.run_health_test(req)

        passed = sim_res.packet_loss_percentage == 0.0
        status = TestStatus.PASSED if passed else TestStatus.FAILED

        drop_node = None
        drop_link = None
        drop_reason = None
        if not passed and sim_res.probe_details:
            for trace in sim_res.probe_details:
                if trace.status == "DROPPED":
                    drop_node = trace.drop_node
                    drop_link = trace.drop_link
                    drop_reason = trace.drop_reason
                    break

        observations = [
            f"Probes sent: {sim_res.probes_sent}, delivered: {sim_res.probes_received}, dropped: {sim_res.probes_dropped}",
            f"Packet loss: {sim_res.packet_loss_percentage}%",
            f"Reachability status: {sim_res.network_reachability_status}",
        ]
        if sim_res.avg_rtt_ms:
            observations.append(f"Average RTT: {sim_res.avg_rtt_ms} ms")
        if drop_node:
            observations.append(f"Packet drop localized at node '{drop_node}' (link '{drop_link}'): {drop_reason}")

        structured = [
            TestObservation(metric="packet_loss_pct", value=sim_res.packet_loss_percentage, interpretation="Packet loss rate"),
            TestObservation(metric="probes_delivered", value=sim_res.probes_received, interpretation="Successfully delivered count"),
            TestObservation(metric="observed_path", value=" -> ".join(sim_res.observed_path), interpretation="Actual hops traversed"),
        ]

        follow_up = []
        if passed:
            follow_up.append("Verify nominal forwarding path structure via Primary Path Test.")
        else:
            follow_up.append(f"Investigate localized drop point at node '{drop_node}' via Neighbor Investigation.")
            follow_up.append("Verify unaffected network branches via Branch Isolation Test.")

        return TestResult(
            test_id="baseline_connectivity",
            name="Baseline Connectivity Test",
            category=TestCategory.CONNECTIVITY,
            status=status,
            source=source,
            destination=destination,
            sequence_number=seq,
            timestamp_ms=round(time.time() * 1000.0, 2),
            duration_ms=0.0,
            expected_result="100% probe delivery (0% packet loss) to destination",
            actual_result=f"{sim_res.packet_loss_percentage}% loss ({sim_res.probes_received}/{sim_res.probes_sent} received)",
            observations=observations,
            structured_observations=structured,
            simulation_result=sim_res,
            failure_detected=not passed,
            drop_node=drop_node,
            drop_link=drop_link,
            drop_reason=drop_reason,
            nominal_path=sim_res.nominal_path,
            observed_path=sim_res.observed_path,
            follow_up_recommendations=follow_up,
        )

    # 2. Primary Path Test
    def _run_primary_path(
        self, source: str, destination: str, seq: int, params: Dict[str, Any]
    ) -> TestResult:
        if not self.topology.has_node(source) or not self.topology.has_node(destination):
            return TestResult(
                test_id="primary_path",
                name="Primary Path Analysis",
                category=TestCategory.PATH,
                status=TestStatus.FAILED,
                source=source,
                destination=destination,
                sequence_number=seq,
                timestamp_ms=round(time.time() * 1000.0, 2),
                duration_ms=0.0,
                expected_result=f"Active path between {source} and {destination}",
                actual_result="Source or destination does not exist in topology",
                failure_detected=True,
                follow_up_recommendations=["Inspect topology configuration."],
            )

        path_res = self.intelligence_engine.analyze_path(source, destination)
        physical_has_path = nx.has_path(self.topology.graph, source, destination)

        if path_res.reachable and path_res.primary_path:
            passed = True
            status = TestStatus.PASSED
            active_path = path_res.primary_path.hops
            hop_count = path_res.hop_count
            observations = [
                f"Active forwarding path resolved: {' -> '.join(active_path)}",
                f"Total hop distance: {hop_count} hops",
                f"Routing Selection Rule: {path_res.selection_rule}",
                "All intermediate forwarding interfaces are UP",
            ]
            if path_res.bottlenecks:
                observations.append(f"Critical bridge links along path: {', '.join(path_res.bottlenecks)}")
            actual_res = f"Active path verified ({hop_count} hops)"
            follow_up = ["Inspect network redundancy via Alternate Path Analysis."]
            drop_node = None
            drop_link = None
        else:
            passed = False
            status = TestStatus.FAILED
            observations = [
                f"No active forwarding path found between {source} and {destination}",
                f"Physical graph connectivity exists: {physical_has_path}",
                "One or more required links along the primary route are DOWN",
            ]
            actual_res = "Forwarding path broken / partitioned"
            follow_up = ["Isolate broken egress link via Neighbor Investigation."]
            # Determine likely cut point from physical path
            drop_node = None
            drop_link = None
            if physical_has_path:
                phys_path = nx.shortest_path(self.topology.graph, source, destination)
                for i in range(len(phys_path) - 1):
                    u, v = phys_path[i], phys_path[i + 1]
                    if self.topology.get_link_status(u, v) == "down":
                        drop_node = u
                        drop_link = f"{u}-{v}"
                        observations.append(f"Physical link '{drop_link}' is marked DOWN")
                        break

        structured = [
            TestObservation(metric="path_reachable", value=passed, interpretation="Is active path reachable"),
            TestObservation(metric="hop_count", value=len(active_path) - 1 if active_path else 0, interpretation="Path hop count"),
            TestObservation(metric="forwarding_path", value=active_path or [], interpretation="Active node sequence"),
        ]

        return TestResult(
            test_id="primary_path",
            name="Primary Path Analysis",
            category=TestCategory.PATH,
            status=status,
            source=source,
            destination=destination,
            sequence_number=seq,
            timestamp_ms=round(time.time() * 1000.0, 2),
            duration_ms=0.0,
            expected_result=f"Operational forwarding path from {source} to {destination}",
            actual_result=actual_res,
            observations=observations,
            structured_observations=structured,
            failure_detected=not passed,
            drop_node=drop_node,
            drop_link=drop_link,
            nominal_path=active_path or (nx.shortest_path(self.topology.graph, source, destination) if physical_has_path else []),
            observed_path=active_path or [],
            follow_up_recommendations=follow_up,
        )

    # 3. Neighbor / Interface Investigation
    def _run_neighbor_investigation(
        self, source: str, destination: str, seq: int, params: Dict[str, Any]
    ) -> TestResult:
        # Target router to investigate (defaults to drop node if passed, or R2 in baseline)
        target_node = params.get("target_node") or params.get("drop_node") or "R2"
        if not self.topology.has_node(target_node):
            target_node = "R2" if self.topology.has_node("R2") else list(self.topology.graph.nodes)[0]

        neighbors = list(self.topology.graph.neighbors(target_node))
        incident_links: List[Dict[str, Any]] = []
        down_links: List[str] = []
        up_links: List[str] = []

        for nbr in neighbors:
            status = self.topology.get_link_status(target_node, nbr)
            link_id = f"{target_node}-{nbr}"
            incident_links.append({"neighbor": nbr, "link_id": link_id, "status": status})
            if status == "down":
                down_links.append(link_id)
            else:
                up_links.append(link_id)

        failed_interface_found = len(down_links) > 0
        status = TestStatus.PASSED if failed_interface_found else TestStatus.PASSED

        observations = [
            f"Audited router '{target_node}' with {len(neighbors)} adjacent physical interfaces",
            f"Operational interfaces (UP): {', '.join(up_links) if up_links else 'None'}",
        ]
        if down_links:
            observations.append(f"FAULT ISOLATED: Inactive / DOWN interfaces: {', '.join(down_links)}")
            actual_res = f"Failing egress link identified: {', '.join(down_links)}"
        else:
            observations.append("All adjacent interfaces on this node report status UP")
            actual_res = "All adjacent interfaces operational"

        structured = [
            TestObservation(metric="target_router", value=target_node, interpretation="Audited router ID"),
            TestObservation(metric="total_interfaces", value=len(neighbors), interpretation="Total adjacent links"),
            TestObservation(metric="down_interfaces", value=down_links, interpretation="Confirmed down links"),
        ]

        follow_up = []
        if down_links:
            follow_up.append(f"Perform Branch Isolation to verify unaffected operational subnets.")
            follow_up.append(f"Check for topological bypasses via Alternate Path Redundancy Analysis.")

        return TestResult(
            test_id="neighbor_investigation",
            name="Neighbor / Interface Investigation",
            category=TestCategory.LINK_INVESTIGATION,
            status=status,
            source=source,
            destination=destination,
            sequence_number=seq,
            timestamp_ms=round(time.time() * 1000.0, 2),
            duration_ms=0.0,
            expected_result=f"Audit of interfaces adjacent to {target_node}",
            actual_result=actual_res,
            observations=observations,
            structured_observations=structured,
            failure_detected=failed_interface_found,
            drop_node=target_node if failed_interface_found else None,
            drop_link=down_links[0] if down_links else None,
            drop_reason=f"Link {down_links[0]} is DOWN" if down_links else None,
            follow_up_recommendations=follow_up,
        )

    # 4. Branch Isolation Test
    def _run_branch_isolation(
        self, source: str, destination: str, seq: int, params: Dict[str, Any]
    ) -> TestResult:
        # Determine branch destination: default to PC2 if present, or any node not on primary path
        branch_dest = params.get("branch_dest")
        if not branch_dest or not self.topology.has_node(branch_dest):
            if self.topology.has_node("PC2"):
                branch_dest = "PC2"
            else:
                # Find any node reachable from source that is not destination
                candidates = [
                    n for n in self.topology.graph.nodes
                    if n != source and n != destination and self.topology.has_path(source, n)
                ]
                branch_dest = candidates[0] if candidates else destination

        req = ProbeRequest(source=source, destination=branch_dest, probe_count=3)
        sim_res = self.probe_simulator.run_health_test(req)

        branch_healthy = sim_res.packet_loss_percentage == 0.0
        status = TestStatus.PASSED if branch_healthy else TestStatus.FAILED

        observations = [
            f"Branch verification probe: {source} -> {branch_dest}",
            f"Probes delivered: {sim_res.probes_received}/{sim_res.probes_sent} ({sim_res.packet_loss_percentage}% loss)",
            f"Observed branch path: {' -> '.join(sim_res.observed_path)}",
        ]
        if branch_healthy:
            observations.append(
                f"BRANCH ISOLATED & HEALTHY: Failure is confined to {destination} egress; branch to {branch_dest} is fully functional."
            )
            actual_res = f"Branch to {branch_dest} is HEALTHY (0% loss)"
            follow_up = ["Failure confirmed strictly localized; ready for causal diagnosis."]
        else:
            observations.append(
                f"BRANCH AFFECTED: Branch to {branch_dest} also experienced packet loss ({sim_res.packet_loss_percentage}%)."
            )
            actual_res = f"Branch to {branch_dest} also experiencing loss"
            follow_up = ["Failure may be systemic or located at an upstream aggregation node."]

        structured = [
            TestObservation(metric="branch_destination", value=branch_dest, interpretation="Target branch node"),
            TestObservation(metric="branch_loss_pct", value=sim_res.packet_loss_percentage, interpretation="Branch probe loss"),
            TestObservation(metric="branch_isolated_healthy", value=branch_healthy, interpretation="Is branch operational"),
        ]

        return TestResult(
            test_id="branch_isolation",
            name="Branch Isolation Test",
            category=TestCategory.BRANCH_ISOLATION,
            status=status,
            source=source,
            destination=branch_dest,
            sequence_number=seq,
            timestamp_ms=round(time.time() * 1000.0, 2),
            duration_ms=0.0,
            expected_result=f"Branch {source} -> {branch_dest} remains reachable (0% loss)",
            actual_result=actual_res,
            observations=observations,
            structured_observations=structured,
            simulation_result=sim_res,
            failure_detected=not branch_healthy,
            nominal_path=sim_res.nominal_path,
            observed_path=sim_res.observed_path,
            follow_up_recommendations=follow_up,
        )

    # 5. Alternate Path Redundancy Analysis
    def _run_alternate_path(
        self, source: str, destination: str, seq: int, params: Dict[str, Any]
    ) -> TestResult:
        if not self.topology.has_node(source) or not self.topology.has_node(destination):
            return TestResult(
                test_id="alternate_path",
                name="Alternate Path Redundancy Analysis",
                category=TestCategory.ALTERNATE_PATH,
                status=TestStatus.FAILED,
                source=source,
                destination=destination,
                sequence_number=seq,
                timestamp_ms=round(time.time() * 1000.0, 2),
                duration_ms=0.0,
                expected_result="Evaluate physical path redundancy",
                actual_result="Nodes not found in topology",
                failure_detected=True,
            )

        alt_res = self.intelligence_engine.get_alternate_paths(source, destination)
        total_paths_count = alt_res.total_physical_paths
        active_paths_count = alt_res.active_alternate_paths + (1 if alt_res.reachable else 0)
        has_redundancy = alt_res.redundancy_status in ["HIGH", "PARTIAL"]

        status = TestStatus.PASSED

        observations = [
            f"Physical graph simple paths between {source} and {destination}: {total_paths_count}",
            f"Currently operational active paths: {active_paths_count}",
            f"Topology Redundancy Classification: {alt_res.redundancy_status}",
        ]
        if total_paths_count <= 1:
            observations.append(
                "SINGLE POINT OF FAILURE DETECTED: Topology has strictly 1 physical path (no alternate bypass route)."
            )
            actual_res = "No topological redundancy (Single path topology)"
            follow_up = ["Flag single point of failure in network architecture report."]
        else:
            observations.append(
                f"REDUNDANCY AVAILABLE: {total_paths_count} physical paths exist in the network graph."
            )
            actual_res = f"{total_paths_count} physical paths available ({active_paths_count} active)"
            follow_up = ["Inspect routing protocol failover configuration."]

        structured = [
            TestObservation(metric="total_physical_paths", value=total_paths_count, interpretation="All simple physical paths"),
            TestObservation(metric="active_paths_count", value=active_paths_count, interpretation="Operational paths count"),
            TestObservation(metric="has_redundancy", value=has_redundancy, interpretation="Topological redundancy exists"),
        ]

        return TestResult(
            test_id="alternate_path",
            name="Alternate Path Redundancy Analysis",
            category=TestCategory.ALTERNATE_PATH,
            status=status,
            source=source,
            destination=destination,
            sequence_number=seq,
            timestamp_ms=round(time.time() * 1000.0, 2),
            duration_ms=0.0,
            expected_result="Evaluate physical network redundancy",
            actual_result=actual_res,
            observations=observations,
            structured_observations=structured,
            failure_detected=total_paths_count == 0,
            follow_up_recommendations=follow_up,
        )

    # 6. Recovery Test
    def _run_recovery(
        self, source: str, destination: str, seq: int, params: Dict[str, Any]
    ) -> TestResult:
        req = ProbeRequest(source=source, destination=destination, probe_count=3)
        sim_res = self.probe_simulator.run_health_test(req)

        recovered = sim_res.packet_loss_percentage == 0.0
        status = TestStatus.PASSED if recovered else TestStatus.FAILED

        observations = [
            f"Post-recovery verification probe: {source} -> {destination}",
            f"Probes delivered: {sim_res.probes_received}/{sim_res.probes_sent} ({sim_res.packet_loss_percentage}% loss)",
            f"Restored path: {' -> '.join(sim_res.observed_path)}",
        ]
        if recovered:
            observations.append("RECOVERY CONFIRMED: End-to-end connectivity fully restored (0% packet loss).")
            actual_res = "Connectivity restored (0% packet loss)"
            follow_up = ["Campaign can be marked as COMPLETED."]
        else:
            observations.append("RECOVERY FAILED: Destination remains unreachable after attempted restoration.")
            actual_res = f"Still failing: {sim_res.packet_loss_percentage}% loss"
            follow_up = ["Re-verify physical link status and node health."]

        structured = [
            TestObservation(metric="recovery_verified", value=recovered, interpretation="Is connectivity fully restored"),
            TestObservation(metric="packet_loss_pct", value=sim_res.packet_loss_percentage, interpretation="Post-repair packet loss"),
            TestObservation(metric="restored_path", value=sim_res.observed_path, interpretation="Active restored path"),
        ]

        return TestResult(
            test_id="recovery",
            name="Connectivity Recovery Verification",
            category=TestCategory.RECOVERY,
            status=status,
            source=source,
            destination=destination,
            sequence_number=seq,
            timestamp_ms=round(time.time() * 1000.0, 2),
            duration_ms=0.0,
            expected_result="0% probe packet loss after component restoration",
            actual_result=actual_res,
            observations=observations,
            structured_observations=structured,
            simulation_result=sim_res,
            failure_detected=not recovered,
            nominal_path=sim_res.nominal_path,
            observed_path=sim_res.observed_path,
            follow_up_recommendations=follow_up,
        )

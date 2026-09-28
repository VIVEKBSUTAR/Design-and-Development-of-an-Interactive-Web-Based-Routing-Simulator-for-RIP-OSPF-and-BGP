from typing import List, Optional
from topology.network import NetworkTopology, TopologyData
from failure.signature import FailureSignatureGenerator, FailureSignature
from causal.dependency import CausalDependencyGenerator, DependencyGraph
from reduction.reducer import (
    FailureReducer,
    compare_signatures,
    compare_dependencies,
)
from reproduction.models import (
    ReproductionRun,
    ReproductionResponse,
)


class FailureReproducer:
    """
    Failure Reproduction and Validation Engine (Phase 6).
    Replays the target network failure on the reduced topology across independent runs
    to empirically validate that the reduced failure environment preserves the exact
    failure signature and causal dependencies.
    """

    def __init__(
        self,
        topology: NetworkTopology,
        failure_generator: FailureSignatureGenerator,
        causal_generator: CausalDependencyGenerator,
        reducer: Optional[FailureReducer] = None,
    ):
        self.topology = topology
        self.failure_generator = failure_generator
        self.causal_generator = causal_generator
        self.reducer = reducer or FailureReducer(
            topology, failure_generator, causal_generator
        )

    def run_reproduction_experiment(
        self,
        runs: int = 3,
        source: str = "PC1",
        destination: str = "Server",
    ) -> ReproductionResponse:
        """
        Executes the reproduction and validation pipeline:
        1. Reset topology to clean baseline.
        2. Run the Phase 5.1 reduction experiment.
        3. Store target failure signature, target causal dependencies, and final reduced topology.
        4. For each run (default: 3):
           a. Restore/load the reduced topology.
           b. Ensure all links are UP.
           c. Capture the pre-failure baseline path.
           d. Verify baseline path matches target baseline path.
           e. Inject target R2-R3 link failure.
           f. Generate fresh failure signature.
           g. Generate fresh causal dependencies.
           h. Compare candidate signature against target signature.
           i. Compare candidate dependencies against target dependencies.
           j. Mark run successful ONLY when:
              signature_match == True AND dependency_match == True AND baseline_path_match == True.
        5. Validate reproduction iff successful_runs == total_runs.
        """
        # Step 1: Reset topology to clean baseline
        self.topology.reset()

        # Step 2: Run existing Phase 5.1 reduction experiment
        reduction_resp = self.reducer.run_reduction_experiment(
            candidates=["PC2", "R4", "R1"],
            source=source,
            destination=destination,
        )

        # Step 3: Store target failure signature, target causal dependencies, and final reduced topology
        target_failure: FailureSignature = reduction_resp.target_failure
        target_dependencies: DependencyGraph = reduction_resp.target_dependencies
        reduced_topology: TopologyData = reduction_resp.final_topology

        # Capture a clean snapshot of the reduced topology with all links UP
        for u, v in list(self.topology.graph.edges()):
            self.topology.graph[u][v]["status"] = "up"
        reduced_snapshot = self.topology.snapshot()

        # Step 4: Execute independent reproduction runs
        run_results: List[ReproductionRun] = []
        last_signature: Optional[FailureSignature] = None
        last_dependencies: Optional[DependencyGraph] = None

        for run_idx in range(1, runs + 1):
            # a. Restore/load the reduced topology
            self.topology.restore_snapshot(reduced_snapshot)

            # b. Ensure all links are UP
            for u, v in list(self.topology.graph.edges()):
                self.topology.graph[u][v]["status"] = "up"

            # c. Capture the pre-failure baseline path
            candidate_baseline_path = self.topology.get_path(source, destination)

            # d. Verify baseline path matches target baseline path
            baseline_path_match = (
                candidate_baseline_path == target_failure.baseline_path
            )

            # e. Inject the target R2-R3 link failure
            self.topology.fail_link("R2", "R3")

            # f. Generate fresh failure signature
            candidate_sig = self.failure_generator.generate_signature(
                source=source,
                destination=destination,
                baseline_path=candidate_baseline_path,
            )

            # g. Generate fresh causal dependencies
            candidate_deps = self.causal_generator.generate_dependencies(
                source=source,
                destination=destination,
                baseline_path=candidate_baseline_path,
            )

            # h. Compare candidate signature against target signature
            sig_comp = compare_signatures(target_failure, candidate_sig)

            # i. Compare candidate dependencies against target dependencies
            dep_comp = compare_dependencies(target_dependencies, candidate_deps)

            # j. Mark the run successful ONLY when:
            # signature_match == True AND dependency_match == True AND baseline_path_match == True
            is_run_successful = (
                sig_comp.match is True
                and dep_comp.match is True
                and baseline_path_match is True
            )

            status = "SUCCESS" if is_run_successful else "FAILED"

            if is_run_successful:
                msg = (
                    f"Run {run_idx}: Target failure signature, causal dependencies, "
                    f"and baseline path successfully reproduced."
                )
            else:
                failure_reasons = []
                if not sig_comp.match:
                    failure_reasons.append(f"signature mismatch ({sig_comp.changed_fields})")
                if not dep_comp.match:
                    failure_reasons.append(f"dependency mismatch ({dep_comp.missing_relationships})")
                if not baseline_path_match:
                    failure_reasons.append(
                        f"baseline path mismatch (expected {target_failure.baseline_path}, got {candidate_baseline_path})"
                    )
                msg = f"Run {run_idx} failed: {', '.join(failure_reasons)}."

            run_results.append(
                ReproductionRun(
                    run_number=run_idx,
                    status=status,
                    signature_match=sig_comp.match,
                    dependency_match=dep_comp.match,
                    baseline_path_match=baseline_path_match,
                    message=msg,
                )
            )

            last_signature = candidate_sig
            last_dependencies = candidate_deps

        # Step 5: Validate reproduction across all runs
        successful_runs = sum(1 for r in run_results if r.status == "SUCCESS")
        reproduction_validated = (successful_runs == runs) and (runs > 0)

        if reproduction_validated:
            summary_message = (
                f"Reduced topology reproduced the target failure across {runs} independent runs."
            )
        else:
            summary_message = (
                f"Reproduction failed: {successful_runs} of {runs} runs succeeded."
            )

        return ReproductionResponse(
            target_failure=target_failure,
            target_dependencies=target_dependencies,
            reduced_topology=reduced_topology,
            total_runs=runs,
            successful_runs=successful_runs,
            reproduction_validated=reproduction_validated,
            runs=run_results,
            final_signature=last_signature,
            final_dependencies=last_dependencies,
            message=summary_message,
        )

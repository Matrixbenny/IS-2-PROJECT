import unittest

from ml.src.diagnose_fit import verdict
from ml.src.readiness import REAL_STATUS, assess

GOOD_FIT = {"verdict": {"fit_ok": True, "findings": ["ok"]}}


def evaluation(**overrides):
    base = {
        "data_status": REAL_STATUS,
        "rows": 600,
        "category_counts": {name: 60 for name in "ABCDEFGHI"},
        "outer_fold_macro_f1_mean": 0.85,
        "outer_fold_macro_f1_std": 0.03,
        "nested_out_of_fold": {"per_category": {name: {"recall": 0.8} for name in "ABCDEFGHI"}},
        "subgroups": {"language": {"English": {"status": "aggregate_only", "macro_f1": 0.86},
                                   "Kiswahili": {"status": "aggregate_only", "macro_f1": 0.83}}},
    }
    base.update(overrides)
    return base


class ReadinessGateTests(unittest.TestCase):
    def test_synthetic_data_can_never_pass_however_good_the_score(self):
        result = assess(evaluation(data_status="synthetic_only_not_for_real_world_validation_or_production_training",
                                   outer_fold_macro_f1_mean=0.99, outer_fold_macro_f1_std=0.0), GOOD_FIT)
        self.assertFalse(result["ready_to_claim_real_world_accuracy"])

    def test_real_data_with_every_check_met_passes(self):
        self.assertTrue(assess(evaluation(), GOOD_FIT)["ready_to_claim_real_world_accuracy"])

    def test_each_failure_blocks_readiness(self):
        failing = [
            evaluation(rows=100),
            evaluation(category_counts={**{name: 60 for name in "ABCDEFGH"}, "I": 5}),
            evaluation(outer_fold_macro_f1_mean=0.72, outer_fold_macro_f1_std=0.05),
            evaluation(nested_out_of_fold={"per_category": {"A": {"recall": 0.2}}}),
            evaluation(subgroups={"language": {"English": {"status": "aggregate_only", "macro_f1": 0.9},
                                               "Kiswahili": {"status": "aggregate_only", "macro_f1": 0.6}}}),
        ]
        for case in failing:
            self.assertFalse(assess(case, GOOD_FIT)["ready_to_claim_real_world_accuracy"])
        self.assertFalse(assess(evaluation(), None)["ready_to_claim_real_world_accuracy"], "needs a fit diagnosis")


class FitVerdictTests(unittest.TestCase):
    CONTROL = {"shuffled_macro_f1": 0.10, "chance": 0.1111}

    def test_large_train_validation_gap_is_overfitting(self):
        result = verdict({"train_macro_f1": 1.0, "gap": 0.2}, [], self.CONTROL)
        self.assertFalse(result["fit_ok"])

    def test_low_training_score_is_underfitting(self):
        self.assertFalse(verdict({"train_macro_f1": 0.5, "gap": 0.0}, [], self.CONTROL)["fit_ok"])

    def test_shuffled_labels_scoring_above_chance_means_leakage(self):
        self.assertFalse(verdict({"train_macro_f1": 0.95, "gap": 0.05}, [], {"shuffled_macro_f1": 0.5, "chance": 0.11})["fit_ok"])

    def test_healthy_fit_passes(self):
        self.assertTrue(verdict({"train_macro_f1": 0.95, "gap": 0.05}, [], self.CONTROL)["fit_ok"])


if __name__ == "__main__":
    unittest.main()

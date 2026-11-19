import random
import unittest

from ml.lingo.evaluate_lingo import Normaliser, make_mixed, make_slang_only, split_lexicon, sms_noise
from ml.lingo.fetch_corpora import licence_decision
from ml.lingo.ingest_dictionary import parse_entries, split_entry

CONFIG = {"allowed_licences": ["afl-3.0", "cc-by-sa-3.0", "cc-by-4.0"], "noncommercial_licences": []}


class LicenceGateTests(unittest.TestCase):
    def test_accepts_an_approved_licence(self):
        self.assertTrue(licence_decision(["afl-3.0"], CONFIG)[0])

    def test_dual_licence_needs_only_one_approved_choice(self):
        self.assertTrue(licence_decision(["cc-by-sa-3.0", "gfdl"], CONFIG)[0])

    def test_refuses_unknown_missing_or_unapproved_licences(self):
        self.assertFalse(licence_decision([], CONFIG)[0])
        self.assertFalse(licence_decision(["unknown"], CONFIG)[0])
        self.assertFalse(licence_decision(["proprietary"], CONFIG)[0])


class BenchmarkIntegrityTests(unittest.TestCase):
    LEXICON = {
        "hongo": "rushwa bribe", "kitu kidogo": "rushwa bribe", "chaidai": "demanded money bribe",
        "kula pesa": "embezzle misappropriated funds", "pesa imeliwa": "embezzle misappropriated funds",
        "kupanga zabuni": "bid rigging tender", "zabuni feki": "fake tender procurement",
    }

    def test_known_and_unseen_slang_never_overlap(self):
        known, unseen = split_lexicon(self.LEXICON, random.Random(1))
        for category in set(known) & set(unseen):
            self.assertFalse(set(known[category]) & set(unseen[category]),
                             "a term must not be both known to the model and held out for testing")

    def test_normaliser_only_knows_the_terms_it_is_given(self):
        normalise = Normaliser({"hongo": "rushwa bribe"})
        self.assertEqual(normalise("Walinidai HONGO!"), "walinidai rushwa bribe")
        self.assertEqual(normalise("chaidai"), "chaidai")  # unseen slang is left alone

    def test_variants_are_reproducible_for_a_seed(self):
        terms = {"Bribery": ["hongo"]}
        first = make_mixed("A clerk asked for money.", "Bribery", terms, random.Random(7))
        second = make_mixed("A clerk asked for money.", "Bribery", terms, random.Random(7))
        self.assertEqual(first, second)
        slang = make_slang_only("Bribery", terms, random.Random(3))
        # Spelling noise may double or drop letters ("hoongo"), but the sentence is built around the term.
        self.assertRegex(slang, r"h\w*ng\w*")

    def test_spelling_noise_keeps_text_readable(self):
        noisy = sms_noise("Karani alidai hongo kabla ya kunisaidia.", random.Random(2))
        self.assertTrue(noisy.islower())
        self.assertNotIn(".", noisy)


class DictionaryIngestTests(unittest.TestCase):
    SAMPLE = (
        "honga to bribe; kuhonga.\n\n"
        "iya to steal; kuiba. Mutu iya.\n\n"
        "   tiya adabu punish; kuadhibu.\n"
    )

    def test_headwords_start_entries_and_indented_lines_join_them(self):
        entries = parse_entries(self.SAMPLE)
        self.assertEqual(len(entries), 2)
        self.assertIn("punish", entries[1])

    def test_entry_is_split_into_term_english_and_kiswahili(self):
        self.assertEqual(split_entry("honga to bribe; kuhonga."), ("honga", "to bribe", "kuhonga"))


if __name__ == "__main__":
    unittest.main()

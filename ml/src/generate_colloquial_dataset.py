"""Second synthetic corpus: how citizens actually write, not how a report form reads.

The seed corpus (generate_synthetic_dataset.py) is deliberately formal. Every
incident is phrased as "A licensing officer allegedly asked for an unofficial
payment...". A model trained only on that learns the register, and reports an
inflated score, because real reports do not sound like that.

This generator adds the registers that were missing:

  * short, plain first-person accounts ("Asked for 500 to stamp my papers.")
  * SMS-style spelling and missing punctuation ("dey askd me 4 500 2 sign")
  * Sheng and code-switching ("Kanjo alinidai kitu kidogo"), including the slang
    the glossary now understands, so the corpus exercises the normaliser
  * second-hand and question forms ("My brother says the clerk...", "Why do I
    have to pay...?")

Every incident is fictional and every label is one of the nine canonical
categories. Nothing here is an observation of a real Kenyan report, and the same
caveats as the seed corpus apply: it tests the pipeline, it does not establish
real-world accuracy.

Usage:
    python -m ml.src.generate_colloquial_dataset
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import NamedTuple

from ml.src.dataset import CATEGORIES

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "synthetic"
OUTPUT_CSV = OUTPUT_DIR / "kenya_watch_synthetic_colloquial.csv"
OUTPUT_METADATA = OUTPUT_DIR / "kenya_watch_synthetic_colloquial.metadata.json"

FICTIONAL_COUNTIES = ("Nairobi", "Mombasa", "Kisumu", "Nakuru", "Meru", "Kitui", "Kilifi", "Bungoma")


class Incident(NamedTuple):
    english: tuple[str, ...]
    sheng: tuple[str, ...]


# Six incidents per category, each carried by several short variants. The variants
# deliberately differ in *how* the same allegation is told, because that variation
# is the thing the seed corpus lacked.
INCIDENTS: dict[str, tuple[Incident, ...]] = {
    "Bribery": (
        Incident(
            ("Asked for 500 before he would stamp my papers.", "the clerk wanted something small to sign my form"),
            ("Alinidai kitu kidogo ndio apige stempu.", "msee akaniambia nilete hongo ya 500"),
        ),
        Incident(
            ("dey askd me 4 500 2 fix ma permit", "officer said pay me n ill approve it quick"),
            ("kanjo alinidai 500 nimpitishe haraka", "aliniambia nitoe chai ya stempu"),
        ),
        Incident(
            ("My brother says the lands clerk wanted money to open the file.", "he was asked for a bribe at the counter"),
            ("Jamaa yangu alidaiwa rushwa kwa ofisi ya lands.", "karani alitaka pesa aonee faili"),
        ),
        Incident(
            ("Why do I have to pay extra for a service I already paid for?", "they want payment in hand to serve us"),
            ("Kwa nini nilipe zaidi kwa huduma nimeshalipa?", "wanataka malipo ya mkono kwa huduma"),
        ),
        Incident(
            ("Inspector from health came and demanded a gift for the certificate.", "he asked for something for himself before signing"),
            ("Mkaguzi wa afya alidai zawadi kwa cheti.", "alitaka kitu chake kabla ya kutia sahihi"),
        ),
        Incident(
            ("The guy at the window said no money no service.", "he wanted a kickback to process my invoice"),
            ("Msee wa dirisha akasema hakuna pesa hakuna huduma.", "alitaka kitu kidogo kushughulikia ankara"),
        ),
    ),
    "Embezzlement": (
        Incident(
            ("The CDF money for the borehole is gone and nothing was built.", "the funds disappeared and the project stopped"),
            ("Mullah za CDF zimepotea na hakuna kisima.", "doo za mradi zilipotea ghafla"),
        ),
        Incident(
            ("money 4 the shcool lunch program is missing", "the bursary cash was withdrawn n never seen"),
            ("pesa za chakula cha shule zimepotea", "fedha za bursary zilichukuliwa hazikuonekana"),
        ),
        Incident(
            ("Says the clerk diverted the health budget to his own account.", "the funds were misappropriated quietly"),
            ("Anasema karani alichota fedha za afya.", "fedha za umma zilitumika vibaya"),
        ),
        Incident(
            ("Where did the county money for the road go?", "the budget for the dispensary vanished"),
            ("Fedha za barabara zilienda wapi?", "bajeti ya zahanati ilipotea"),
        ),
        Incident(
            ("He took all the money and left the project half done.", "the cash meant for supplies was never used for supplies"),
            ("Alichukua doo zote akaacha mradi nusu.", "pesa ya vifaa haikununua vifaa"),
        ),
        Incident(
            ("Water project money missing from the account", "they ate the funds for the youth program"),
            ("Pesa ya mradi wa maji haipo kwa akaunti", "walikula fedha za vijana"),
        ),
    ),
    "Procurement Fraud": (
        Incident(
            ("The tender for the road was already decided before it opened.", "the bid was rigged for one company"),
            ("Zabuni ya barabara ilikuwa imeamuliwa kabla kufunguliwa.", "zabuni ilipangwa kwa kampuni moja"),
        ),
        Incident(
            ("contract was inflated n the co is owned by a relative", "ghost supplier invoiced for nothing"),
            ("bei ya mkataba ilipandishwa na kampuni ni ya ndugu", "msambazaji wa hewa alitoa ankara"),
        ),
        Incident(
            ("Says the evaluation committee read only one bid.", "the award went to the company that did not quote lowest"),
            ("Anasema kamati ilisoma zabuni moja tu.", "tuzo ilienda kwa kampuni isiyo na bei ya chini"),
        ),
        Incident(
            ("Why did the hospital pay for 40 beds and receive 12?", "the same supplier wins every tender"),
            ("Kwa nini hospitali ililipa vitanda 40 ikapokea 12?", "msambazaji mmoja hushinda zabuni zote"),
        ),
        Incident(
            ("The tender documents were changed after closing.", "the contract price doubled after signing"),
            ("Nyaraka za zabuni zilibadilishwa baada ya kufungwa.", "bei ya mkataba iliongezwa mara mbili"),
        ),
        Incident(
            ("company registered last month won a 200m tender", "they split the contract to avoid the limit"),
            ("kampuni iliyosajiliwa mwezi juzi ikashinda zabuni ya milioni", "waligawanya mkataba kuepuka kikomo"),
        ),
    ),
    "Abuse of Office": (
        Incident(
            ("He used his position to have my licence cancelled.", "the officer misused his office against me"),
            ("Alitumia ofisi yake kufuta leseni yangu.", "alitumia cheo vibaya dhidi yangu"),
        ),
        Incident(
            ("chief used his power 2 close my shop", "he abused his position to punish me"),
            ("chief alitumia mamlaka kufunga duka langu", "alitumia ofisi kuniadhibu"),
        ),
        Incident(
            ("Says the director ordered staff to serve his friends first.", "the boss used the office for personal orders"),
            ("Anasema mkurugenzi aliamuru wafuasi wahudumiwe kwanza.", "bosi alitumia ofisi kwa maagizo binafsi"),
        ),
        Incident(
            ("Why does the officer decide who gets served and who waits?", "he acts as if the office belongs to him"),
            ("Kwa nini afisa anaamua nani ahudumiwe?", "anafanya kama ofisi ni yake"),
        ),
        Incident(
            ("The officer refused to release my documents without reason.", "he used his power to delay my case"),
            ("Afisa alikataa kutoa nyaraka bila sababu.", "alitumia mamlaka kuchelewesha kesi yangu"),
        ),
        Incident(
            ("manager blocked my transfer after I complained", "he misused the position to silence us"),
            ("meneja alizuia uhamisho wangu baada ya malalamiko", "alitumia cheo kutunyamazisha"),
        ),
    ),
    "Nepotism/Favoritism": (
        Incident(
            ("The job went to the manager's cousin, not to those who applied.", "they hired a relative who never applied"),
            ("Kazi ilienda kwa ndugu wa meneja, si kwa walioomba.", "waliajiri ndugu ambaye hakuomba"),
        ),
        Incident(
            ("his daughter got the post w no interview", "they only hire ppl from their village"),
            ("mtoto wake akapata kazi bila usaili", "wanaajiri ndugu tu"),
        ),
        Incident(
            ("Says the promotion list is all names from one family.", "the contract was given to a family friend"),
            ("Anasema orodha ya kupandishwa ni ndugu tu.", "mkataba ulipewa rafiki wa familia"),
        ),
        Incident(
            ("Why was I skipped when her nephew was hired?", "the vacancy was never advertised"),
            ("Kwa nini nilipitwa huku mpwa wake akaajiriwa?", "nafasi haikutangazwa"),
        ),
        Incident(
            ("Every posting in this office goes to the same clan.", "the shortlist was already known"),
            ("Nafasi zote ofisi hii zinenda kwa kabila moja.", "orodha ya mwisho ilijulikana"),
        ),
        Incident(
            ("my sister was denied the job but the chief's son got it", "favouritism in the recruitment"),
            ("dada yangu alinyimwa kazi lakini mtoto wa chief akapata", "upendeleo kwa ndugu kwenye kuajiri"),
        ),
    ),
    "Extortion": (
        Incident(
            ("He said if I refuse he will have me arrested.", "the officer threatened me until I paid"),
            ("Alisema nikikataa atanifunga.", "afisa alinitishia hadi nililipa"),
        ),
        Incident(
            ("karao said pay or ill sleep in cells", "they threatened to cut me if i didnt pay"),
            ("karao akasema lipe au ulale ndani", "walinitishia kunichoma kisu nikikataa"),
        ),
        Incident(
            ("Says the guard demanded money to let the lorry pass.", "he forced my brother to pay at the gate"),
            ("Anasema mlinzi alidai pesa lori ipite.", "alimlazimisha ndugu yangu kulipa langoni"),
        ),
        Incident(
            ("Why must I pay to be released at the roadblock?", "he would not let me go without payment"),
            ("Kwa nini nilipie nitolewe kwenye kizuizi?", "hakuachia bila malipo"),
        ),
        Incident(
            ("The man at the gate threatened my staff until we paid.", "he demanded and warned us of consequences"),
            ("Mtu wa lango alitishia wafanyakazi hadi tulilipa.", "alidai na kututishia madhara"),
        ),
        Incident(
            ("askari held my id n said pay 200 or else", "forced to pay under threat"),
            ("askari akashika kitambulisho akasema lipe 200 au la", "kulazimishwa kulipa kwa vitisho"),
        ),
    ),
    "Fraud/Forgery of Documents": (
        Incident(
            ("The receipt they gave me has a different name on it.", "the certificate is fake"),
            ("Risiti waliyonipa ina jina lingine.", "cheti ni bandia"),
        ),
        Incident(
            ("signature on my form was forged", "the land title is fake n was printed elsewhere"),
            ("sahihi kwenye fomu yangu ilighushiwa", "hati ya ardhi ni bandia"),
        ),
        Incident(
            ("Says the payslip submitted was not the real one.", "the academic paper is a forgery"),
            ("Anasema payslip iliyowasilishwa si ya kweli.", "karatasi ya masomo ni ya kughushi"),
        ),
        Incident(
            ("Why does the record show a payment I never made?", "the invoice number does not exist in the system"),
            ("Kwa nini rekodi inaonyesha malipo nisiyofanya?", "namba ya ankara haipo kwenye mfumo"),
        ),
        Incident(
            ("The clearance letter carries a stamp that is not theirs.", "they falsified the delivery note"),
            ("Barua ya kibali ina muhuri si wao.", "walighushi hati ya uwasilishaji"),
        ),
        Incident(
            ("my degree cert was changed", "they edited the register to add a name"),
            ("cheti changu cha shahada kilibadilishwa", "walibadilisha rejista kuongeza jina"),
        ),
    ),
    "Conflict of Interest": (
        Incident(
            ("The officer who approved the tender owns the company.", "he had a personal interest in the award"),
            ("Afisa aliyeidhinisha zabuni anamiliki kampuni.", "alikuwa na maslahi binafsi kwenye tuzo"),
        ),
        Incident(
            ("director sits on the board n also owns the supplier", "he never declared his shares"),
            ("mkurugenzi ni mjumbe na pia anamiliki msambazaji", "hakutoa tamko la hisa zake"),
        ),
        Incident(
            ("Says the committee chair has a stake in the winning bid.", "an undisclosed interest affected the decision"),
            ("Anasema mwenyekiti ana hisa kwa zabuni iliyoshinda.", "maslahi yasiyotangazwa yaliathiri uamuzi"),
        ),
        Incident(
            ("Why is his own brother working for the company he supervises?", "he approved a payment to himself"),
            ("Kwa nini ndugu yake anafanya kazi kwa kampuni anayoisimamia?", "aliidhinisha malipo kwake mwenyewe"),
        ),
        Incident(
            ("The officer signed for land next to his own plot.", "a financial interest was never disclosed"),
            ("Afisa alitia sahihi ardhi jirani na yake.", "maslahi ya kifedha hayakutangazwa"),
        ),
        Incident(
            ("manager approved his wifes company", "family interest in the contract"),
            ("meneja aliidhinisha kampuni ya mkewe", "maslahi ya familia kwenye mkataba"),
        ),
    ),
    "Other": (
        Incident(
            ("The office sells public forms at three times the printed price.", "they charge for a service that should be free"),
            ("Ofisi inauza fomu kwa bei mara tatu.", "wanatoza huduma ambayo ni bure"),
        ),
        Incident(
            ("staff keep our files n refuse to return them", "the queue is moved only for those who know someone"),
            ("wafanyakazi wanashikilia faili zetu", "foleni inasogea kwa wanaojuana tu"),
        ),
        Incident(
            ("Says the office closed early for three weeks with no notice.", "nobody answers the phone or the counter"),
            ("Anasema ofisi ilifungwa wiki tatu bila taarifa.", "hakuna anayejibu simu wala dirisha"),
        ),
        Incident(
            ("Why are we sent from one office to another for the same paper?", "nobody will say who is responsible"),
            ("Kwa nini tunapelekwa ofisi moja hadi nyingine?", "hakuna anayesema nani mhusika"),
        ),
        Incident(
            ("The public notice was changed after people complained.", "the rules keep changing without explanation"),
            ("Taarifa ya umma ilibadilishwa baada ya malalamiko.", "sheria zinabadilika bila maelezo"),
        ),
        Incident(
            ("water point closed for months no reason", "promised road never built no explanation"),
            ("kituo cha maji kimefungwa miezi hakuna sababu", "barabara iliyoahidiwa haikujengwa"),
        ),
    ),
}


def rows_for_dataset() -> list[dict[str, str]]:
    if set(INCIDENTS) != set(CATEGORIES):
        raise ValueError("Colloquial incidents must match the canonical category taxonomy exactly.")

    rows: list[dict[str, str]] = []
    for category in CATEGORIES:
        for index, incident in enumerate(INCIDENTS[category], start=1):
            group_id = f"colloquial-{category.lower().replace('/', '-').replace(' ', '-')}-{index:02d}"
            variants = [("English", text) for text in incident.english] + [("Sheng", text) for text in incident.sheng]
            for offset, (language, text) in enumerate(variants):
                rows.append({
                    "text": text,
                    "label": category,
                    "group_id": group_id,
                    "language": language,
                    "county": FICTIONAL_COUNTIES[(index + offset) % len(FICTIONAL_COUNTIES)],
                })
    return rows


def main() -> None:
    rows = rows_for_dataset()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=("text", "label", "group_id", "language", "county"))
        writer.writeheader()
        writer.writerows(rows)

    by_language: dict[str, int] = {}
    for row in rows:
        by_language[row["language"]] = by_language.get(row["language"], 0) + 1

    OUTPUT_METADATA.write_text(json.dumps({
        "dataset_name": "Kenya Watch synthetic colloquial corpus",
        "status": "synthetic_only_not_for_real_world_validation_or_production_training",
        "generation_method": "Hand-authored fictional allegations written in several registers (plain, SMS-style, Sheng/code-switched, second-hand, question form)",
        "rows": len(rows),
        "scenario_groups": len({row["group_id"] for row in rows}),
        "scenarios_per_category": {category: len(INCIDENTS[category]) for category in CATEGORIES},
        "language_rows": by_language,
        "fictional_county_values_for_audit_only": list(FICTIONAL_COUNTIES),
        "limitations": [
            "Synthetic text is not an observation of a real Kenyan report.",
            "The Sheng passages are written by the project author and have not been verified by a native speaker.",
            "Variants within a group describe one incident and must stay in the same validation fold.",
            "Scores on this corpus measure behaviour across registers; they are still not a real-world accuracy estimate.",
        ],
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "rows": len(rows),
        "scenario_groups": len({row["group_id"] for row in rows}),
        "by_language": by_language,
        "csv": str(OUTPUT_CSV),
        "warning": "Synthetic-only. Not evidence of real-world accuracy.",
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

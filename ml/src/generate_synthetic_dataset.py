"""Generate a deterministic fictional corpus for testing the ML pipeline only."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import NamedTuple

from ml.src.dataset import CATEGORIES

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "synthetic"
OUTPUT_CSV = OUTPUT_DIR / "kenya_watch_synthetic_seed.csv"
OUTPUT_METADATA = OUTPUT_DIR / "kenya_watch_synthetic_seed.metadata.json"
VARIANTS_PER_SCENARIO = 4
FICTIONAL_COUNTIES = (
    "Nairobi",
    "Mombasa",
    "Kisumu",
    "Nakuru",
    "Turkana",
    "Garissa",
    "Kilifi",
    "Bungoma",
    "Meru",
    "Kitui",
)


class Scenario(NamedTuple):
    english: str
    kiswahili: str


SCENARIOS: dict[str, tuple[Scenario, ...]] = {
    "Bribery": (
        Scenario(
            "A licensing officer allegedly asked for an unofficial payment before approving a complete small-business permit application.",
            "Afisa wa leseni anadaiwa kuomba malipo yasiyo rasmi kabla ya kuidhinisha ombi kamili la kibali cha biashara ndogo.",
        ),
        Scenario(
            "A resident says a public clerk requested cash to move a land-record search ahead of other applications.",
            "Mkazi anasema karani wa umma aliomba pesa ili kuharakisha upekuzi wa rekodi ya ardhi kuliko maombi mengine.",
        ),
        Scenario(
            "A county employee allegedly offered to speed up inspection clearance in exchange for a personal payment.",
            "Mfanyakazi wa kaunti anadaiwa kutoa ahadi ya kuharakisha kibali cha ukaguzi badala ya malipo binafsi.",
        ),
        Scenario(
            "A public health inspector allegedly requested a gift before issuing a routine food-premises certificate.",
            "Mkaguzi wa afya ya umma anadaiwa kuomba zawadi kabla ya kutoa cheti cha kawaida cha eneo la chakula.",
        ),
        Scenario(
            "A service applicant reports that an official asked for money to release a document that was already approved.",
            "Mwombaji wa huduma anaripoti kuwa afisa aliomba pesa ili kutoa hati ambayo tayari ilikuwa imeidhinishwa.",
        ),
        Scenario(
            "A public employee allegedly asked a supplier for a personal benefit in return for processing an invoice promptly.",
            "Mfanyakazi wa umma anadaiwa kuomba manufaa binafsi kutoka kwa msambazaji ili kushughulikia ankara haraka.",
        ),
        Scenario(
            "A resident alleges that an unofficial fee was requested to obtain a place in a public-service queue.",
            "Mkazi anadai kuwa ada isiyo rasmi iliombwa ili kupata nafasi kwenye foleni ya huduma ya umma.",
        ),
        Scenario(
            "An officer allegedly promised to omit a routine penalty after receiving a private payment.",
            "Afisa anadaiwa kuahidi kuondoa adhabu ya kawaida baada ya kupokea malipo ya faragha.",
        ),
        Scenario(
            "A contractor says a public employee requested a personal commission for certifying completed work.",
            "Mkandarasi anasema mfanyakazi wa umma aliomba kamisheni binafsi ili kuthibitisha kazi iliyokamilika.",
        ),
        Scenario(
            "A trader reports being asked for an unofficial payment before a market-stall allocation was processed.",
            "Mfanyabiashara anaripoti kuombwa malipo yasiyo rasmi kabla ya kushughulikiwa kwa mgao wa kibanda sokoni.",
        ),
        Scenario(
            "A public clerk allegedly requested money to issue a routine copy of a record already held by the office.",
            "Karani wa umma anadaiwa kuomba pesa ili kutoa nakala ya kawaida ya rekodi ambayo ofisi tayari inayo.",
        ),
        Scenario(
            "A supplier reports an official asked for a personal reward before confirming delivery of standard materials.",
            "Msambazaji anaripoti kuwa afisa aliomba zawadi binafsi kabla ya kuthibitisha uwasilishaji wa vifaa vya kawaida.",
        ),
        Scenario(
            "A resident says a public officer requested a private payment to schedule an ordinary inspection.",
            "Mkazi anasema afisa wa umma aliomba malipo ya faragha ili kupanga ukaguzi wa kawaida.",
        ),
        Scenario(
            "An applicant alleges a staff member requested a personal gift before forwarding a complete service form.",
            "Mwombaji anadai kuwa mfanyakazi aliomba zawadi binafsi kabla ya kupeleka fomu kamili ya huduma.",
        ),
        Scenario(
            "A business owner says a public officer asked for money to perform a duty that should have been routine.",
            "Mmiliki wa biashara anasema afisa wa umma aliomba pesa ili kutekeleza jukumu la kawaida.",
        ),
    ),
    "Embezzlement": (
        Scenario(
            "A school committee says money allocated for classroom repairs was withdrawn but the repairs were never done.",
            "Kamati ya shule inasema pesa za ukarabati wa darasa zilitolewa lakini ukarabati haukufanyika.",
        ),
        Scenario(
            "A clinic inventory review allegedly found public medical supplies recorded as issued but missing from storage.",
            "Ukaguzi wa stoo ya kliniki unadaiwa kupata vifaa vya afya vya umma vilivyoandikwa kuwa vimetolewa lakini havipo.",
        ),
        Scenario(
            "A community group reports that funds for a water point were transferred to an unrelated private account.",
            "Kikundi cha jamii kinaripoti kuwa pesa za kituo cha maji zilihamishiwa kwenye akaunti binafsi isiyohusika.",
        ),
        Scenario(
            "A public works team says fuel bought for government vehicles was diverted for private use.",
            "Timu ya kazi za umma inasema mafuta yaliyonunuliwa kwa magari ya serikali yalielekezwa kwa matumizi binafsi.",
        ),
        Scenario(
            "A project audit allegedly found that building materials paid for from a public budget were removed for private use.",
            "Ukaguzi wa mradi unadaiwa kubaini kuwa vifaa vya ujenzi vilivyolipiwa na bajeti ya umma vilichukuliwa kwa matumizi binafsi.",
        ),
        Scenario(
            "A residents' committee says collected public-service revenue was not deposited into the designated account.",
            "Kamati ya wakazi inasema mapato ya huduma ya umma yaliyokusanywa hayakuwekwa kwenye akaunti iliyotengwa.",
        ),
        Scenario(
            "Funds recorded for a drainage project were allegedly withdrawn, while the site remained untouched.",
            "Pesa zilizoandikwa kwa mradi wa mifereji ya maji zinadaiwa kutolewa huku eneo la kazi likibaki bila shughuli.",
        ),
        Scenario(
            "A department report says equipment entrusted to a public office was sold without authorization.",
            "Ripoti ya idara inasema vifaa vilivyokabidhiwa kwa ofisi ya umma viliuzwa bila idhini.",
        ),
        Scenario(
            "A local committee alleges that relief supplies received for public distribution were diverted before reaching recipients.",
            "Kamati ya eneo inadai kuwa bidhaa za msaada zilizopokelewa kwa ugawaji wa umma zilielekezwa kwingine kabla ya kuwafikia walengwa.",
        ),
        Scenario(
            "An audit note says a public account was charged for maintenance work that was not carried out.",
            "Dokezo la ukaguzi linasema akaunti ya umma ilitozwa kwa kazi ya matengenezo ambayo haikufanywa.",
        ),
        Scenario(
            "A public office allegedly recorded salary payments for temporary workers who did not perform the listed work.",
            "Ofisi ya umma inadaiwa kurekodi malipo ya wafanyakazi wa muda ambao hawakufanya kazi iliyoandikwa.",
        ),
        Scenario(
            "A committee reports that construction supplies purchased for a public facility were taken to a private site.",
            "Kamati inaripoti kuwa vifaa vya ujenzi vilivyonunuliwa kwa kituo cha umma vilipelekwa kwenye eneo binafsi.",
        ),
        Scenario(
            "Money collected by a public unit allegedly disappeared before being entered into the official ledger.",
            "Pesa zilizokusanywa na kitengo cha umma zinadaiwa kutoweka kabla ya kuingizwa kwenye daftari rasmi.",
        ),
        Scenario(
            "A review found that budgeted funds for a public water repair were used for an undocumented purpose.",
            "Ukaguzi ulibaini kuwa pesa zilizotengwa kwa ukarabati wa maji ya umma zilitumika kwa kusudi lisiloandikwa.",
        ),
        Scenario(
            "A storekeeper allegedly removed public tools entrusted to the department and kept them for personal use.",
            "Mtunza ghala anadaiwa kutoa zana za umma zilizokabidhiwa idara na kuzitumia binafsi.",
        ),
    ),
    "Procurement Fraud": (
        Scenario(
            "Several suppliers allege that tender requirements were written to match one bidder's unique product.",
            "Wasambazaji kadhaa wanadai kuwa masharti ya zabuni yaliandikwa ili yafanane na bidhaa ya mzabuni mmoja.",
        ),
        Scenario(
            "A bid review allegedly found that competing offers used the same unusual wording and price pattern.",
            "Ukaguzi wa zabuni unadaiwa kubaini kuwa ofa pinzani zilitumia maneno yasiyo ya kawaida na mpangilio wa bei unaofanana.",
        ),
        Scenario(
            "A public tender was allegedly awarded before the advertised deadline for submitting applications.",
            "Zabuni ya umma inadaiwa kutolewa kabla ya tarehe ya mwisho iliyotangazwa ya kutuma maombi.",
        ),
        Scenario(
            "A supplier says an evaluation panel changed scoring criteria after seeing the submitted bids.",
            "Msambazaji anasema jopo la tathmini lilibadilisha vigezo vya alama baada ya kuona zabuni zilizowasilishwa.",
        ),
        Scenario(
            "A procurement notice allegedly omitted a required qualification in a way that excluded eligible local bidders.",
            "Tangazo la ununuzi linadaiwa kuacha sifa iliyohitajika kwa namna iliyowazuia wazabuni wa eneo waliostahili.",
        ),
        Scenario(
            "A review alleges that a contract was split into smaller purchases to avoid the required open tender process.",
            "Ukaguzi unadai kuwa mkataba uligawanywa kuwa manunuzi madogo ili kuepuka utaratibu wa zabuni ya wazi.",
        ),
        Scenario(
            "Two bidders allegedly coordinated their prices and took turns submitting the lowest offer.",
            "Wazabuni wawili wanadaiwa kuratibu bei zao na kubadilishana zamu ya kutoa ofa ya chini zaidi.",
        ),
        Scenario(
            "A tender committee allegedly accepted a bid after its submission deadline while rejecting earlier compliant bids.",
            "Kamati ya zabuni inadaiwa kukubali zabuni baada ya muda wa mwisho huku ikikataa zabuni zilizotii masharti mapema.",
        ),
        Scenario(
            "A public contract was allegedly awarded to a supplier that did not meet the published technical requirements.",
            "Mkataba wa umma unadaiwa kutolewa kwa msambazaji ambaye hakutimiza mahitaji ya kiufundi yaliyochapishwa.",
        ),
        Scenario(
            "A procurement file allegedly shows that the preferred bidder helped draft the specifications used to evaluate competitors.",
            "Faili ya ununuzi inadaiwa kuonyesha kuwa mzabuni aliyependekezwa alisaidia kuandika vipimo vilivyotumika kutathmini washindani.",
        ),
        Scenario(
            "A bid opening record allegedly lists prices that differ from the sealed offers delivered by suppliers.",
            "Rekodi ya kufungua zabuni inadaiwa kuonyesha bei zinazotofautiana na ofa zilizofungwa zilizowasilishwa na wasambazaji.",
        ),
        Scenario(
            "A committee reportedly changed the tender scoring after bids were submitted, without issuing a public amendment.",
            "Kamati inaripotiwa kubadilisha alama za zabuni baada ya kuwasilishwa bila kutoa marekebisho ya umma.",
        ),
        Scenario(
            "A contract review alleges that the winning supplier lacked a mandatory document required in the tender notice.",
            "Ukaguzi wa mkataba unadai kuwa msambazaji mshindi hakuwa na hati ya lazima iliyotajwa kwenye tangazo la zabuni.",
        ),
        Scenario(
            "A public entity allegedly gave one bidder advance access to tender information withheld from other participants.",
            "Taasisi ya umma inadaiwa kumpa mzabuni mmoja taarifa za zabuni mapema huku ikiwanyima washiriki wengine.",
        ),
        Scenario(
            "An evaluation panel allegedly discarded a compliant low bid using a reason not found in the published criteria.",
            "Jopo la tathmini linadaiwa kuondoa zabuni ya chini iliyotii masharti kwa sababu isiyokuwapo kwenye vigezo vilivyochapishwa.",
        ),
    ),
    "Abuse of Office": (
        Scenario(
            "An officer allegedly used official authority to stop a routine service for a resident after a personal dispute.",
            "Afisa anadaiwa kutumia mamlaka rasmi kusimamisha huduma ya kawaida kwa mkazi baada ya mzozo binafsi.",
        ),
        Scenario(
            "A public manager allegedly ordered staff to use government equipment for a private event.",
            "Msimamizi wa umma anadaiwa kuwaamuru wafanyakazi kutumia vifaa vya serikali kwa tukio binafsi.",
        ),
        Scenario(
            "A licensing supervisor allegedly bypassed the normal process to close a competitor's lawful business.",
            "Msimamizi wa leseni anadaiwa kupuuza utaratibu wa kawaida ili kufunga biashara halali ya mshindani.",
        ),
        Scenario(
            "A local official allegedly directed public workers to campaign during their paid government hours.",
            "Afisa wa eneo anadaiwa kuwaelekeza wafanyakazi wa umma kufanya kampeni wakati wa saa za kazi za serikali.",
        ),
        Scenario(
            "A department head allegedly used an official vehicle and staff for a personal household task.",
            "Mkuu wa idara anadaiwa kutumia gari rasmi na wafanyakazi kwa kazi ya nyumbani binafsi.",
        ),
        Scenario(
            "A public officer allegedly blocked access to a record without applying the ordinary access rules.",
            "Afisa wa umma anadaiwa kuzuia upatikanaji wa rekodi bila kutumia kanuni za kawaida za kutoa taarifa.",
        ),
        Scenario(
            "A supervisor allegedly ordered a team to alter a routine inspection schedule to inconvenience one resident.",
            "Msimamizi anadaiwa kuagiza timu kubadilisha ratiba ya ukaguzi ili kumsumbua mkazi mmoja.",
        ),
        Scenario(
            "A public employee allegedly used an official stamp to approve a personal transaction outside their duties.",
            "Mfanyakazi wa umma anadaiwa kutumia muhuri rasmi kuidhinisha shughuli binafsi nje ya majukumu yake.",
        ),
        Scenario(
            "A manager reportedly directed public staff to perform work at a private property during office hours.",
            "Msimamizi anaripotiwa kuwaelekeza wafanyakazi wa umma kufanya kazi kwenye mali binafsi wakati wa saa za ofisi.",
        ),
        Scenario(
            "An official allegedly used their position to cancel a citizen's valid application without a recorded reason.",
            "Afisa anadaiwa kutumia nafasi yake kufuta ombi halali la mwananchi bila sababu iliyoandikwa.",
        ),
        Scenario(
            "A public supervisor allegedly instructed staff to ignore the normal queue for a personal acquaintance.",
            "Msimamizi wa umma anadaiwa kuwaagiza wafanyakazi kupuuza foleni ya kawaida kwa ajili ya mtu anayemfahamu.",
        ),
        Scenario(
            "A public officer reportedly used an office account to promote a personal business.",
            "Afisa wa umma anaripotiwa kutumia akaunti ya ofisi kutangaza biashara yake binafsi.",
        ),
        Scenario(
            "A manager allegedly ordered the removal of a public notice to conceal a lawful community meeting.",
            "Msimamizi anadaiwa kuagiza kuondolewa kwa tangazo la umma ili kuficha mkutano halali wa jamii.",
        ),
        Scenario(
            "An employee allegedly used official authority to deny a routine inspection to a business without cause.",
            "Mfanyakazi anadaiwa kutumia mamlaka rasmi kunyima biashara ukaguzi wa kawaida bila sababu.",
        ),
        Scenario(
            "A department officer reportedly used public staff and transport to carry personal household goods.",
            "Afisa wa idara anaripotiwa kutumia wafanyakazi na usafiri wa umma kubeba bidhaa za nyumbani binafsi.",
        ),
    ),
    "Nepotism/Favoritism": (
        Scenario(
            "A qualified applicant alleges that a public job was given to the appointing manager's relative without a fair competition.",
            "Mwombaji mwenye sifa anadai kuwa kazi ya umma alipewa ndugu wa msimamizi aliyeteua bila ushindani wa haki.",
        ),
        Scenario(
            "A school committee says a supply contract was awarded to a company owned by an official's close family member.",
            "Kamati ya shule inasema mkataba wa vifaa ulitolewa kwa kampuni inayomilikiwa na mwanafamilia wa karibu wa afisa.",
        ),
        Scenario(
            "Residents allege that a public scholarship was reserved for relatives of committee members despite published criteria.",
            "Wakazi wanadai kuwa ufadhili wa masomo wa umma ulihifadhiwa kwa ndugu wa wajumbe licha ya vigezo vilivyochapishwa.",
        ),
        Scenario(
            "A recruitment shortlist allegedly included an officer's cousin who did not meet the stated minimum qualifications.",
            "Orodha fupi ya ajira inadaiwa kujumuisha binamu wa afisa ambaye hakutimiza sifa za chini zilizotajwa.",
        ),
        Scenario(
            "Several traders say market spaces were allocated to friends of the allocation panel ahead of eligible applicants.",
            "Wafanyabiashara kadhaa wanasema nafasi za soko zilitolewa kwa marafiki wa jopo kabla ya waombaji waliostahili.",
        ),
        Scenario(
            "A public committee allegedly selected a relative of one member for a grant while excluding equally eligible groups.",
            "Kamati ya umma inadaiwa kuchagua ndugu wa mjumbe mmoja kwa ruzuku huku ikiondoa vikundi vingine vilivyostahili.",
        ),
        Scenario(
            "An applicant alleges that a vacant public post was filled by an official's family member without advertising the role.",
            "Mwombaji anadai kuwa nafasi ya umma ilijazwa na mwanafamilia wa afisa bila kutangaza nafasi hiyo.",
        ),
        Scenario(
            "A community group says food distribution lists favored the relatives of local selection officials.",
            "Kikundi cha jamii kinasema orodha za ugawaji wa chakula ziliwapendelea ndugu wa maafisa wa uteuzi wa eneo.",
        ),
        Scenario(
            "A public board allegedly gave repeated small contracts to a close associate while qualified applicants were overlooked.",
            "Bodi ya umma inadaiwa kumpa mikataba midogo mara kwa mara mshirika wa karibu huku waombaji wenye sifa wakipuuzwa.",
        ),
        Scenario(
            "A resident reports that a training place was reserved for a committee member's relative outside the open selection.",
            "Mkazi anaripoti kuwa nafasi ya mafunzo ilihifadhiwa kwa ndugu wa mjumbe wa kamati nje ya uteuzi wa wazi.",
        ),
        Scenario(
            "An employment panel allegedly advanced a family member of the chairperson despite a lower assessment score.",
            "Jopo la ajira linadaiwa kumpandisha mwanafamilia wa mwenyekiti licha ya alama ya tathmini kuwa chini.",
        ),
        Scenario(
            "A public project allegedly hired a supplier owned by an official's spouse without an open comparison of offers.",
            "Mradi wa umma unadaiwa kuajiri msambazaji anayemilikiwa na mwenzi wa afisa bila kulinganisha ofa kwa uwazi.",
        ),
        Scenario(
            "Residents allege that temporary public jobs were distributed mainly among relatives of the local committee.",
            "Wakazi wanadai kuwa kazi za muda za umma ziligawiwa hasa kwa ndugu wa kamati ya eneo.",
        ),
        Scenario(
            "A grant panel reportedly favored an official's sibling over applicants who met the same published requirements.",
            "Jopo la ruzuku linaripotiwa kumpendelea ndugu wa afisa kuliko waombaji waliotimiza masharti yale yale.",
        ),
        Scenario(
            "A qualified candidate says a public appointment went to a close friend of the selection officer without a fair process.",
            "Mgombea mwenye sifa anasema uteuzi wa umma ulienda kwa rafiki wa karibu wa afisa wa uteuzi bila utaratibu wa haki.",
        ),
    ),
    "Extortion": (
        Scenario(
            "A trader says an official threatened to close a lawful stall unless the trader paid an unofficial amount.",
            "Mfanyabiashara anasema afisa alitishia kufunga kibanda halali isipokuwa alipe kiasi kisicho rasmi.",
        ),
        Scenario(
            "A resident alleges that a clerk threatened to destroy an application unless a personal payment was made.",
            "Mkazi anadai kuwa karani alitishia kuharibu ombi isipokuwa malipo binafsi yafanywe.",
        ),
        Scenario(
            "A public inspector allegedly demanded money and threatened to seize equipment if the owner refused.",
            "Mkaguzi wa umma anadaiwa kudai pesa na kutishia kukamata vifaa ikiwa mmiliki atakataa.",
        ),
        Scenario(
            "A contractor says a supervisor threatened to withhold an approved certificate unless an unofficial fee was paid.",
            "Mkandarasi anasema msimamizi alitishia kuzuia cheti kilichoidhinishwa isipokuwa ada isiyo rasmi ilipwe.",
        ),
        Scenario(
            "A service user reports being threatened with removal from a public queue for refusing a demanded payment.",
            "Mtumiaji wa huduma anaripoti kutishiwa kuondolewa kwenye foleni ya umma kwa kukataa malipo yaliyodaiwa.",
        ),
        Scenario(
            "An officer allegedly said a resident would face a false penalty unless money was handed over privately.",
            "Afisa anadaiwa kusema mkazi atatozwa adhabu ya uongo isipokuwa pesa zikabidhiwe kwa siri.",
        ),
        Scenario(
            "A business owner says a public employee threatened to delay renewal unless a demanded personal fee was paid.",
            "Mmiliki wa biashara anasema mfanyakazi wa umma alitishia kuchelewesha upya wa leseni isipokuwa ada binafsi ilipwe.",
        ),
        Scenario(
            "A resident alleges that an official threatened to report them unlawfully unless they paid for a routine service.",
            "Mkazi anadai kuwa afisa alitishia kumripoti kinyume cha sheria isipokuwa alipe kwa huduma ya kawaida.",
        ),
        Scenario(
            "A vendor says a public officer threatened to confiscate goods unless the vendor paid money outside the official process.",
            "Muuzaji anasema afisa wa umma alitishia kuchukua bidhaa isipokuwa alipe pesa nje ya utaratibu rasmi.",
        ),
        Scenario(
            "A worker alleges that a supervisor threatened to block a lawful payment unless part of it was returned privately.",
            "Mfanyakazi anadai kuwa msimamizi alitishia kuzuia malipo halali isipokuwa sehemu irudishwe kwa siri.",
        ),
        Scenario(
            "A resident says an officer threatened arrest unless an unofficial payment was made.",
            "Mkazi anasema afisa alitishia kumkamata isipokuwa malipo yasiyo rasmi yafanywe.",
        ),
        Scenario(
            "A supplier alleges that a public employee threatened to blacklist the business unless a personal demand was met.",
            "Msambazaji anadai kuwa mfanyakazi wa umma alitishia kuorodhesha biashara kama hairuhusiwi isipokuwa dai binafsi litimizwe.",
        ),
        Scenario(
            "A market trader says an inspector threatened to remove their stall unless a private payment was handed over.",
            "Mfanyabiashara wa soko anasema mkaguzi alitishia kuondoa kibanda isipokuwa malipo ya faragha yatolewe.",
        ),
        Scenario(
            "An applicant reports that an official threatened to discard valid papers unless the applicant paid cash.",
            "Mwombaji anaripoti kuwa afisa alitishia kutupa nyaraka halali isipokuwa mwombaji alipe pesa taslimu.",
        ),
        Scenario(
            "A public worker allegedly threatened to cancel a service request unless the user provided a personal benefit.",
            "Mfanyakazi wa umma anadaiwa kutishia kufuta ombi la huduma isipokuwa mtumiaji atoe manufaa binafsi.",
        ),
    ),
    "Fraud/Forgery of Documents": (
        Scenario(
            "A resident alleges that an official receipt was altered to show a different payment amount.",
            "Mkazi anadai kuwa risiti rasmi ilibadilishwa ili kuonyesha kiasi tofauti cha malipo.",
        ),
        Scenario(
            "A public project file allegedly contains a completion certificate for work that was not performed.",
            "Faili ya mradi wa umma inadaiwa kuwa na cheti cha kukamilika kwa kazi ambayo haikufanywa.",
        ),
        Scenario(
            "An applicant says a signature on a public approval letter was copied without the signatory's permission.",
            "Mwombaji anasema sahihi kwenye barua ya idhini ya umma ilinakiliwa bila ruhusa ya aliyeweka sahihi.",
        ),
        Scenario(
            "A supplier alleges that a delivery record was changed to claim goods were received when they were not.",
            "Msambazaji anadai kuwa rekodi ya uwasilishaji ilibadilishwa kuonyesha bidhaa zilipokelewa ilhali hazikupokelewa.",
        ),
        Scenario(
            "A public register reportedly lists a permit number that the issuing office says it never created.",
            "Daftari la umma linaripotiwa kuonyesha nambari ya kibali ambayo ofisi inayotoa vibali inasema haikuunda.",
        ),
        Scenario(
            "A committee says a meeting minute was edited to record an approval that members did not give.",
            "Kamati inasema kumbukumbu za mkutano zilihaririwa kurekodi idhini ambayo wajumbe hawakutoa.",
        ),
        Scenario(
            "A claimant alleges that a forged letter was used to obtain a public benefit under a false identity.",
            "Mlipaji anadai kuwa barua ya kughushi ilitumika kupata manufaa ya umma kwa utambulisho wa uongo.",
        ),
        Scenario(
            "An audit review allegedly found duplicate signatures on separate public payment vouchers.",
            "Ukaguzi unadaiwa kupata sahihi zilizorudiwa kwenye hati tofauti za malipo ya umma.",
        ),
        Scenario(
            "A resident says a land-record entry was falsified to make an unapproved transfer appear official.",
            "Mkazi anasema rekodi ya ardhi ilighushiwa ili uhamisho usioidhinishwa uonekane rasmi.",
        ),
        Scenario(
            "A public office allegedly issued a certificate bearing a fabricated inspection result.",
            "Ofisi ya umma inadaiwa kutoa cheti chenye matokeo ya ukaguzi yaliyobuniwa.",
        ),
        Scenario(
            "A payment file reportedly includes a fake invoice submitted as evidence of a public purchase.",
            "Faili ya malipo inaripotiwa kuwa na ankara bandia iliyowasilishwa kama ushahidi wa ununuzi wa umma.",
        ),
        Scenario(
            "A resident alleges that an official altered a date on a public notice after the response deadline had passed.",
            "Mkazi anadai kuwa afisa alibadilisha tarehe kwenye tangazo la umma baada ya muda wa kujibu kupita.",
        ),
        Scenario(
            "A public application reportedly carries an approval stamp that the issuing department says is not genuine.",
            "Ombi la umma linaripotiwa kuwa na muhuri wa idhini ambao idara inayotoa inasema si halisi.",
        ),
        Scenario(
            "A committee alleges that a record was fabricated to show a public meeting had taken place.",
            "Kamati inadai kuwa rekodi ilibuniwa kuonyesha kuwa mkutano wa umma ulifanyika.",
        ),
        Scenario(
            "An applicant says an official document was changed to remove a required condition from the approved version.",
            "Mwombaji anasema hati rasmi ilibadilishwa kuondoa sharti lililohitajika kutoka toleo lililoidhinishwa.",
        ),
    ),
    "Conflict of Interest": (
        Scenario(
            "A committee member allegedly voted on a contract that would pay a company in which the member owns shares.",
            "Mjumbe wa kamati anadaiwa kupiga kura kuhusu mkataba ambao ungelipa kampuni ambayo ana hisa.",
        ),
        Scenario(
            "A public officer reportedly helped select a supplier while privately holding a financial interest in that business.",
            "Afisa wa umma anaripotiwa kusaidia kuchagua msambazaji huku akiwa na maslahi ya kifedha ya siri katika biashara hiyo.",
        ),
        Scenario(
            "A manager allegedly approved a public lease for land they personally own without disclosing the ownership.",
            "Msimamizi anadaiwa kuidhinisha upangishaji wa umma wa ardhi anayomiliki bila kufichua umiliki huo.",
        ),
        Scenario(
            "A board member allegedly took part in evaluating an application from a business where they serve as a director.",
            "Mjumbe wa bodi anadaiwa kushiriki kutathmini ombi la biashara ambako yeye ni mkurugenzi.",
        ),
        Scenario(
            "An officer allegedly shaped a public decision that would financially benefit their undisclosed private partnership.",
            "Afisa anadaiwa kuelekeza uamuzi wa umma ambao ungeleta faida ya kifedha kwa ubia wake binafsi ambao hakufichua.",
        ),
        Scenario(
            "A public employee reportedly evaluated a grant for an organization in which the employee holds a paid position.",
            "Mfanyakazi wa umma anaripotiwa kutathmini ruzuku ya shirika ambako ana nafasi ya kulipwa.",
        ),
        Scenario(
            "A procurement panel member allegedly reviewed bids from a company in which their spouse has a financial stake.",
            "Mjumbe wa jopo la ununuzi anadaiwa kutathmini zabuni za kampuni ambako mwenzi wake ana maslahi ya kifedha.",
        ),
        Scenario(
            "A manager allegedly approved use of public property by a business they privately co-own.",
            "Msimamizi anadaiwa kuidhinisha matumizi ya mali ya umma na biashara anayomiliki kwa pamoja kwa siri.",
        ),
        Scenario(
            "A public board member reportedly influenced a permit decision involving their own private investment.",
            "Mjumbe wa bodi ya umma anaripotiwa kushawishi uamuzi wa kibali unaohusu uwekezaji wake binafsi.",
        ),
        Scenario(
            "An officer allegedly participated in setting a public contract price while owning part of the bidding company.",
            "Afisa anadaiwa kushiriki kupanga bei ya mkataba wa umma huku akimiliki sehemu ya kampuni iliyotoa zabuni.",
        ),
        Scenario(
            "A public employee reportedly approved a business application that would increase the value of their private property.",
            "Mfanyakazi wa umma anaripotiwa kuidhinisha ombi la biashara ambalo lingeongeza thamani ya mali yake binafsi.",
        ),
        Scenario(
            "A committee member allegedly selected a consultant whose firm pays the member for separate private work.",
            "Mjumbe wa kamati anadaiwa kuchagua mshauri ambaye kampuni yake humlipa kwa kazi tofauti ya binafsi.",
        ),
        Scenario(
            "An officer reportedly took part in a public allocation decision affecting a company they privately advise for a fee.",
            "Afisa anaripotiwa kushiriki uamuzi wa mgao wa umma unaoathiri kampuni anayoshauri kwa ada binafsi.",
        ),
        Scenario(
            "A board member allegedly voted on selling public equipment to a business in which they have a financial interest.",
            "Mjumbe wa bodi anadaiwa kupiga kura kuhusu kuuza vifaa vya umma kwa biashara ambako ana maslahi ya kifedha.",
        ),
        Scenario(
            "A public manager allegedly influenced a land-use decision that would benefit an undisclosed personal investment.",
            "Msimamizi wa umma anadaiwa kushawishi uamuzi wa matumizi ya ardhi ambao ungenufaisha uwekezaji binafsi ambao hakufichua.",
        ),
    ),
    "Other": (
        Scenario(
            "A residents' group says a public office repeatedly failed to publish meeting records required for community oversight, without alleging a payment or personal benefit.",
            "Kikundi cha wakazi kinasema ofisi ya umma ilishindwa mara kwa mara kuchapisha kumbukumbu za mikutano zinazohitajika kwa ufuatiliaji wa jamii, bila kudai malipo au manufaa binafsi.",
        ),
        Scenario(
            "A community committee alleges that a public department ignored required notice and consultation steps for a local plan, with no specific payment, threat, or favored person described.",
            "Kamati ya jamii inadai kuwa idara ya umma ilipuuza hatua zinazohitajika za notisi na mashauriano kwa mpango wa eneo, bila kueleza malipo, tishio au mtu aliyependelewa.",
        ),
        Scenario(
            "A resident says an office did not provide a public spending explanation after repeated formal requests; the report describes no diversion, false record, or private gain.",
            "Mkazi anasema ofisi haikutoa maelezo ya matumizi ya umma baada ya maombi rasmi kurudiwa; ripoti haielezi ubadhirifu, rekodi ya uongo au faida binafsi.",
        ),
        Scenario(
            "A community group alleges that an oversight meeting was cancelled without explanation and minutes were not made available, without identifying a bribe or altered document.",
            "Kikundi cha jamii kinadai kuwa mkutano wa uangalizi ulifutwa bila maelezo na kumbukumbu hazikupatikana, bila kutaja hongo au hati iliyobadilishwa.",
        ),
        Scenario(
            "A public notice about a local works plan was not displayed as required, according to residents; no contract manipulation or payment demand is alleged.",
            "Tangazo la umma kuhusu mpango wa kazi za eneo halikuwekwa kama ilivyohitajika, kulingana na wakazi; hakuna udanganyifu wa mkataba au ombi la malipo linalodaiwa.",
        ),
        Scenario(
            "A committee reports that required attendance and decision records were not maintained for routine public meetings, without alleging forged entries.",
            "Kamati inaripoti kuwa rekodi zinazohitajika za mahudhurio na maamuzi hazikutunzwa kwa mikutano ya kawaida ya umma, bila kudai maingizo ya kughushi.",
        ),
        Scenario(
            "Residents allege that a public feedback process was not held before a service plan was adopted; no personal beneficiary is identified.",
            "Wakazi wanadai kuwa mchakato wa maoni ya umma haukufanyika kabla ya mpango wa huduma kupitishwa; hakuna mnufaika binafsi aliyetajwa.",
        ),
        Scenario(
            "A civic group says a public office did not respond to a required audit follow-up, without describing missing funds or a personal payment.",
            "Kikundi cha kiraia kinasema ofisi ya umma haikujibu ufuatiliaji wa ukaguzi uliotakiwa, bila kueleza pesa zilizopotea au malipo binafsi.",
        ),
        Scenario(
            "A community alleges that a public service schedule was not posted in the required place and residents could not verify the announced timetable.",
            "Jamii inadai kuwa ratiba ya huduma ya umma haikuwekwa mahali palipotakiwa na wakazi hawakuweza kuthibitisha muda uliotangazwa.",
        ),
        Scenario(
            "A residents' association says a public department did not provide a required explanation of how it selected service priorities, with no allegation of a private interest.",
            "Chama cha wakazi kinasema idara ya umma haikutoa maelezo yaliyotakiwa kuhusu jinsi ilivyochagua vipaumbele vya huduma, bila madai ya maslahi binafsi.",
        ),
        Scenario(
            "A community group alleges that a public consultation notice omitted the date and location, preventing residents from taking part; no bribe or threat is described.",
            "Kikundi cha jamii kinadai kuwa notisi ya mashauriano ya umma iliacha tarehe na mahali, na kuwazuia wakazi kushiriki; hakuna hongo au tishio lililoelezwa.",
        ),
        Scenario(
            "A local committee says quarterly public-service statistics were not released as required, without alleging that figures were falsified.",
            "Kamati ya eneo inasema takwimu za huduma za umma za robo mwaka hazikutolewa kama ilivyotakiwa, bila kudai kuwa takwimu zilighushiwa.",
        ),
        Scenario(
            "Residents report that a public office did not keep a required register of service requests, with no specific official benefit alleged.",
            "Wakazi wanaripoti kuwa ofisi ya umma haikutunza daftari lililohitajika la maombi ya huduma, bila kudai manufaa maalum ya afisa.",
        ),
        Scenario(
            "A civic group says the public office failed to disclose the criteria used to set service priorities; the report alleges no tender or payment scheme.",
            "Kikundi cha kiraia kinasema ofisi ya umma haikufichua vigezo vya kupanga vipaumbele vya huduma; ripoti haina madai ya zabuni au mpango wa malipo.",
        ),
        Scenario(
            "A community alleges that a required public notice about a service change was not issued, without describing a threat, altered record, or personal gain.",
            "Jamii inadai kuwa notisi ya umma iliyohitajika kuhusu mabadiliko ya huduma haikutolewa, bila kueleza tishio, rekodi iliyobadilishwa au faida binafsi.",
        ),
    ),
}


def rows_for_dataset() -> list[dict[str, str]]:
    if set(SCENARIOS) != set(CATEGORIES):
        raise ValueError("Synthetic scenarios must match the canonical category taxonomy exactly.")
    if any(len(scenarios) != 15 for scenarios in SCENARIOS.values()):
        raise ValueError("Every category must contain exactly 15 distinct fictional scenarios.")

    rows: list[dict[str, str]] = []
    for category in CATEGORIES:
        scenarios = SCENARIOS[category]
        for scenario_index, scenario in enumerate(scenarios, start=1):
            group_id = f"synthetic-{category.lower().replace('/', '-').replace(' ', '-')}-{scenario_index:02d}"
            variants = (
                ("English", scenario.english),
                ("English", f"The report states that {scenario.english[0].lower()}{scenario.english[1:]}"),
                ("Kiswahili", scenario.kiswahili),
                ("Kiswahili", f"Kwa mujibu wa taarifa, {scenario.kiswahili[0].lower()}{scenario.kiswahili[1:]}"),
            )
            for language, text in variants:
                rows.append({
                    "text": text,
                    "label": category,
                    "group_id": group_id,
                    "language": language,
                    "county": FICTIONAL_COUNTIES[(scenario_index - 1) % len(FICTIONAL_COUNTIES)],
                })
    return rows


def main() -> None:
    rows = rows_for_dataset()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=("text", "label", "group_id", "language", "county"))
        writer.writeheader()
        writer.writerows(rows)

    category_counts: dict[str, int] = {}
    for row in rows:
        category_counts[row["label"]] = category_counts.get(row["label"], 0) + 1
    OUTPUT_METADATA.write_text(
        json.dumps({
            "dataset_name": "Kenya Watch synthetic seed corpus",
            "status": "synthetic_only_not_for_real_world_validation_or_production_training",
            "generation_method": "Hand-authored fictional scenarios and simple paraphrase prefixes",
            "rows": len(rows),
            "scenario_groups": len({row["group_id"] for row in rows}),
            "scenarios_per_category": {category: len(SCENARIOS[category]) for category in CATEGORIES},
            "language_rows": {
                language: sum(row["language"] == language for row in rows)
                for language in ("English", "Kiswahili")
            },
            "fictional_county_values_for_audit_only": list(FICTIONAL_COUNTIES),
            "category_counts": category_counts,
            "limitations": [
                "Synthetic scenarios and labels are not observations of real Kenyan reports.",
                "Kiswahili text is a draft and has not been reviewed by a native speaker.",
                "The simple paraphrase variants are related within incident groups and must remain in the same validation fold.",
                "Balanced labels, short scenarios, and templatic phrasing do not represent real deployment prevalence or report-writing variation.",
                "Scores from this data test code and expose synthetic task behavior only; they are not a real-world accuracy estimate.",
            ],
        }, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "rows": len(rows),
        "scenario_groups": len({row["group_id"] for row in rows}),
        "examples_per_category": len(rows) // len(CATEGORIES),
        "csv": str(OUTPUT_CSV),
        "metadata": str(OUTPUT_METADATA),
        "warning": "Synthetic-only. Not valid evidence of real-world accuracy or deployment readiness.",
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

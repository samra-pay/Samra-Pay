import { localized, type LocalizedText } from "@/lib/public-i18n";

export type FaqCategory = "about" | "sending" | "cards" | "technology" | "company";

export type PublicFaqItem = {
  id: string;
  category: FaqCategory;
  question: LocalizedText;
  answer: LocalizedText;
};

export const faqCategories: Array<{ id: "all" | FaqCategory; label: LocalizedText }> = [
  { id: "all", label: localized("All questions", "ሁሉም ጥያቄዎች") },
  { id: "about", label: localized("About Samra", "ስለ Samra") },
  { id: "sending", label: localized("Sending money", "ገንዘብ መላክ") },
  { id: "cards", label: localized("Cards and credit", "ካርዶች እና ክሬዲት") },
  { id: "technology", label: localized("Technology and trust", "ቴክኖሎጂ እና እምነት") },
  { id: "company", label: localized("Company and updates", "ኩባንያ እና ዜና") },
];

export const homeFaqItems: PublicFaqItem[] = [
  {
    id: "home-what-is-samra",
    category: "about",
    question: localized("What is Samra Pay, and is it available now?", "Samra Pay ምንድን ነው? አሁንስ ለአገልግሎት ዝግጁ ነው?"),
    answer: localized(
      "Samra Pay is building a financial platform for Ethiopians in the United States and Canada who manage money here and support loved ones in Ethiopia. It is still in development; the current website does not open accounts, issue cards, or send money.",
      "Samra Pay በአሜሪካና ካናዳ የሚኖሩ፣ እዚህ ገንዘባቸውን የሚያስተዳድሩ እና በኢትዮጵያ ያሉ የቅርብ ሰዎቻቸውን የሚደግፉ ኢትዮጵያውያን የፋይናንስ መድረክ እየገነባ ነው። አሁንም በልማት ላይ ነው፤ የአሁኑ ድረ ገጽ ሂሳብ አይከፍትም፣ ካርድ አያወጣም፣ ገንዘብም አይልክም።",
    ),
  },
  {
    id: "home-coverage",
    category: "sending",
    question: localized("Which Ethiopian banks and mobile wallets will be supported?", "የትኞቹ የኢትዮጵያ ባንኮችና የሞባይል ዋሌቶች ይደገፋሉ?"),
    answer: localized(
      "No bank or mobile-wallet list has been confirmed. Samra Pay plans to support eligible bank-account and mobile-wallet delivery in Ethiopia, and the available destination will be shown before a transfer is confirmed.",
      "የተረጋገጠ የባንክ ወይም የሞባይል ዋሌት ዝርዝር የለም። Samra Pay በኢትዮጵያ መስፈርቱን ወደሚያሟሉ የባንክ ሂሳቦችና የሞባይል ዋሌቶች ገንዘብ መላክን ለመደገፍ አቅዷል። የሚገኙ አማራጮች ዝውውሩ ከመረጋገጡ በፊት ይታያሉ።",
    ),
  },
  {
    id: "home-quote",
    category: "sending",
    question: localized("What rate, fees, and delivery time will I see before I send?", "ከመላኬ በፊት ምን የምንዛሬ ተመን፣ ክፍያና የመድረሻ ጊዜ አያለሁ?"),
    answer: localized(
      "Final pricing has not been announced. Each eligible quote is intended to show the rate, transfer fee, expected ETB received, delivery estimate, and quote expiration before you confirm.",
      "የመጨረሻው ዋጋ አልተገለጸም። መስፈርቱን የሚያሟላ እያንዳንዱ የዝውውር ዝርዝር ከማረጋገጥዎ በፊት የምንዛሬ ተመኑን፣ የዝውውር ክፍያውን፣ ተቀባዩ ይደርሰዋል ተብሎ የሚጠበቀውን ETB መጠን፣ ገንዘቡ የሚደርስበትን ግምታዊ ጊዜ እና የቀረበው ተመን የሚያበቃበትን ጊዜ እንዲያሳይ ታስቧል።",
    ),
  },
];

export const fullFaqItems: PublicFaqItem[] = [
  {
    id: "what-is-samra",
    category: "about",
    question: localized("What is Samra Pay?", "Samra Pay ምንድን ነው?"),
    answer: localized(
      "Samra Pay is building a financial platform for Ethiopians in the United States and Canada who manage money here and support loved ones in Ethiopia. Planned products include money transfers, credit-building tools, payment cards, and rewards.",
      "Samra Pay በዩናይትድ ስቴትስ እና ካናዳ የሚኖሩ ኢትዮጵያውያን እዚህ ገንዘባቸውን እንዲያስተዳድሩና በኢትዮጵያ ያሉ ወዳጆቻቸውን እንዲደግፉ የሚረዳ የፋይናንስ መድረክ እየገነባ ነው። የታቀዱ ምርቶች ገንዘብ መላክን፣ የክሬዲት ታሪክ ማጠናከሪያ መሳሪያዎችን፣ የክፍያ ካርዶችንና ሽልማቶችን ያካትታሉ።",
    ),
  },
  {
    id: "is-samra-a-bank",
    category: "about",
    question: localized("Is Samra Pay a bank?", "Samra Pay ባንክ ነው?"),
    answer: localized(
      "No. Samra Pay is being developed as a financial-technology platform. Any future account, card, or remittance service would be offered only through appropriately authorized institutions identified in the final disclosures.",
      "አይደለም። Samra Pay እንደ የፋይናንስ ቴክኖሎጂ መድረክ እየተገነባ ነው። ወደፊት የሚቀርብ ማንኛውም መለያ፣ ካርድ ወይም የገንዘብ ዝውውር አገልግሎት በመጨረሻው መግለጫ ውስጥ በሚጠቀሱ በተገቢው ፈቃድ ባላቸው ተቋማት ብቻ ይቀርባል።",
    ),
  },
  {
    id: "available-now",
    category: "about",
    question: localized("Is Samra Pay available now?", "Samra Pay አሁን ይገኛል?"),
    answer: localized(
      "No. Samra Pay is targeting a limited Alpha beginning in April 2027, but timing and scope may change. The current website is a product preview; it does not open accounts, issue cards, or send money.",
      "አይገኝም። Samra Pay የተወሰነ Alpha በApril 2027 ለመጀመር እያቀደ ነው፣ ነገር ግን ጊዜውና ወሰኑ ሊለወጡ ይችላሉ። ይህ ድረ ገጽ የምርት ቅድመ እይታ ነው፤ መለያ አይከፍትም፣ ካርድ አያወጣም ወይም ገንዘብ አይልክም።",
    ),
  },
  {
    id: "availability",
    category: "about",
    question: localized("Where will Samra Pay be available?", "Samra Pay የት ይገኛል?"),
    answer: localized(
      "Initial availability is planned for eligible users in the United States and Canada, with transfers to eligible recipients in Ethiopia. State, province, and destination coverage will depend on final approvals, partners, and product terms.",
      "የመጀመሪያ አገልግሎቱ በዩናይትድ ስቴትስ እና ካናዳ ለሚገኙ ብቁ ተጠቃሚዎች፣ በኢትዮጵያ ወደሚገኙ ብቁ ተቀባዮች ዝውውር ለማድረግ ታቅዷል። የግዛት፣ የክፍለ ሀገርና የመድረሻ ሽፋን በመጨረሻ ፈቃዶች፣ አጋሮችና የምርት ውሎች ላይ ይመሰረታል።",
    ),
  },
  {
    id: "sending-flow",
    category: "sending",
    question: localized("How will sending money work?", "ገንዘብ መላክ እንዴት ይሰራል?"),
    answer: localized(
      "The planned experience will let you choose a recipient and delivery method, review the rate, fee, expected delivery time, and ETB amount, and then confirm the transfer. Transfers are not live, and the final regulated flow has not been confirmed.",
      "የታቀደው አገልግሎት ተቀባይና የመድረሻ ዘዴ እንዲመርጡ፣ የምንዛሬ ተመኑን፣ ክፍያውን፣ የመድረሻ ግምቱንና የETB መጠኑን እንዲመለከቱ ከዚያም ዝውውሩን እንዲያረጋግጡ ያስችላል። ዝውውሮች ገና አልተጀመሩም፣ የመጨረሻው ቁጥጥር ያለበት ሂደትም ገና አልተረጋገጠም።",
    ),
  },
  {
    id: "ethiopian-banks",
    category: "sending",
    question: localized("Which Ethiopian banks can I send to?", "ወደ የትኞቹ የኢትዮጵያ ባንኮች መላክ እችላለሁ?"),
    answer: localized(
      "No receiving-bank list has been confirmed. Samra Pay plans to support eligible bank-account delivery in Ethiopia. Supported institutions will be listed in the product before a transfer is confirmed.",
      "የተረጋገጠ የተቀባይ ባንኮች ዝርዝር ገና የለም። Samra Pay በኢትዮጵያ ወደ ብቁ የባንክ ሂሳቦች መላክን ለመደገፍ አቅዷል። የሚደገፉ ተቋማት ዝውውር ከመረጋገጡ በፊት በምርቱ ውስጥ ይታያሉ።",
    ),
  },
  {
    id: "mobile-wallets",
    category: "sending",
    question: localized("What about mobile wallets?", "የሞባይል ዋሌቶችስ?"),
    answer: localized(
      "Mobile-wallet delivery is planned, but no wallet provider has been confirmed. Available wallets, recipient requirements, transaction limits, and delivery estimates will be shown only after those arrangements are finalized.",
      "ወደ ሞባይል ዋሌት መላክ ታቅዷል፣ ነገር ግን ምንም የዋሌት አቅራቢ ገና አልተረጋገጠም። ያሉት ዋሌቶች፣ የተቀባይ መስፈርቶች፣ የግብይት ገደቦችና የመድረሻ ግምቶች ዝግጅቶቹ ከተጠናቀቁ በኋላ ብቻ ይታያሉ።",
    ),
  },
  {
    id: "quote-details",
    category: "sending",
    question: localized("What rate, fees, and delivery time will I get?", "ምን የምንዛሬ ተመን፣ ክፍያና የመድረሻ ጊዜ አገኛለሁ?"),
    answer: localized(
      "No final rate, fee, or delivery speed has been announced. Each eligible quote is intended to show the exact rate, transfer fee, expected ETB received, delivery estimate, and quote expiration before you send. Samra Pay does not guarantee an instant transfer or a market-best rate.",
      "የመጨረሻ የምንዛሬ ተመን፣ ክፍያ ወይም የመድረሻ ፍጥነት ገና አልተገለጸም። እያንዳንዱ ብቁ የዝውውር ቅድመ ስሌት ከመላክዎ በፊት ትክክለኛውን ተመን፣ የዝውውር ክፍያ፣ የሚጠበቀውን ETB፣ የመድረሻ ግምትና የቅድመ ስሌቱን ማብቂያ እንዲያሳይ ታቅዷል። Samra Pay ፈጣን ዝውውር ወይም ከገበያ ሁሉ የተሻለ ተመን ዋስትና አይሰጥም።",
    ),
  },
  {
    id: "cash-card",
    category: "cards",
    question: localized("Is the Samra Pay card like a cash card?", "የSamra Pay ካርድ እንደ cash card ነው?"),
    answer: localized(
      "If by “cash card” you mean a debit or prepaid card, not exactly. The current concept is a pay-in-full card rather than a prepaid, stored-value card. Final issuing, funding, spending-limit, repayment, and eligibility terms have not been confirmed.",
      "cash card ሲሉ ዴቢት ወይም ቅድመ ክፍያ ካርድ ማለትዎ ከሆነ፣ በትክክል አይደለም። የአሁኑ ሀሳብ ቅድመ ክፍያ ከሚደረግበት የተቀማጭ ዋጋ ካርድ ይልቅ በሙሉ የሚከፈል charge card ነው። የመጨረሻ አወጣጥ፣ ገንዘብ መጫን፣ የወጪ ገደብ፣ መክፈያና የብቁነት ውሎች ገና አልተረጋገጡም።",
    ),
  },
  {
    id: "credit-building",
    category: "cards",
    question: localized("How could Samra Pay help me build credit?", "Samra Pay የክሬዲት ታሪኬን እንዳጠናክር እንዴት ሊረዳኝ ይችላል?"),
    answer: localized(
      "Samra Pay plans to report eligible recurring bills or payment activity to participating credit bureaus where available, subject to enrollment and final program terms. No bureau coverage or credit-score improvement is guaranteed.",
      "Samra Pay ብቁ የሆኑ ተደጋጋሚ ክፍያዎችን ወይም የክፍያ እንቅስቃሴን አገልግሎቱ በሚገኝበት ቦታ ለሚሳተፉ የክሬዲት ቢሮዎች ለማሳወቅ አቅዷል፤ ይህም በምዝገባና በመጨረሻው የፕሮግራም ውሎች ይገዛል። የቢሮ ሽፋን ወይም የክሬዲት ነጥብ መሻሻል ዋስትና የለውም።",
    ),
  },
  {
    id: "shebamiles",
    category: "cards",
    question: localized("How will ShebaMiles rewards work?", "የShebaMiles ሽልማቶች እንዴት ይሰራሉ?"),
    answer: localized(
      "ShebaMiles earning and any Ethiopian Airlines co-branding are proposed. They require executed commercial and technical agreements. Earn rates, eligibility, award timing, redemption, expiration, and other terms are not final.",
      "ShebaMiles ማግኘትና ከEthiopian Airlines ጋር የሚደረግ ማንኛውም የጋራ ብራንድ የቀረቡ ሀሳቦች ናቸው። ተፈርመው የተጠናቀቁ የንግድና የቴክኒክ ስምምነቶችን ይፈልጋሉ። የማግኛ መጠን፣ ብቁነት፣ የሽልማት ጊዜ፣ አጠቃቀም፣ ማብቂያና ሌሎች ውሎች ገና የመጨረሻ አይደሉም።",
    ),
  },
  {
    id: "planned-memberships",
    category: "cards",
    question: localized(
      "What are the planned annual memberships and rewards?",
      "የታቀዱት ዓመታዊ አባልነቶችና ሽልማቶች ምንድን ናቸው?",
    ),
    answer: localized(
      "The current Elite concept includes a proposed $195 annual membership and a proposed 15,000-ShebaMiles annual reward. The proposed Ethiopian Airlines co-branded tier includes a $495 annual membership and a 45,000-ShebaMiles annual reward. These are planning terms, not currently available offers, and may change.",
      "የአሁኑ Elite ምርት ሐሳብ የታቀደ $195 ዓመታዊ አባልነትና የታቀደ 15,000 ShebaMiles ዓመታዊ ሽልማት ያካትታል። ከEthiopian Airlines ጋር በጋራ ብራንድ ሊቀርብ የታቀደው ደረጃ $495 ዓመታዊ አባልነትና 45,000 ShebaMiles ዓመታዊ ሽልማት ያካትታል። እነዚህ የዕቅድ ውሎች እንጂ አሁን የሚገኙ አቅርቦቶች አይደሉም፤ ሊለወጡም ይችላሉ።",
    ),
  },
  {
    id: "stablecoin",
    category: "technology",
    question: localized("What is a stablecoin?", "stablecoin ምንድን ነው?"),
    answer: localized(
      "A stablecoin is a digital token designed to track a reference currency, usually the U.S. dollar. It is not cash, a bank deposit, or risk-free. Samra Pay may use regulated partners and stablecoin infrastructure behind the scenes for settlement, but that design is not final. Customers and recipients are not intended to buy or manage cryptocurrency.",
      "stablecoin ብዙውን ጊዜ የዩናይትድ ስቴትስ ዶላርን የመሰለ ዋቢ ምንዛሬ ዋጋ ለመከተል የተነደፈ ዲጂታል ቶከን ነው። ጥሬ ገንዘብ፣ የባንክ ተቀማጭ ወይም ከአደጋ ነፃ አይደለም። Samra Pay ከጀርባ ለመቋቋሚያ በቁጥጥር ስር ያሉ አጋሮችንና stablecoin መሠረተ ልማትን ሊጠቀም ይችላል፣ ነገር ግን ይህ ንድፍ ገና የመጨረሻ አይደለም። ደንበኞችና ተቀባዮች cryptocurrency እንዲገዙ ወይም እንዲያስተዳድሩ አልታቀደም።",
    ),
  },
  {
    id: "protection",
    category: "technology",
    question: localized("How will my money and information be protected?", "ገንዘቤና መረጃዬ እንዴት ይጠበቃሉ?"),
    answer: localized(
      "Samra Pay is being designed around identity verification, access controls, transaction monitoring, and reconciliation. Final custody, safeguarding, insurance, and privacy terms will be published before any financial service is offered. Do not send money or identity documents through the current preview.",
      "Samra Pay የማንነት ማረጋገጫ፣ የመዳረሻ ቁጥጥር፣ የግብይት ክትትልና ማስታረቅን መሠረት አድርጎ እየተነደፈ ነው። የመጨረሻ የጥበቃ፣ የደህንነት፣ የኢንሹራንስና የግላዊነት ውሎች ማንኛውም የገንዘብ አገልግሎት ከመቅረቡ በፊት ይታተማሉ። በዚህ ቅድመ እይታ ገንዘብ ወይም የማንነት ሰነዶች አይላኩ።",
    ),
  },
  {
    id: "invest",
    category: "company",
    question: localized("Can I invest in Samra Pay?", "በSamra Pay ላይ ኢንቨስት ማድረግ እችላለሁ?"),
    answer: localized(
      "This website is not a securities offering and does not accept investments. Joining an Alpha or updates list does not reserve shares or create investor status. Any future investment opportunity would use official offering materials, eligibility rules, risk disclosures, and an authorized subscription process.",
      "ይህ ድረ ገጽ የዋስትና ሰነድ አቅርቦት አይደለም እና ኢንቨስትመንት አይቀበልም። Alpha ወይም የዜና ዝርዝር ውስጥ መግባት አክሲዮን አያስይዝም ወይም የኢንቨስተር ሁኔታ አይፈጥርም። ወደፊት የሚኖር ማንኛውም የኢንቨስትመንት እድል ኦፊሴላዊ የአቅርቦት ሰነዶችን፣ የብቁነት ደንቦችን፣ የአደጋ መግለጫዎችንና ፈቃድ ያለው የምዝገባ ሂደትን ይጠቀማል።",
    ),
  },
  {
    id: "updates",
    category: "company",
    question: localized("How can I get updates?", "ዜናዎችን እንዴት ማግኘት እችላለሁ?"),
    answer: localized(
      "Join the waitlist with your email and explicit consent to receive launch updates. Samra Pay stores the address separately from acquisition telemetry, records the notice version and server time, and will include an unsubscribe option in every update.",
      "የመክፈቻ ዜናዎችን ለመቀበል ኢሜይልዎንና ግልጽ ፈቃድዎን በመስጠት የጥበቃ ዝርዝሩን ይቀላቀሉ። Samra Pay አድራሻውን ከግብይት መለኪያዎች ለይቶ ያከማቻል፣ የማስታወቂያውን ስሪትና የአገልጋዩን ጊዜ ይመዘግባል፣ እና በእያንዳንዱ ዜና የምዝገባ ማቋረጫ ያካትታል።",
    ),
  },
];

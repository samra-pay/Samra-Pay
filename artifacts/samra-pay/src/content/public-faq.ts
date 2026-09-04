import { localized, type LocalizedText } from "@/lib/public-i18n";

export type FaqCategory =
  "about" | "sending" | "cards" | "technology" | "company";

export type PublicFaqItem = {
  id: string;
  category: FaqCategory;
  question: LocalizedText;
  answer: LocalizedText;
};

export const faqCategories: Array<{
  id: "all" | FaqCategory;
  label: LocalizedText;
}> = [
  { id: "all", label: localized("All questions", "ሁሉም ጥያቄዎች") },
  { id: "about", label: localized("About Samra", "ስለ Samra") },
  { id: "sending", label: localized("Sending money", "ገንዘብ መላክ") },
  { id: "cards", label: localized("Cards and credit", "ካርዶች እና ክሬዲት") },
  {
    id: "technology",
    label: localized("Technology and trust", "ቴክኖሎጂ እና እምነት"),
  },
  { id: "company", label: localized("Company and updates", "ኩባንያ እና ዜና") },
];

export const homeFaqItems: PublicFaqItem[] = [
  {
    id: "home-what-is-samra",
    category: "about",
    question: localized("Who is Samra Pay for?", "Samra Pay ለማን ነው?"),
    answer: localized(
      "Samra Pay is preparing to bring everyday finances in the U.S. and Canada closer to life in Ethiopia—with cards, credit-building tools, rewards, and money transfers designed around our community.",
      "Samra Pay በአሜሪካና ካናዳ ያለውን ዕለታዊ የገንዘብ ሕይወት ከኢትዮጵያ ጋር ለማቀራረብ እየተዘጋጀ ነው። ካርዶች፣ የክሬዲት ታሪክ ማጠናከሪያዎች፣ ሽልማቶችና ዝውውሮች በማህበረሰባችን ዙሪያ ይዘጋጃሉ።",
    ),
  },
  {
    id: "home-coverage",
    category: "sending",
    question: localized(
      "Which Ethiopian banks and mobile wallets will be supported?",
      "የትኞቹ የኢትዮጵያ ባንኮችና የሞባይል ዋሌቶች ይደገፋሉ?",
    ),
    answer: localized(
      "Bank-account and mobile-wallet delivery in Ethiopia are part of our launch roadmap. We’ll share supported destinations as arrangements are finalized, with eligible options shown before you confirm a transfer.",
      "በኢትዮጵያ ወደ ባንክ ሂሳብና የሞባይል ዋሌት መላክ የምረቃ ዕቅዳችን አካል ነው። ዝግጅቶቹ ሲጠናቀቁ የሚደገፉ መዳረሻዎችን እናሳውቃለን፤ ዝውውር ከማረጋገጥዎ በፊትም ብቁ አማራጮች ይታያሉ።",
    ),
  },
  {
    id: "home-quote",
    category: "sending",
    question: localized(
      "What rate, fees, and delivery time will I see before I send?",
      "ከመላኬ በፊት ምን የምንዛሬ ተመን፣ ክፍያና የመድረሻ ጊዜ አያለሁ?",
    ),
    answer: localized(
      "The transfer experience is designed to put the details first: your exchange rate, fee, expected ETB received, delivery estimate, and quote expiry—all before you confirm. Final pricing will accompany the service launch.",
      "የዝውውር ሂደቱ ዝርዝሮችን በቅድሚያ ለማሳየት ተነድፏል፤ ተመን፣ ክፍያ፣ የሚጠበቀው ETB፣ የመድረሻ ግምትና የተመኑ ማብቂያ ሁሉ ከማረጋገጥዎ በፊት ይታያሉ። የመጨረሻ ዋጋ ከአገልግሎቱ ምረቃ ጋር ይገለጻል።",
    ),
  },
];

export const fullFaqItems: PublicFaqItem[] = [
  {
    id: "what-is-samra",
    category: "about",
    question: localized("What is Samra Pay?", "Samra Pay ምንድን ነው?"),
    answer: localized(
      "Samra Pay is preparing a financial home for Ethiopians in the United States and Canada, connecting everyday spending, credit building, rewards, and support for loved ones in Ethiopia. Explore our launch portfolio to find the path that fits your life.",
      "Samra Pay በአሜሪካና ካናዳ ለሚኖሩ ኢትዮጵያውያን ዕለታዊ ወጪን፣ የክሬዲት ታሪክ ማጠናከርን፣ ሽልማቶችንና በኢትዮጵያ ያሉ ወዳጆችን መደገፍ የሚያገናኝ የፋይናንስ መድረክ እያዘጋጀ ነው። ከሕይወትዎ ጋር የሚስማማውን መንገድ ለማግኘት የምርት ስብስባችንን ያስሱ።",
    ),
  },
  {
    id: "is-samra-a-bank",
    category: "about",
    question: localized("Is Samra Pay a bank?", "Samra Pay ባንክ ነው?"),
    answer: localized(
      "Samra Pay is a financial-technology platform, not a bank. Financial services will be offered through appropriately authorized institutions, with providers and applicable protections identified in each product’s final terms.",
      "Samra Pay የፋይናንስ ቴክኖሎጂ መድረክ እንጂ ባንክ አይደለም። የፋይናንስ አገልግሎቶች በተገቢው ፈቃድ ባላቸው ተቋማት በኩል ይቀርባሉ፤ አቅራቢዎችና የሚመለከቱ ጥበቃዎች በእያንዳንዱ ምርት የመጨረሻ ውሎች ይገለጻሉ።",
    ),
  },
  {
    id: "available-now",
    category: "about",
    question: localized("What can I expect at launch?", "በምረቃው ምን መጠበቅ እችላለሁ?"),
    answer: localized(
      "Our launch is focused on eligible customers in the U.S. and Canada and their connections to Ethiopia. Products will roll out in stages, with application dates, coverage, and final terms shared through our launch updates.",
      "የመጀመሪያ ትኩረታችን በአሜሪካና ካናዳ ባሉ ብቁ ደንበኞችና ከኢትዮጵያ ጋር ባላቸው ግንኙነት ላይ ነው። ምርቶች በደረጃ ይቀርባሉ፤ የማመልከቻ ቀናት፣ ሽፋንና የመጨረሻ ውሎች በምረቃ መረጃዎቻችን ይጋራሉ።",
    ),
  },
  {
    id: "availability",
    category: "about",
    question: localized(
      "Where will Samra Pay be available?",
      "Samra Pay የት ይገኛል?",
    ),
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
      "Choose a recipient and an eligible delivery method, review the exchange rate, fee, ETB amount, and delivery estimate, then confirm. That is the transfer experience we are preparing, with final funding methods and requirements shared at launch.",
      "ተቀባይና ብቁ የመድረሻ ዘዴ ይምረጡ፣ ተመኑን፣ ክፍያውን፣ የETB መጠኑንና የመድረሻ ግምቱን ይመልከቱ፣ ከዚያም ያረጋግጡ። ይህ የምናዘጋጀው የዝውውር ሂደት ነው፤ የመጨረሻ የክፍያ ዘዴዎችና መስፈርቶች በምረቃው ይገለጻሉ።",
    ),
  },
  {
    id: "ethiopian-banks",
    category: "sending",
    question: localized(
      "Which Ethiopian banks can I send to?",
      "ወደ የትኞቹ የኢትዮጵያ ባንኮች መላክ እችላለሁ?",
    ),
    answer: localized(
      "Our roadmap includes delivery to eligible bank accounts in Ethiopia. Supported banks and recipient requirements will be announced as arrangements are finalized and shown when you choose a destination.",
      "ዕቅዳችን በኢትዮጵያ ወደ ብቁ የባንክ ሂሳቦች መላክን ያካትታል። ዝግጅቶቹ ሲጠናቀቁ የሚደገፉ ባንኮችና የተቀባይ መስፈርቶች ይገለጻሉ፤ መዳረሻ ሲመርጡም ይታያሉ።",
    ),
  },
  {
    id: "mobile-wallets",
    category: "sending",
    question: localized("What about mobile wallets?", "የሞባይል ዋሌቶችስ?"),
    answer: localized(
      "Mobile-wallet delivery is part of the launch roadmap. We’ll publish supported wallets, recipient requirements, limits, and delivery estimates as provider arrangements are finalized.",
      "ወደ ሞባይል ዋሌት መላክ የምረቃ ዕቅዳችን አካል ነው። ከአቅራቢዎች ጋር ያሉ ዝግጅቶች ሲጠናቀቁ የሚደገፉ ዋሌቶችን፣ የተቀባይ መስፈርቶችን፣ ገደቦችንና የመድረሻ ግምቶችን እናሳውቃለን።",
    ),
  },
  {
    id: "quote-details",
    category: "sending",
    question: localized(
      "What rate, fees, and delivery time will I get?",
      "ምን የምንዛሬ ተመን፣ ክፍያና የመድረሻ ጊዜ አገኛለሁ?",
    ),
    answer: localized(
      "Your quote will be designed to show the exchange rate, transfer fee, expected ETB received, delivery estimate, and expiry before confirmation. Pricing will accompany launch. Delivery speed and rates vary by the eligible transfer; instant delivery and a market-best rate are not guaranteed.",
      "የዝውውር ዝርዝርዎ ከማረጋገጥዎ በፊት ተመኑን፣ ክፍያውን፣ የሚጠበቀውን ETB፣ የመድረሻ ግምትና ማብቂያ እንዲያሳይ ይዘጋጃል። ዋጋ በምረቃው ይገለጻል። ፍጥነትና ተመን በብቁ ዝውውሩ ይለያያሉ፤ ፈጣን መድረስ ወይም ከገበያ ሁሉ የተሻለ ተመን ዋስትና የለም።",
    ),
  },
  {
    id: "cash-card",
    category: "cards",
    question: localized(
      "How will the Samra Pay Charge card work?",
      "የSamra Pay Charge ካርድ እንዴት ይሰራል?",
    ),
    answer: localized(
      "Samra Pay Charge is designed around a pay-in-full structure, with spending and balance controls to support everyday money management. It differs from a prepaid card. Issuing, funding, spending limits, repayment, and eligibility will follow the final card terms.",
      "Samra Pay Charge ዕለታዊ የገንዘብ አስተዳደርን ለመደገፍ በሙሉ በሚከፈል መዋቅርና በወጪና ቀሪ ሂሳብ ቁጥጥር ዙሪያ ተነድፏል። ከቅድመ ክፍያ ካርድ ይለያል። አወጣጥ፣ ገንዘብ መጫን፣ የወጪ ገደብ፣ መክፈያና ብቁነት በመጨረሻው የካርድ ውል ይመራሉ።",
    ),
  },
  {
    id: "credit-building",
    category: "cards",
    question: localized(
      "How could Samra Pay help me build credit?",
      "Samra Pay የክሬዲት ታሪኬን እንዳጠናክር እንዴት ሊረዳኝ ይችላል?",
    ),
    answer: localized(
      "Samra Pay plans to report eligible recurring bills or payment activity to participating credit bureaus where available, subject to enrollment and final program terms. No bureau coverage or credit-score improvement is guaranteed.",
      "Samra Pay ብቁ የሆኑ ተደጋጋሚ ክፍያዎችን ወይም የክፍያ እንቅስቃሴን አገልግሎቱ በሚገኝበት ቦታ ለሚሳተፉ የክሬዲት ቢሮዎች ለማሳወቅ አቅዷል፤ ይህም በምዝገባና በመጨረሻው የፕሮግራም ውሎች ይገዛል። የቢሮ ሽፋን ወይም የክሬዲት ነጥብ መሻሻል ዋስትና የለውም።",
    ),
  },
  {
    id: "shebamiles",
    category: "cards",
    question: localized(
      "How will ShebaMiles rewards work?",
      "የShebaMiles ሽልማቶች እንዴት ይሰራሉ?",
    ),
    answer: localized(
      "ShebaMiles earning and any Ethiopian Airlines co-branding are proposed. They require executed commercial and technical agreements. Earn rates, eligibility, award timing, redemption, expiration, and other terms are not final.",
      "ShebaMiles ማግኘትና ከEthiopian Airlines ጋር የሚደረግ ማንኛውም የጋራ ብራንድ የቀረቡ ሀሳቦች ናቸው። ተፈርመው የተጠናቀቁ የንግድና የቴክኒክ ስምምነቶችን ይፈልጋሉ። የማግኛ መጠን፣ ብቁነት፣ የሽልማት ጊዜ፣ አጠቃቀም፣ ማብቂያና ሌሎች ውሎች ገና የመጨረሻ አይደሉም።",
    ),
  },
  {
    id: "planned-memberships",
    category: "cards",
    question: localized(
      "What memberships and rewards are in the launch portfolio?",
      "በምረቃ ስብስቡ ምን አባልነቶችና ሽልማቶች አሉ?",
    ),
    answer: localized(
      "Elite targets a $195 annual membership and a 15,000-ShebaMiles annual reward. The proposed Ethiopian Airlines tier targets $495 annually and 45,000 ShebaMiles. These proposed terms remain subject to partner agreements, eligibility, and final product terms. Elite 100 has separate invitation terms.",
      "Elite የ$195 ዓመታዊ አባልነትና የ15,000 ShebaMiles ዓመታዊ ሽልማት ዒላማ አለው። የታቀደው የEthiopian Airlines ደረጃ ዓመታዊ $495 እና 45,000 ShebaMiles ዒላማ አለው። እነዚህ የታቀዱ ውሎች በአጋር ስምምነቶች፣ በብቁነትና በመጨረሻ የምርት ውሎች ይገዛሉ። Elite 100 የተለየ የግብዣ ውል አለው።",
    ),
  },
  {
    id: "elite-100",
    category: "cards",
    question: localized(
      "What makes Elite 100 different?",
      "Elite 100ን የሚለየው ምንድን ነው?",
    ),
    answer: localized(
      "Elite 100 is our invitation-only founding edition for 100 founder-selected members, with an individually numbered titanium card design. It sits alongside the three everyday tiers rather than automatically inheriting the airline tier’s benefits. Pricing, benefits, and issuance terms will accompany invitations.",
      "Elite 100 በመስራቹ ለሚመረጡ 100 አባላት በግብዣ ብቻ የሚቀርብ፣ በተናጠል ቁጥር የተሰጠው የቲታኒየም ካርድ ንድፍ ያለው የመስራች እትማችን ነው። ከሦስቱ ዕለታዊ ደረጃዎች ጎን ይቀርባል እንጂ የአየር መንገድ ደረጃውን ጥቅሞች በራስ-ሰር አይወርስም። ዋጋ፣ ጥቅሞችና የአወጣጥ ውሎች ከግብዣዎች ጋር ይገለጻሉ።",
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
    question: localized(
      "How will my money and information be protected?",
      "ገንዘቤና መረጃዬ እንዴት ይጠበቃሉ?",
    ),
    answer: localized(
      "Identity verification, access controls, transaction monitoring, and reconciliation are central to our product design. Provider-specific custody, safeguarding, insurance, and privacy terms will be published before enrollment. Use only Samra’s official enrollment channels for sensitive information.",
      "የማንነት ማረጋገጫ፣ የመዳረሻ ቁጥጥር፣ የግብይት ክትትልና ማስታረቅ የምርት ንድፋችን ዋና መሠረቶች ናቸው። የአቅራቢ ጥበቃ፣ ደህንነት፣ ኢንሹራንስና ግላዊነት ውሎች ከምዝገባ በፊት ይታተማሉ። ሚስጥራዊ መረጃን በSamra ኦፊሴላዊ የምዝገባ መንገዶች ብቻ ያስገቡ።",
    ),
  },
  {
    id: "invest",
    category: "company",
    question: localized(
      "Can I invest in Samra Pay?",
      "በSamra Pay ላይ ኢንቨስት ማድረግ እችላለሁ?",
    ),
    answer: localized(
      "This website is not a securities offering and does not accept investments. Email updates or an Elite 100 invitation do not reserve shares or create investor status. Any investment opportunity would require official offering materials, eligibility rules, risk disclosures, and an authorized subscription process.",
      "ይህ ድረ ገጽ የዋስትና ሰነድ አቅርቦት አይደለም እና ኢንቨስትመንት አይቀበልም። የኢሜይል መረጃ ወይም የElite 100 ግብዣ አክሲዮን አያስይዝም ወይም የኢንቨስተር ሁኔታ አይፈጥርም። የኢንቨስትመንት እድል ኦፊሴላዊ ሰነዶችን፣ የብቁነት ደንቦችን፣ የአደጋ መግለጫዎችንና የተፈቀደ የምዝገባ ሂደትን ይፈልጋል።",
    ),
  },
  {
    id: "updates",
    category: "company",
    question: localized("How can I get updates?", "ዜናዎችን እንዴት ማግኘት እችላለሁ?"),
    answer: localized(
      "Visit Stay informed on the homepage for launch news and the email-updates option as it opens. Updates will cover product announcements and availability. Email consent is separate from card applications, and every update will include an unsubscribe option.",
      "ለምረቃ ዜናና ሲከፈት ለኢሜይል መረጃ ምዝገባ በመነሻ ገጹ ያለውን ዜና ይከታተሉ ክፍል ይጎብኙ። መረጃዎች የምርት ማስታወቂያዎችንና አቅርቦትን ያካትታሉ። የኢሜይል ፈቃድ ከካርድ ማመልከቻ የተለየ ነው፤ እያንዳንዱ መልዕክት ምዝገባ ማቋረጫ አማራጭ ይኖረዋል።",
    ),
  },
];

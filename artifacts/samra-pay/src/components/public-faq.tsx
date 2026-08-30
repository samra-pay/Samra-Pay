import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { usePublicLanguage } from "@/lib/public-i18n";
import type { PublicFaqItem } from "@/content/public-faq";

export function PublicFaqAccordion({
  items,
  idPrefix,
  initiallyOpen = true,
}: {
  items: PublicFaqItem[];
  idPrefix: string;
  initiallyOpen?: boolean;
}) {
  const { text } = usePublicLanguage();
  const [openQuestion, setOpenQuestion] = useState<string | null>(initiallyOpen ? items[0]?.id ?? null : null);

  return (
    <div className="faq-list">
      {items.map((item) => {
        const isOpen = openQuestion === item.id;
        const answerId = `${idPrefix}-${item.id}`;
        return (
          <div className="faq-item" key={item.id}>
            <h3 className="faq-question-heading">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => setOpenQuestion(isOpen ? null : item.id)}
              >
                <span>{text(item.question)}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </h3>
            <div id={answerId} className="faq-answer" hidden={!isOpen}>
              <p>{text(item.answer)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

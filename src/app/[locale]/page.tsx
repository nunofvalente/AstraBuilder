import { notFound } from "next/navigation";

import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale } from "@/i18n/config";
import { supabase } from "@/lib/supabase/supabaseClient";
import type { Card } from "@/types/card";

type LocaleParams = {
  locale: string;
};

type LocalePageProps = {
  params: Promise<LocaleParams>;
};

export default async function HomePage({ params }: LocalePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { cards: cardsTexts } = dictionary;

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .returns<Card[]>();

  if (error) {
    console.error(error);
    return <p>{cardsTexts.error}</p>;
  }

  const cards = data ?? [];

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">{cardsTexts.title}</h1>
      {cards.length === 0 ? (
        <p className="text-gray-600">{cardsTexts.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <li key={card.id} className="p-4 border rounded shadow">
              <p className="font-semibold">{card.name}</p>
              <p>
                {cardsTexts.fields.type}: {card.type}
              </p>
              {card.subtype && (
                <p>
                  {cardsTexts.fields.subtype}: {card.subtype}
                </p>
              )}
              {card.cost !== null && (
                <p>
                  {cardsTexts.fields.cost}: {card.cost}
                </p>
              )}
              {card.attack !== null && (
                <p>
                  {cardsTexts.fields.attack}: {card.attack}
                </p>
              )}
              {card.health !== null && (
                <p>
                  {cardsTexts.fields.health}: {card.health}
                </p>
              )}
              {card.influence !== null && (
                <p>
                  {cardsTexts.fields.influence}: {card.influence}
                </p>
              )}
              <p className="text-sm italic whitespace-pre-line">
                {card.rules_text}
              </p>
              {card.description && (
                <p className="text-xs text-gray-500 mt-2">{card.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
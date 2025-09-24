import { supabase } from '../../lib/supabase/supabaseClient';

export default async function Home() {
  // Fetch cards from Supabase (server component)
  const { data: cards, error } = await supabase.from('cards').select('*');

  if (error) {
    console.error(error);
    return <p>Failed to load cards.</p>;
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">All Cards</h1>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards?.map((card) => (
          <li key={card.id} className="p-4 border rounded shadow">
            <p className="font-semibold">{card.name}</p>
            <p>Type: {card.type}</p>
            {card.subtype && <p>Subtype: {card.subtype}</p>}
            {card.cost !== null && <p>Cost: {card.cost}</p>}
            {card.attack !== null && <p>Attack: {card.attack}</p>}
            {card.health !== null && <p>Health: {card.health}</p>}
            {card.influence !== null && <p>Influence: {card.influence}</p>}
            <p className="text-sm italic whitespace-pre-line">
              {card.rules_text}
            </p>
            {card.description && (
              <p className="text-xs text-gray-500 mt-2">{card.description}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

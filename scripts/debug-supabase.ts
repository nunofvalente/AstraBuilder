import { getPublicDeckSummaries } from '../src/lib/supabase/decks';

async function main() {
  try {
    const decks = await getPublicDeckSummaries();
    console.log('Loaded decks', decks.length);
  } catch (error) {
    console.error('Error loading decks', error);
    if (error && typeof error === 'object') {
      console.error('Serialized error', JSON.stringify(error, null, 2));
    }
  }
}

main();

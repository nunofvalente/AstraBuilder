import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';

import { getSetupView, placeMultiplayerStartingSupply, resolveMultiplayerOpeningHand, type MatchDeckSnapshot, type PlayerSetupState } from '@/lib/multiplayer/match-setup';
import { buildMultiplayerBoardState, buildMultiplayerSetupState, projectBoardState, swapGameStatePerspective } from '@/lib/multiplayer/board-state';
import { activateCardAbility, addLogEntry, advanceToNextTurn, declareBattlefieldAttack, passCounterPriority, playCounterCard, resolvePendingChoice, type GameState } from '@/app/[locale]/play/game-rules';
import { applyCardAction } from '@/app/[locale]/play/game-actions';
import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';

type Context = { params: Promise<{ code: string }> };
type Seat = 'host' | 'guest';

async function loadParticipant(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, request: Request, code: string) {
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return null;
  const { data: room } = await admin.from('game_rooms').select('id,host_user_id,guest_user_id,status').eq('code', code).maybeSingle();
  if (!room) return null;
  const seat: Seat | null = room.host_user_id === userId ? 'host' : room.guest_user_id === userId ? 'guest' : null;
  if (!seat) return null;
  const participantIds = [room.host_user_id, room.guest_user_id].filter(Boolean);
  const { data: profiles } = await admin.from('profiles').select('id,username').in('id', participantIds);
  const namesById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username?.trim() || null]));
  return {
    room,
    seat,
    userId,
    names: {
      host: namesById.get(room.host_user_id) ?? 'Host',
      guest: namesById.get(room.guest_user_id) ?? 'Guest',
    },
  };
}

function personalizeLog(suffix: string, names: { host: string; guest: string }): string {
  return suffix
    .replace(/\bYour\b/g, () => `${names.host}'s`)
    .replace(/\bYou\b/g, () => names.host)
    .replace(/\bBot\b/g, () => names.guest);
}

function viewMatch(match: Record<string, unknown>, seat: Seat, names: { host: string; guest: string }) {
  const ownSetup = match[`${seat}_setup`] as PlayerSetupState;
  const ownDeck = match[`${seat}_deck_snapshot`] as MatchDeckSnapshot;
  const opponentSeat = seat === 'host' ? 'guest' : 'host';
  const opponentSetup = match[`${opponentSeat}_setup`] as PlayerSetupState;
  const persistedGameState = match.game_state as Parameters<typeof projectBoardState>[0] | null;
  const gameState = persistedGameState ?? buildMultiplayerSetupState(
    match.host_deck_snapshot as MatchDeckSnapshot,
    match.guest_deck_snapshot as MatchDeckSnapshot,
    match.host_setup as PlayerSetupState,
    match.guest_setup as PlayerSetupState
  );
  const board = projectBoardState(gameState, seat);
  board.viewerState.playerOpeningHandConfirmed = ownSetup.openingHandConfirmed;
  board.viewerState.playerStartingSupplyPlaced = ownSetup.supply.length > 0;
  board.viewerState.opponentStartingSupplyPlaced = opponentSetup.supply.length > 0;
  board.viewerState.log = board.viewerState.log.map((entry) => ({ ...entry, suffix: personalizeLog(entry.suffix, names) }));
  return {
    id: match.id,
    revision: match.revision,
    status: match.status,
    seat,
    firstPlayer: match.first_player,
    you: getSetupView(ownDeck, ownSetup),
    opponent: { openingHandConfirmed: opponentSetup.openingHandConfirmed, startingSupplyPlaced: opponentSetup.supply.length > 0 },
    players: { you: names[seat], opponent: names[seat === 'host' ? 'guest' : 'host'] },
    board,
  };
}

export async function GET(request: Request, { params }: Context) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Match service is not configured.' }, { status: 503 });
  const code = (await params).code.toUpperCase();
  const participant = await loadParticipant(admin, request, code);
  if (!participant) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });
  const { data: match, error } = await admin.from('game_matches').select('*').eq('room_id', participant.room.id).maybeSingle();
  if (error || !match) return NextResponse.json({ message: 'Match is not ready.' }, { status: error ? 500 : 409 });
  const { data: latestAction } = await admin
    .from('game_match_actions')
    .select('revision,actor_user_id,action')
    .eq('match_id', match.id)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    match: {
      ...viewMatch(match, participant.seat, participant.names),
      latestAction: latestAction ? {
        revision: latestAction.revision,
        actor: latestAction.actor_user_id === participant.userId ? 'you' : 'opponent',
        action: latestAction.action,
      } : null,
    },
  });
}

export async function POST(request: Request, { params }: Context) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Match service is not configured.' }, { status: 503 });
  const code = (await params).code.toUpperCase();
  const participant = await loadParticipant(admin, request, code);
  if (!participant) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: string; instanceId?: string; firstPlayer?: Seat; revision?: number } | null;
  if (!body || !Number.isInteger(body.revision)) return NextResponse.json({ message: 'Invalid match action.' }, { status: 400 });

  const { data: match } = await admin.from('game_matches').select('*').eq('room_id', participant.room.id).maybeSingle();
  if (!match) return NextResponse.json({ message: 'Match is unavailable.' }, { status: 409 });
  if (match.revision !== body.revision) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });

  const finalizeWinner = async (state: GameState, updated: Record<string, unknown>) => {
    if (!state.winner) return;
    await admin.from('game_matches').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', match.id);
    await admin.from('game_rooms').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', participant.room.id);
    updated.status = 'finished';
  };

  if (match.status === 'setup' && body.action === 'leave') {
    const setupState = buildMultiplayerSetupState(
      match.host_deck_snapshot as MatchDeckSnapshot,
      match.guest_deck_snapshot as MatchDeckSnapshot,
      match.host_setup as PlayerSetupState,
      match.guest_setup as PlayerSetupState
    );
    const winner = participant.seat === 'host' ? 'opponent' : 'player';
    const leftState = addLogEntry({ ...setupState, winner }, { suffix: `${participant.names[participant.seat]} left the match.` });
    const nextRevision = match.revision + 1;
    const { data: updated } = await admin.from('game_matches').update({ game_state: leftState, status: 'finished', revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
    if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
    await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'leave' } });
    await admin.from('game_rooms').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', participant.room.id);
    return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
  }

  if (match.status === 'playing') {
    if (!match.game_state) return NextResponse.json({ message: 'That game action is not available yet.' }, { status: 400 });
    const gameState = match.game_state as GameState;
    const actionState = participant.seat === 'host' ? gameState : swapGameStatePerspective(gameState);
    const toCanonicalState = (state: GameState) => participant.seat === 'host' ? state : swapGameStatePerspective(state);
    if (body.action === 'concede') {
      const winner = participant.seat === 'host' ? 'opponent' : 'player';
      const concededState = addLogEntry({ ...gameState, winner }, { suffix: `${participant.names[participant.seat]} conceded.` });
      const nextRevision = match.revision + 1;
      const { data: updated } = await admin.from('game_matches').update({ game_state: concededState, status: 'finished', revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'concede' } });
      await admin.from('game_rooms').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', participant.room.id);
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action === 'moveCard') {
      const move = body as typeof body & { instanceId?: string; fromZone?: string; toZone?: string; moveOptions?: Record<string, unknown> };
      if (!move.instanceId || !move.fromZone || !move.toZone) return NextResponse.json({ message: 'Invalid card action.' }, { status: 400 });
      const result = applyCardAction(actionState, {
        owner: 'player',
        instanceId: move.instanceId,
        fromZone: move.fromZone as Parameters<typeof applyCardAction>[1]['fromZone'],
        toZone: move.toZone as Parameters<typeof applyCardAction>[1]['toZone'],
        options: move.moveOptions,
      });
      if (!result.applied) return NextResponse.json({ message: result.error || 'That card action is not legal.' }, { status: 400 });
      const nextRevision = match.revision + 1;
      const canonicalState = toCanonicalState(result.state);
      const { data: updated } = await admin.from('game_matches').update({ game_state: canonicalState, revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await finalizeWinner(canonicalState, updated);
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'moveCard', instanceId: move.instanceId, fromZone: move.fromZone, toZone: move.toZone, options: move.moveOptions ?? {} } });
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action === 'attack') {
      const attack = body as typeof body & { instanceId?: string; targetZone?: string };
      if (!attack.instanceId || !attack.targetZone) return NextResponse.json({ message: 'Invalid attack.' }, { status: 400 });
      const result = declareBattlefieldAttack(actionState, 'player', attack.instanceId, attack.targetZone as Parameters<typeof declareBattlefieldAttack>[3]);
      if ('error' in result) return NextResponse.json({ message: result.error }, { status: 400 });
      const nextRevision = match.revision + 1;
      const { data: updated } = await admin.from('game_matches').update({ game_state: toCanonicalState(result.state), revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await finalizeWinner(toCanonicalState(result.state), updated);
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'attack', instanceId: attack.instanceId, targetZone: attack.targetZone } });
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action === 'passCounter') {
      const result = passCounterPriority(actionState, 'player');
      if ('error' in result) return NextResponse.json({ message: result.error }, { status: 400 });
      const nextRevision = match.revision + 1;
      const { data: updated } = await admin.from('game_matches').update({ game_state: toCanonicalState(result.state), revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await finalizeWinner(toCanonicalState(result.state), updated);
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'passCounter' } });
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action === 'playCounter') {
      const counter = body as typeof body & { instanceId?: string; targetInstanceId?: string };
      if (!counter.instanceId) return NextResponse.json({ message: 'Invalid counter.' }, { status: 400 });
      const result = playCounterCard(actionState, 'player', counter.instanceId, { targetInstanceId: counter.targetInstanceId });
      if ('error' in result) return NextResponse.json({ message: result.error }, { status: 400 });
      const nextRevision = match.revision + 1;
      const { data: updated } = await admin.from('game_matches').update({ game_state: toCanonicalState(result.state), revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await finalizeWinner(toCanonicalState(result.state), updated);
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'playCounter', instanceId: counter.instanceId, targetInstanceId: counter.targetInstanceId } });
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action === 'resolveChoice') {
      const choice = body as typeof body & { selectedInstanceIds?: string[] };
      if (!actionState.pendingChoice || actionState.pendingChoice.owner !== 'player' || !Array.isArray(choice.selectedInstanceIds)) return NextResponse.json({ message: 'That choice belongs to the other player.' }, { status: 403 });
      const result = resolvePendingChoice(actionState, choice.selectedInstanceIds);
      if ('error' in result) return NextResponse.json({ message: result.error }, { status: 400 });
      const nextRevision = match.revision + 1;
      const { data: updated } = await admin.from('game_matches').update({ game_state: toCanonicalState(result), revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await finalizeWinner(toCanonicalState(result), updated);
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'resolveChoice', selectedInstanceIds: choice.selectedInstanceIds } });
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action === 'activateAbility') {
      const ability = body as typeof body & { sourceInstanceId?: string; targetInstanceId?: string };
      if (!ability.sourceInstanceId || !ability.targetInstanceId) return NextResponse.json({ message: 'Choose an ability source and target.' }, { status: 400 });
      const result = activateCardAbility(actionState, 'player', ability.sourceInstanceId, ability.targetInstanceId);
      if ('error' in result) return NextResponse.json({ message: result.error }, { status: 400 });
      const canonicalState = toCanonicalState(result.state);
      const nextRevision = match.revision + 1;
      const { data: updated } = await admin.from('game_matches').update({ game_state: canonicalState, revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
      if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
      await finalizeWinner(canonicalState, updated);
      await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'activateAbility', sourceInstanceId: ability.sourceInstanceId, targetInstanceId: ability.targetInstanceId } });
      return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
    }
    if (body.action !== 'passTurn') return NextResponse.json({ message: 'That game action is not available yet.' }, { status: 400 });
    if (actionState.activePlayer !== 'player') return NextResponse.json({ message: 'It is not your turn.' }, { status: 403 });
    const nextState = toCanonicalState(advanceToNextTurn(actionState));
    const nextRevision = match.revision + 1;
    const { data: updated } = await admin.from('game_matches').update({ game_state: nextState, revision: nextRevision, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
    if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
    await finalizeWinner(nextState, updated);
    await admin.from('game_match_actions').insert({ match_id: match.id, revision: nextRevision, actor_user_id: participant.userId, action: { type: 'passTurn' } });
    return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
  }

  if (match.status !== 'setup') return NextResponse.json({ message: 'Match setup is unavailable.' }, { status: 409 });

  const setupKey = `${participant.seat}_setup`;
  let setup = match[setupKey] as PlayerSetupState;
  if (body.action === 'keep' || body.action === 'mulligan') {
    if (setup.openingHandConfirmed) return NextResponse.json({ message: 'Opening hand is already confirmed.' }, { status: 409 });
    setup = resolveMultiplayerOpeningHand(setup, body.action === 'mulligan');
  } else if (body.action === 'supply' && body.instanceId) {
    const next = placeMultiplayerStartingSupply(setup, body.instanceId);
    if (!next) return NextResponse.json({ message: 'Choose a card from your confirmed hand.' }, { status: 400 });
    setup = next;
  } else {
    return NextResponse.json({ message: 'Invalid match action.' }, { status: 400 });
  }

  const hostSetup = participant.seat === 'host' ? setup : match.host_setup as PlayerSetupState;
  const guestSetup = participant.seat === 'guest' ? setup : match.guest_setup as PlayerSetupState;
  const setupComplete = hostSetup.supply.length > 0 && guestSetup.supply.length > 0;
  const firstPlayer = setupComplete ? (randomInt(2) === 0 ? 'host' : 'guest') : null;
  const gameState = firstPlayer
    ? buildMultiplayerBoardState(
        match.host_deck_snapshot as MatchDeckSnapshot,
        match.guest_deck_snapshot as MatchDeckSnapshot,
        hostSetup,
        guestSetup,
        firstPlayer
      )
    : null;
  const update = {
    [setupKey]: setup,
    revision: match.revision + 1,
    updated_at: new Date().toISOString(),
    ...(setupComplete ? { first_player: firstPlayer, game_state: gameState, status: 'playing' } : {}),
  };
  const { data: updated } = await admin.from('game_matches').update(update).eq('id', match.id).eq('revision', match.revision).select('*').maybeSingle();
  if (!updated) return NextResponse.json({ message: 'Match state changed. Try again.' }, { status: 409 });
  if (setupComplete) {
    await admin.from('game_rooms').update({ status: 'playing', updated_at: new Date().toISOString() }).eq('id', participant.room.id);
  }
  return NextResponse.json({ match: viewMatch(updated, participant.seat, participant.names) });
}

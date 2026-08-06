'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronsRight, Flag, Users } from 'lucide-react';

import type { Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { getPlayBoardCopy, getPlayControlsCopy, getPlayLobbyCopy, translateGameLogText } from '../../play/play-localization';
import { AttackArrowOverlay, BattlefieldPanel, CombinedStagingSupplyPanel, DamageBadge, HandStrip, type AttackArrowState } from '../../play/game-board-ui';
import { ActionLogList, OpponentHandStrip, VictoryPointScoreControl } from '../../play/game-client-ui';
import type { GameState } from '../../play/game-rules';
import { canManuallySupplyFromHand, getCardController, getCounterPlayError, getCounterTargetOptions, getFriendlyUnitsInPlay, getReadySupplyCount, getStagingUnitCards, getUnitsInPlay, isUnitCard, type GameCardInstance, type ZoneId } from '../../play/game-rules';
import type { MoveCardOptions } from '../../play/game-actions';
import { CARD_BACK_IMAGE_SRC, getPendingChoiceTargetCards, isPrivateOpponentSupplyChoiceTarget } from '../../play/game-client-support';

type RoomSummary = { id: string; code: string; status: 'waiting' | 'ready' | 'playing' | 'finished'; host_last_seen_at?: string | null; guest_last_seen_at?: string | null };
type SetupMatch = {
  revision: number;
  status: 'setup' | 'playing' | 'finished';
  seat: 'host' | 'guest';
  firstPlayer: 'host' | 'guest' | null;
  you: { openingHandConfirmed: boolean; startingSupplyPlaced: boolean; hand: Array<{ instanceId: string; card: { id: string; name: string; imageSrc: string } }> };
  opponent: { openingHandConfirmed: boolean; startingSupplyPlaced: boolean };
  players: { you: string; opponent: string };
  latestAction?: { revision: number; actor: 'you' | 'opponent'; action: { type: string; instanceId?: string; targetZone?: ZoneId } } | null;
  board: null | {
    revisionIndependentState: { turn: number; activeSeat: 'host' | 'guest' | null; firstSeat: 'host' | 'guest' | null; winnerSeat: 'host' | 'guest' | null; pendingChoiceSeat: 'host' | 'guest' | null; hostVictoryPoints: number; guestVictoryPoints: number; battlefield: { left: unknown[]; center: unknown[]; right: unknown[] } };
    you: { zones: { hand: Array<{ instanceId: string; card: { name: string; imageSrc: string } }>; deck: unknown[]; supply: unknown[] } };
    opponent: { handCount: number; deckCount: number; supply: unknown[] };
    viewerState: GameState;
  };
};

function ChoiceCardButton({
  card,
  selected = false,
  hidden = false,
  onClick,
}: {
  card: GameCardInstance;
  selected?: boolean;
  hidden?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-2 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${selected ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/15' : 'border-[color:var(--border)] bg-[color:var(--surface-muted)] hover:border-[color:var(--accent)]'}`}
    >
      <span className="relative block aspect-[5/7] overflow-hidden rounded border border-black/30 bg-black/15">
        <Image src={hidden ? CARD_BACK_IMAGE_SRC : card.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
        {hidden ? null : <DamageBadge instance={card} />}
      </span>
      <span className="mt-1 block truncate text-xs font-semibold">{hidden ? 'Supply card' : card.card.name}</span>
    </button>
  );
}

function getMatchEndingLogText(state: GameState): string | null {
  const endingEntry = [...state.log].reverse().find((entry) =>
    /conceded\.|left the match\.|did not reconnect|victory points and .*wins? the game/i.test(entry.suffix)
  );
  return endingEntry?.suffix ?? null;
}

export function RoomClient({ locale, roomCode }: { locale: Locale; roomCode: string }) {
  const copy = getPlayLobbyCopy(locale);
  const controlsCopy = getPlayControlsCopy(locale);
  const boardCopy = getPlayBoardCopy(locale);
  const router = useRouter();
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [isParticipant, setIsParticipant] = useState(false);
  const [role, setRole] = useState<'host' | 'guest' | 'spectator'>('spectator');
  const [isCancelling, setIsCancelling] = useState(false);
  const [match, setMatch] = useState<SetupMatch | null>(null);
  const [isMatchActionPending, setIsMatchActionPending] = useState(false);
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);
  const [pendingCounterSourceId, setPendingCounterSourceId] = useState<string | null>(null);
  const [choiceSelectionIds, setChoiceSelectionIds] = useState<string[]>([]);
  const [isRematchRequested, setIsRematchRequested] = useState(false);
  const [isOpponentRematchRequested, setIsOpponentRematchRequested] = useState(false);
  const [isRematchDeclined, setIsRematchDeclined] = useState(false);
  const [pendingAbilitySourceId, setPendingAbilitySourceId] = useState<string | null>(null);
  const [pendingHandCost, setPendingHandCost] = useState<{ sourceInstanceId: string; kind: 'sacrifice' | 'discard' | 'reanimate' } | null>(null);
  const [isInviteCopied, setIsInviteCopied] = useState(false);
  const [attackArrow, setAttackArrow] = useState<AttackArrowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animatedRemoteAttackRevision = useRef<number | null>(null);
  const currentMatchRef = useRef<SetupMatch | null>(null);
  const pendingRemoteAttackRevision = useRef<number | null>(null);
  const remoteAttackTimer = useRef<number | null>(null);
  const requestedRematchRef = useRef(false);
  currentMatchRef.current = match;

  useEffect(() => {
    let active = true;
    async function loadRoom() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (active) setError(copy.signInPrompt);
        return;
      }
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}`, { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json() as { room?: RoomSummary; isParticipant?: boolean; role?: 'host' | 'guest' | 'spectator'; message?: string };
      if (!active) return;
      if (!response.ok || !payload.room) setError(payload.message || copy.roomRequestFailed);
      else {
        setRoom(payload.room);
        setIsParticipant(Boolean(payload.isParticipant));
        setRole(payload.role ?? 'spectator');
      }
    }
    void loadRoom();
    return () => { active = false; };
  }, [copy.roomRequestFailed, copy.signInPrompt, roomCode]);

  useEffect(() => {
    if (!room || !isParticipant) return;
    const channel = supabase.channel(`room-page-${room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${room.id}` }, (payload) => setRoom(payload.new as RoomSummary))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isParticipant, room?.id]);

  useEffect(() => {
    if (!match?.board) return;
    document.body.classList.add('simulator-route-active');
    return () => document.body.classList.remove('simulator-route-active');
  }, [match?.board]);

  useEffect(() => {
    if (!isParticipant || !room || !['ready', 'playing', 'finished'].includes(room.status)) return;
    let active = true;
    async function loadMatch() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/match`, { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json() as { match?: SetupMatch };
      if (!active || !response.ok || !payload.match) return;
      const incomingMatch = payload.match;
      const currentMatch = currentMatchRef.current;
      const latestAction = incomingMatch.latestAction;
      const isNewRemoteAttack = Boolean(
        currentMatch?.board &&
        incomingMatch.revision > currentMatch.revision &&
        latestAction?.revision === incomingMatch.revision &&
        latestAction.actor === 'opponent' &&
        latestAction.action.type === 'attack' &&
        latestAction.action.instanceId &&
        latestAction.action.targetZone
      );
      if (!isNewRemoteAttack || !latestAction?.action.instanceId || !latestAction.action.targetZone) {
        if (pendingRemoteAttackRevision.current !== incomingMatch.revision) setMatch(incomingMatch);
        return;
      }
      if (pendingRemoteAttackRevision.current === incomingMatch.revision || animatedRemoteAttackRevision.current === incomingMatch.revision) return;

      const attackerElement = document.querySelector(`[data-card-instance-id="${CSS.escape(latestAction.action.instanceId)}"]`);
      const targetZone = latestAction.action.targetZone;
      const defender = currentMatch?.board?.viewerState.zones[targetZone].find(
        (card) => isUnitCard(card.card) && getCardController(card) === 'player'
      );
      const targetElement = defender
        ? document.querySelector(`[data-card-instance-id="${CSS.escape(defender.instanceId)}"]`)
        : document.querySelector(`[data-battlefield-zone="${CSS.escape(targetZone)}"]`);
      if (!attackerElement || !targetElement) {
        animatedRemoteAttackRevision.current = incomingMatch.revision;
        setMatch(incomingMatch);
        return;
      }

      pendingRemoteAttackRevision.current = incomingMatch.revision;
      animatedRemoteAttackRevision.current = incomingMatch.revision;
      const fromRect = attackerElement.getBoundingClientRect();
      const toRect = targetElement.getBoundingClientRect();
      const arrowId = Date.now();
      setAttackArrow({
        id: arrowId,
        from: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
        to: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
      });
      remoteAttackTimer.current = window.setTimeout(() => {
        setAttackArrow((current) => current?.id === arrowId ? null : current);
        pendingRemoteAttackRevision.current = null;
        setMatch(incomingMatch);
      }, 700);
    }
    void loadMatch();
    const timer = window.setInterval(() => void loadMatch(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (remoteAttackTimer.current !== null) window.clearTimeout(remoteAttackTimer.current);
    };
  }, [isParticipant, room?.status, roomCode]);

  useEffect(() => {
    if (!isParticipant || !room || !['waiting', 'ready', 'playing'].includes(room.status)) return;
    let active = true;
    async function heartbeat() {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session?.access_token) return;
      await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/presence`, { method: 'POST', headers: { authorization: `Bearer ${data.session.access_token}` } });
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isParticipant, room?.status, roomCode]);

  async function submitMatchAction(action: 'keep' | 'mulligan' | 'supply' | 'passTurn' | 'concede' | 'leave' | 'moveCard' | 'attack' | 'passCounter' | 'playCounter' | 'resolveChoice' | 'activateAbility', options?: { instanceId?: string; sourceInstanceId?: string; fromZone?: ZoneId; toZone?: ZoneId; targetZone?: ZoneId; targetInstanceId?: string; selectedInstanceIds?: string[]; moveOptions?: MoveCardOptions }) {
    if (!match) return;
    setIsMatchActionPending(true);
    setError(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError(copy.signInPrompt);
      setIsMatchActionPending(false);
      return;
    }
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/match`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, revision: match.revision, ...options }),
    });
    const payload = await response.json() as { match?: SetupMatch; message?: string };
    if (response.ok && payload.match) {
      setMatch(payload.match);
      if (action === 'concede' || action === 'leave') {
        setIsMatchActionPending(false);
        router.push(`/${locale}/play`);
        return;
      }
    }
    else setError(payload.message || copy.roomRequestFailed);
    setIsMatchActionPending(false);
  }

  async function cancelRoom() {
    setIsCancelling(true);
    setError(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError(copy.signInPrompt);
      setIsCancelling(false);
      return;
    }
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    if (response.ok) {
      router.push(`/${locale}/play`);
      return;
    }
    const payload = await response.json() as { message?: string };
    setError(payload.message || copy.roomRequestFailed);
    setIsCancelling(false);
  }

  async function requestRematch() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setIsRematchDeclined(false);
    setIsRematchRequested(true);
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/rematch`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    const payload = await response.json() as { ready?: boolean; code?: string; message?: string };
    if (response.ok) requestedRematchRef.current = true;
    if (response.ok && payload.ready && payload.code) router.push(`/${locale}/match/${payload.code}`);
    else if (!response.ok) { setError(payload.message || copy.roomRequestFailed); setIsRematchRequested(false); }
  }

  async function declineRematchAndReturn() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/rematch`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    }
    router.push(`/${locale}/play`);
  }

  useEffect(() => {
    if (match?.status !== 'finished') return;
    let active = true;
    async function loadRematchStatus() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/rematch`, { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json() as { ready?: boolean; code?: string; requestedByYou?: boolean; requestedByOpponent?: boolean };
      if (!active || !response.ok) return;
      if (requestedRematchRef.current && !payload.requestedByYou && !payload.ready) {
        requestedRematchRef.current = false;
        setIsRematchDeclined(true);
      }
      setIsRematchRequested(Boolean(payload.requestedByYou));
      setIsOpponentRematchRequested(Boolean(payload.requestedByOpponent));
      if (payload.ready && payload.code) router.push(`/${locale}/match/${payload.code}`);
    }
    void loadRematchStatus();
    const timer = window.setInterval(() => void loadRematchStatus(), 2_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [locale, match?.status, roomCode, router]);

  if (match?.board && room && ['ready', 'playing', 'finished'].includes(room.status)) {
    const gameState = match.board.viewerState;
    const battlefieldCardsByZone = {
      battlefieldLeft: gameState.zones.battlefieldLeft,
      battlefieldCenter: gameState.zones.battlefieldCenter,
      battlefieldRight: gameState.zones.battlefieldRight,
    };
    const isYourTurn = gameState.activePlayer === 'player';
    const isFinished = Boolean(gameState.winner || match.status === 'finished');
    const matchEndingLogText = getMatchEndingLogText(gameState);
    const isSetup = match.status === 'setup';
    const canChooseSupply = isSetup && match.you.openingHandConfirmed && !match.you.startingSupplyPlaced;
    const hasAnyPendingChoice = Boolean(match.board.revisionIndependentState.pendingChoiceSeat);
    const canTakeTurnActions = !isSetup && !isFinished && isYourTurn && !gameState.pendingCombat && !hasAnyPendingChoice;
    const noopMove = () => undefined;
    const setupMove = (instanceId: string, _fromZone: unknown, toZone: string) => {
      if (toZone === 'supply' && canChooseSupply) void submitMatchAction('supply', { instanceId });
    };
    const boardMove = (instanceId: string, fromZone: ZoneId, toZone: ZoneId, moveOptions?: MoveCardOptions) => {
      if (!canTakeTurnActions) return;
      if (fromZone === 'hand' && toZone === 'staging' && !moveOptions) {
        const cardId = gameState.zones.hand.find((card) => card.instanceId === instanceId)?.card.id;
        if (cardId === 'IMP004' || cardId === 'IMP005' || cardId === 'IMP006') {
          setPendingHandCost({ sourceInstanceId: instanceId, kind: cardId === 'IMP004' ? 'sacrifice' : cardId === 'IMP005' ? 'discard' : 'reanimate' });
          return;
        }
      }
      void submitMatchAction('moveCard', { instanceId, fromZone, toZone, moveOptions });
    };
    const attackBattlefield = (instanceId: string, targetZone: ZoneId) => {
      if (!canTakeTurnActions) return;
      const attackerElement = document.querySelector(`[data-card-instance-id="${CSS.escape(instanceId)}"]`);
      const defender = gameState.zones[targetZone].find((card) => isUnitCard(card.card) && card.instanceId !== instanceId) ?? null;
      const targetElement = defender
        ? document.querySelector(`[data-card-instance-id="${CSS.escape(defender.instanceId)}"]`)
        : document.querySelector(`[data-battlefield-zone="${CSS.escape(targetZone)}"]`);
      if (attackerElement && targetElement) {
        const fromRect = attackerElement.getBoundingClientRect();
        const toRect = targetElement.getBoundingClientRect();
        const arrowId = Date.now();
        setAttackArrow({
          id: arrowId,
          from: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
          to: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
        });
        window.setTimeout(() => setAttackArrow((current) => current?.id === arrowId ? null : current), 700);
      }
      void submitMatchAction('attack', { instanceId, targetZone });
    };
    const playableCounters = gameState.pendingCombat?.priorityOwner === 'player'
      ? gameState.zones.hand.filter((card) => !getCounterPlayError(gameState, 'player', card.instanceId))
      : [];
    const pendingCounter = pendingCounterSourceId ? playableCounters.find((card) => card.instanceId === pendingCounterSourceId) ?? null : null;
    const pendingCounterTargets = pendingCounter ? getCounterTargetOptions(gameState, pendingCounter) : [];
    const pendingChoiceTargets = getPendingChoiceTargetCards(gameState, gameState.pendingChoice);
    const pendingZoneIds = gameState.pendingChoice && ('availableZoneIds' in gameState.pendingChoice) ? gameState.pendingChoice.availableZoneIds : [];
    const friendlyUnits = getFriendlyUnitsInPlay(gameState, 'player');
    const pendingAbilitySource = pendingAbilitySourceId ? friendlyUnits.find((unit) => unit.instanceId === pendingAbilitySourceId) ?? null : null;
    const pendingAbilityTargets = pendingAbilitySource
      ? pendingAbilitySource.card.id === 'IMP066' || pendingAbilitySource.card.id === 'IMP139'
        ? friendlyUnits
        : pendingAbilitySource.card.id === 'IMP073'
          ? friendlyUnits.filter((unit) => ['drone', 'vehicle'].includes(unit.card.subtype.trim().toLowerCase()))
          : pendingAbilitySource.card.id === 'IMP079'
            ? getUnitsInPlay(gameState)
            : friendlyUnits.filter((unit) => unit.instanceId !== pendingAbilitySource.instanceId)
      : [];
    const requestAbility = (source: GameCardInstance) => {
      if (!canTakeTurnActions) return;
      if (source.card.id === 'IMP160') void submitMatchAction('activateAbility', { sourceInstanceId: source.instanceId, targetInstanceId: source.instanceId });
      else setPendingAbilitySourceId(source.instanceId);
    };
    const pendingHandCostTargets = pendingHandCost?.kind === 'sacrifice'
      ? friendlyUnits
      : pendingHandCost?.kind === 'discard'
        ? gameState.zones.hand.filter((card) => card.instanceId !== pendingHandCost.sourceInstanceId)
        : pendingHandCost?.kind === 'reanimate'
          ? gameState.zones.graveyard.filter((card) => isUnitCard(card.card) && !card.card.type.toLowerCase().includes('renowned'))
          : [];
    const pendingHandCostSource = pendingHandCost ? gameState.zones.hand.find((card) => card.instanceId === pendingHandCost.sourceInstanceId) ?? null : null;
    const resolveHandCost = (targetInstanceId: string) => {
      if (!pendingHandCost) return;
      const moveOptions: MoveCardOptions = pendingHandCost.kind === 'sacrifice' ? { sacrificeUnitInstanceId: targetInstanceId } : pendingHandCost.kind === 'discard' ? { discardCardInstanceId: targetInstanceId } : { reanimateTargetInstanceId: targetInstanceId };
      const sourceInstanceId = pendingHandCost.sourceInstanceId;
      setPendingHandCost(null);
      boardMove(sourceInstanceId, 'hand', 'staging', moveOptions);
    };
    const opponentLastSeen = role === 'host' ? room.guest_last_seen_at : room.host_last_seen_at;
    const opponentDisconnected = !isFinished && Boolean(opponentLastSeen && Date.now() - new Date(opponentLastSeen).getTime() > 20_000);

    return (
      <main className="play-match-workspace relative flex h-dvh min-h-[42rem] flex-1 flex-col overflow-hidden bg-[color:var(--background)] px-3 py-3 xl:flex-row xl:pl-[14rem] xl:pr-4">
        {attackArrow ? <AttackArrowOverlay arrow={attackArrow} /> : null}
        {opponentDisconnected ? <div className="fixed left-1/2 top-3 z-[90] -translate-x-1/2 rounded-md border border-amber-400/50 bg-amber-950/95 px-4 py-2 text-sm font-bold text-amber-100 shadow-xl">{copy.opponentDisconnected}</div> : null}
        {error ? <button type="button" onClick={() => setError(null)} className="fixed left-1/2 top-14 z-[91] max-w-xl -translate-x-1/2 rounded-md border border-red-400/50 bg-red-950/95 px-4 py-2 text-sm font-bold text-red-100 shadow-xl">{error}</button> : null}
        <OpponentHandStrip cards={gameState.opponentZones.hand} locale={locale} />
        <section className="play-match-mobile-controls mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-2 xl:hidden">
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-[color:var(--text-primary)]">
              {isYourTurn ? controlsCopy.yourTurn : controlsCopy.botTurn}
            </p>
            <p className="mt-0.5 text-[0.65rem] font-bold text-[color:var(--text-secondary)]">
              {controlsCopy.you} {gameState.playerVictoryPoints} · {controlsCopy.bot} {gameState.opponentVictoryPoints}
            </p>
          </div>
          {!isSetup && !isFinished ? (
            <>
              <button type="button" disabled={isMatchActionPending} onClick={() => setIsConcedeDialogOpen(true)} className="rounded-md border border-red-500/45 bg-red-500/10 px-2.5 py-2 text-xs font-bold text-red-200 disabled:opacity-45">
                {controlsCopy.concede}
              </button>
              <button type="button" disabled={!isYourTurn || isMatchActionPending} onClick={() => void submitMatchAction('passTurn')} className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2.5 py-2 text-xs font-bold disabled:opacity-45">
                {controlsCopy.passTurn}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setIsConcedeDialogOpen(true)} className="col-span-2 rounded-md border border-[color:var(--border)] px-2.5 py-2 text-xs font-bold">
              {controlsCopy.backToLobby}
            </button>
          )}
        </section>
        <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-[13.5rem] flex-col gap-3 border-r border-[color:var(--border)] bg-[color:var(--surface)] p-3 xl:flex">
          <section className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2">
            <p className="truncate text-xs font-bold uppercase tracking-wide text-red-200">{match.players.opponent}</p>
          </section>
          <VictoryPointScoreControl label={controlsCopy.enemyVictoryPoints} value={gameState.opponentVictoryPoints} tone="opponent" />
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-black/10">
            <h2 className="border-b border-[color:var(--border)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[color:var(--text-primary)]">{boardCopy.actionLog}</h2>
            <ol className="deck-builder-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-xs text-[color:var(--text-secondary)]">
              <ActionLogList entries={gameState.log} locale={locale} />
            </ol>
          </section>
          <VictoryPointScoreControl label={controlsCopy.yourVictoryPoints} value={gameState.playerVictoryPoints} tone="player" />
          <section className="rounded-lg border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-2">
            <p className="truncate text-xs font-bold uppercase tracking-wide text-[color:var(--text-primary)]">{match.players.you}</p>
          </section>
          {!isSetup && !isFinished ? (
            <>
              <button type="button" disabled={isMatchActionPending} onClick={() => setIsConcedeDialogOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-500/45 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200 disabled:opacity-45">
                <Flag className="h-4 w-4" aria-hidden="true" />
                {controlsCopy.concede}
              </button>
              <button type="button" disabled={!isYourTurn || isMatchActionPending} onClick={() => void submitMatchAction('passTurn')} className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-3 text-sm font-bold disabled:opacity-45">
                <ChevronsRight className="h-4 w-4" aria-hidden="true" />
                {controlsCopy.passTurn}
              </button>
            </>
          ) : null}
          {isSetup ? (
            <button type="button" onClick={() => setIsConcedeDialogOpen(true)} className="rounded-md border border-[color:var(--border)] px-3 py-2 text-center text-sm font-bold">{controlsCopy.backToLobby}</button>
          ) : null}
        </aside>
        <div className="play-game-board grid min-h-[42rem] w-full grid-rows-[minmax(11.75rem,0.84fr)_minmax(8.75rem,0.66fr)_minmax(11.75rem,0.84fr)] gap-2 rounded-xl border border-[color:var(--accent)]/30 bg-[radial-gradient(circle_at_50%_43%,rgba(241,143,59,0.15),transparent_34%),linear-gradient(180deg,rgba(54,52,50,0.88),rgba(31,28,26,0.86))] p-2 shadow-[inset_0_1px_0_rgba(255,226,183,0.10),0_1rem_2rem_rgba(0,0,0,0.22)] xl:min-h-0">
          {isSetup ? (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-4">
              <div className="pointer-events-auto w-full max-w-xl rounded-xl border border-[color:var(--accent)]/55 bg-[color:var(--surface)]/95 p-5 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-bold text-[color:var(--text-primary)]">
                  {!match.you.openingHandConfirmed ? controlsCopy.openingHand : !match.you.startingSupplyPlaced ? controlsCopy.startingSupply : copy.roomWaiting}
                </p>
                {!match.you.openingHandConfirmed ? (
                  <div className="mt-4 flex justify-center gap-3">
                    <button type="button" disabled={isMatchActionPending} onClick={() => void submitMatchAction('keep')} className="rounded-md bg-[color:var(--text-primary)] px-5 py-3 text-sm font-bold text-[color:var(--background)] disabled:opacity-50">{controlsCopy.keepHand}</button>
                    <button type="button" disabled={isMatchActionPending} onClick={() => void submitMatchAction('mulligan')} className="rounded-md border border-[color:var(--border)] px-5 py-3 text-sm font-bold disabled:opacity-50">{controlsCopy.mulligan}</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {gameState.pendingCombat ? (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/55 px-4">
              <div className="w-full max-w-lg rounded-xl border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl">
                <h2 className="font-bold text-[color:var(--text-primary)]">{controlsCopy.counterWindow}</h2>
                {pendingCounter ? (
                  <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                    {pendingCounterTargets.map((target) => (
                      <ChoiceCardButton key={target.instanceId} card={target} onClick={() => { setPendingCounterSourceId(null); void submitMatchAction('playCounter', { instanceId: pendingCounter.instanceId, targetInstanceId: target.instanceId }); }} />
                    ))}
                    <button type="button" onClick={() => setPendingCounterSourceId(null)} className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">{controlsCopy.cancel}</button>
                  </div>
                ) : gameState.pendingCombat.priorityOwner === 'player' ? (
                  <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                    {playableCounters.map((counter) => (
                      <ChoiceCardButton key={counter.instanceId} card={counter} onClick={() => { const targets = getCounterTargetOptions(gameState, counter); if (targets.length > 0) setPendingCounterSourceId(counter.instanceId); else void submitMatchAction('playCounter', { instanceId: counter.instanceId }); }} />
                    ))}
                    <button type="button" onClick={() => void submitMatchAction('passCounter')} className="rounded-md bg-[color:var(--text-primary)] px-3 py-2 text-sm font-bold text-[color:var(--background)]">{controlsCopy.passCounter}</button>
                  </div>
                ) : <p className="mt-3 text-sm text-[color:var(--text-secondary)]">{copy.roomWaiting}</p>}
              </div>
            </div>
          ) : null}
          {gameState.pendingChoice ? (
            <div className="absolute inset-0 z-[65] flex items-center justify-center bg-black/60 px-4">
              <div className="w-full max-w-2xl rounded-xl border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl">
                <h2 className="font-bold text-[color:var(--text-primary)]">{'sourceName' in gameState.pendingChoice ? gameState.pendingChoice.sourceName : controlsCopy.setup}</h2>
                {'prompt' in gameState.pendingChoice ? <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{gameState.pendingChoice.prompt}</p> : null}
                <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                  {pendingChoiceTargets.map((target) => {
                    const selected = choiceSelectionIds.includes(target.instanceId);
                    return <ChoiceCardButton key={target.instanceId} card={target} selected={selected} hidden={isPrivateOpponentSupplyChoiceTarget(gameState, gameState.pendingChoice, target)} onClick={() => setChoiceSelectionIds((current) => current.includes(target.instanceId) ? current.filter((id) => id !== target.instanceId) : [...current, target.instanceId])} />;
                  })}
                  {pendingZoneIds.map((zone) => <button key={zone} type="button" onClick={() => setChoiceSelectionIds([zone])} className={`rounded-md border px-3 py-2 text-sm font-bold ${choiceSelectionIds.includes(zone) ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/20' : 'border-[color:var(--border)]'}`}>{zone}</button>)}
                </div>
                <button type="button" disabled={isMatchActionPending} onClick={() => { const selectedInstanceIds = choiceSelectionIds; setChoiceSelectionIds([]); void submitMatchAction('resolveChoice', { selectedInstanceIds }); }} className="mt-4 w-full rounded-md bg-[color:var(--text-primary)] px-4 py-3 text-sm font-bold text-[color:var(--background)] disabled:opacity-50">{controlsCopy.resolvesNext}</button>
              </div>
            </div>
          ) : null}
          {pendingAbilitySource ? (
            <div className="absolute inset-0 z-[66] flex items-center justify-center bg-black/60 px-4">
              <div className="w-full max-w-lg rounded-xl border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl">
                <h2 className="font-bold text-[color:var(--text-primary)]">{pendingAbilitySource.card.name}</h2>
                <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                  {pendingAbilityTargets.map((target) => <ChoiceCardButton key={target.instanceId} card={target} onClick={() => { setPendingAbilitySourceId(null); void submitMatchAction('activateAbility', { sourceInstanceId: pendingAbilitySource.instanceId, targetInstanceId: target.instanceId }); }} />)}
                  <button type="button" onClick={() => setPendingAbilitySourceId(null)} className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">{controlsCopy.cancel}</button>
                </div>
              </div>
            </div>
          ) : null}
          {pendingHandCost ? (
            <div className="absolute inset-0 z-[67] flex items-center justify-center bg-black/60 px-4">
              <div className="w-full max-w-lg rounded-xl border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl">
                <h2 className="font-bold text-[color:var(--text-primary)]">{pendingHandCostSource?.card.name}</h2>
                <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                  {pendingHandCostTargets.map((target) => <ChoiceCardButton key={target.instanceId} card={target} onClick={() => resolveHandCost(target.instanceId)} />)}
                  <button type="button" onClick={() => setPendingHandCost(null)} className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">{controlsCopy.cancel}</button>
                </div>
              </div>
            </div>
          ) : null}
          <CombinedStagingSupplyPanel stagingCards={gameState.opponentZones.staging} supplyCards={gameState.opponentZones.supply} graveyardCards={gameState.opponentZones.graveyard} banishCards={gameState.opponentZones.banish} deckCards={gameState.opponentZones.deck} temporarySupplyCount={gameState.opponentTemporarySupply} mirror disabled locale={locale} />
          <div className="play-game-battlefields grid min-h-0 gap-2 md:grid-cols-3">
            <BattlefieldPanel zone="battlefieldLeft" cards={gameState.zones.battlefieldLeft} onMove={boardMove} onAttack={attackBattlefield} onActivate={requestAbility} battlefieldCardsByZone={battlefieldCardsByZone} disabled={!canTakeTurnActions} locale={locale} />
            <BattlefieldPanel zone="battlefieldCenter" cards={gameState.zones.battlefieldCenter} onMove={boardMove} onAttack={attackBattlefield} onActivate={requestAbility} battlefieldCardsByZone={battlefieldCardsByZone} disabled={!canTakeTurnActions} locale={locale} />
            <BattlefieldPanel zone="battlefieldRight" cards={gameState.zones.battlefieldRight} onMove={boardMove} onAttack={attackBattlefield} onActivate={requestAbility} battlefieldCardsByZone={battlefieldCardsByZone} disabled={!canTakeTurnActions} locale={locale} />
          </div>
          <CombinedStagingSupplyPanel stagingCards={gameState.zones.staging} supplyCards={gameState.zones.supply} graveyardCards={gameState.zones.graveyard} banishCards={gameState.zones.banish} deckCards={gameState.zones.deck} temporarySupplyCount={gameState.playerTemporarySupply} canInspectSupplyCards onMove={boardMove} onAttack={attackBattlefield} onActivate={requestAbility} battlefieldCardsByZone={battlefieldCardsByZone} disabled={!canTakeTurnActions} locale={locale} />
        </div>
        <HandStrip cards={gameState.zones.hand} gameState={gameState} onMove={canChooseSupply ? setupMove : boardMove} disabled={isSetup ? !canChooseSupply : !canTakeTurnActions} canSupplyFromHand={canChooseSupply || (canTakeTurnActions && canManuallySupplyFromHand(gameState, 'player'))} canPlayFromHand={canTakeTurnActions} friendlyUnitsInPlay={getFriendlyUnitsInPlay(gameState, 'player')} graveyardCards={gameState.zones.graveyard} readySupplyCount={getReadySupplyCount(gameState, 'player')} stagingUnits={getStagingUnitCards(gameState.zones.staging, 'player')} demonicAdvanceActive={gameState.playerDemonicAdvanceActive} battlefieldCardsByZone={battlefieldCardsByZone} locale={locale} />
        {isConcedeDialogOpen ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="multiplayer-concede-title" className="w-full max-w-md rounded-lg border border-red-500/45 bg-[color:var(--surface)] p-5 shadow-2xl">
              <h2 id="multiplayer-concede-title" className="text-lg font-bold text-[color:var(--text-primary)]">{controlsCopy.concedeGame}</h2>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{controlsCopy.concedeDescription}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setIsConcedeDialogOpen(false)} className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-bold">{controlsCopy.cancel}</button>
                <button type="button" disabled={isMatchActionPending} onClick={() => { setIsConcedeDialogOpen(false); void submitMatchAction(isSetup ? 'leave' : 'concede'); }} className="rounded-md bg-red-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{isSetup ? controlsCopy.backToLobby : controlsCopy.concede}</button>
              </div>
            </div>
          </div>
        ) : null}
        {isFinished ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 px-4">
            <div className="w-full max-w-md rounded-xl border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-6 text-center shadow-2xl">
              <h2 className="text-2xl font-black text-[color:var(--text-primary)]">{gameState.winner === 'player' ? controlsCopy.youWon : controlsCopy.youLost}</h2>
              {matchEndingLogText ? <p className="mt-3 text-sm text-[color:var(--text-secondary)]">{translateGameLogText(locale, matchEndingLogText)}</p> : null}
              {isOpponentRematchRequested ? <p className="mt-4 rounded-md border border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10 px-3 py-2 text-sm font-bold text-[color:var(--text-primary)]">{copy.opponentRequestedRematch}</p> : null}
              {isRematchDeclined ? <p className="mt-4 rounded-md border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-100">{copy.opponentDeclinedRematch}</p> : null}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => void declineRematchAndReturn()} className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] px-5 py-3 text-sm font-bold">{controlsCopy.backToLobby}</button>
                <button type="button" disabled={isRematchRequested || isRematchDeclined} onClick={() => void requestRematch()} className="rounded-md bg-[color:var(--text-primary)] px-5 py-3 text-sm font-bold text-[color:var(--background)] disabled:opacity-60">{isRematchRequested ? copy.roomWaiting : controlsCopy.rematch}</button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-12">
      <section className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center shadow-xl">
        <Users className="mx-auto h-8 w-8 text-[color:var(--accent)]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-[color:var(--text-primary)]">{room?.status === 'playing' && match?.board?.revisionIndependentState.activeSeat === match?.seat ? controlsCopy.yourTurn : room?.status === 'playing' ? controlsCopy.setup : copy.roomLobby}</h1>
        {!room || room.status === 'waiting' ? (
          <>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">{copy.roomCode}</p>
            <p className="mt-2 font-mono text-4xl font-black tracking-[0.25em] text-[color:var(--accent)]">{roomCode}</p>
            {room ? <button type="button" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => { setIsInviteCopied(true); window.setTimeout(() => setIsInviteCopied(false), 2000); }); }} className="mt-4 rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-bold">{isInviteCopied ? copy.roomLinkCopied : copy.shareRoom}</button> : null}
          </>
        ) : null}
        {room ? <p className="mt-5 text-sm text-[color:var(--text-secondary)]">{room.status === 'waiting' ? copy.roomWaiting : room.status === 'finished' ? copy.roomCancelled : room.status === 'playing' ? controlsCopy.setup : copy.roomReady}</p> : null}
        {match && match.status === 'setup' ? (
          <div className="mt-8 border-t border-[color:var(--border)] pt-6">
            <p className="text-sm font-bold text-[color:var(--text-primary)]">
              {!match.you.openingHandConfirmed ? controlsCopy.openingHand : !match.you.startingSupplyPlaced ? controlsCopy.startingSupply : !match.opponent.startingSupplyPlaced ? copy.roomWaiting : controlsCopy.rollingFirst}
            </p>
            {!match.you.startingSupplyPlaced ? (
              <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {match.you.hand.map(({ instanceId, card }) => (
                  <button key={instanceId} type="button" disabled={isMatchActionPending || !match.you.openingHandConfirmed} onClick={() => void submitMatchAction('supply', { instanceId })} className="overflow-hidden rounded-md border border-[color:var(--border)] disabled:cursor-default">
                    <Image src={card.imageSrc} alt={card.name} width={160} height={224} className="h-auto w-full" />
                  </button>
                ))}
              </div>
            ) : null}
            {!match.you.openingHandConfirmed ? (
              <div className="mt-5 flex justify-center gap-3">
                <button disabled={isMatchActionPending} onClick={() => void submitMatchAction('keep')} className="rounded-md bg-[color:var(--text-primary)] px-5 py-3 text-sm font-bold text-[color:var(--background)]">{controlsCopy.keepHand}</button>
                <button disabled={isMatchActionPending} onClick={() => void submitMatchAction('mulligan')} className="rounded-md border border-[color:var(--border)] px-5 py-3 text-sm font-bold">{controlsCopy.mulligan}</button>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-5 text-sm text-red-400">{error}</p> : null}
        {room && !isParticipant && room.status === 'waiting' ? (
          <Link href={`/${locale}/play?room=${roomCode}`} className="mt-6 inline-flex rounded-md bg-[color:var(--text-primary)] px-5 py-3 text-sm font-bold text-[color:var(--background)]">{copy.joinRoom}</Link>
        ) : null}
        {room && role === 'host' && (room.status === 'waiting' || room.status === 'ready') ? (
          <button type="button" disabled={isCancelling} onClick={() => void cancelRoom()} className="mt-8 inline-flex rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-bold text-[color:var(--text-primary)] disabled:opacity-50">{controlsCopy.backToLobby}</button>
        ) : (
          <Link href={`/${locale}/play`} className="mt-8 inline-flex rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-bold text-[color:var(--text-primary)]">{controlsCopy.backToLobby}</Link>
        )}
      </section>
    </main>
  );
}

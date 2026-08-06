'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Bot, Check, ChevronDown, ChevronsRight, Flag, Play, RotateCcw, Sparkles, Swords, Users } from 'lucide-react';

import type { Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { getAffinityBaseColor, getAffinityIconPath, normalizeAffinity } from '@/lib/cards/affinity';
import { isConstructedDeckSize } from '@/lib/decks/rules';
import type { Card } from '../create/deck-builder/types';
import { getBotBattlefieldAttackChoice } from './bot-policy';
import { buildDemoDecks } from './demo-decks';
import { applyPlayerCardAction } from './game-actions';
import { BOT_TURN_STEPS, applyBotTurnStep, playFirstBotCounter } from './game-bot';
import {
  AttackArrowOverlay,
  BattlefieldPanel,
  CombatStatsBadge,
  CombinedStagingSupplyPanel,
  DamageBadge,
  HandStrip,
  type AttackArrowState,
} from './game-board-ui';
import {
  BATTLEFIELD_ZONES,
  BATTLEFIELD_ZONE_IDS,
  activateCardAbility,
  addLogEntry,
  advanceToNextTurn,
  buildInitialGameState,
  canManuallySupplyFromHand,
  createLogEntry,
  declareBattlefieldAttack,
  getCardController,
  getCounterPlayError,
  getCounterTargetOptions,
  getCurrentUnitAttack,
  getCurrentUnitHealth,
  getFriendlyUnitsInPlay,
  getModifiedPlayCost,
  getReadySupplyCount,
  getStagingUnitCards,
  getUnitsInPlay,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  passCounterPriority,
  playCounterCard,
  resolvePendingChoice,
  resolveOpeningHand,
  resolveBattlefieldAttack,
  rollFirstPlayer,
  shuffleCards,
  startGameAfterSetup,
  type GameCardInstance,
  type GameState,
  type PrivateZones,
  type SavedDeck,
  type ZoneId,
} from './game-rules';
import {
  BOT_POST_COMBAT_REVIEW_DELAY_MS,
  BOT_TURN_STEP_DELAY_MS,
  CARD_BACK_IMAGE_SRC,
  MATCH_SESSION_STORAGE_KEY,
  ZONE_LABELS,
  getCardActionCopy,
  getDefaultPendingChoiceSelectionIds,
  getPendingChoiceTargetCards,
  isPrivateOpponentSupplyChoiceTarget,
  mapDeckRows,
  shouldContinueBotTurnAfterResolvedAttack,
  type DeckRow,
  type MoveCardOptions,
} from './game-client-support';
import {
  ActionLogList,
  CardZoomPreview,
  VictoryPointScoreControl,
  OpponentHandStrip,
  RequiredActionToast,
} from './game-client-ui';
import { getPlayBoardCopy, getPlayControlsCopy, getPlayLobbyCopy } from './play-localization';
import { startCardMoveViewTransition } from './card-move-animation';
import { useCardExitAnimations } from './card-exit-animation';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'auth' | 'error';
type PlayMode = 'matchmaking' | 'lobby' | 'practice';
type PlayQueue = 'ranked' | 'casual';
type PendingHandPlayCost = {
  sourceInstanceId: string;
  costType: 'sacrifice' | 'discard' | 'reanimate';
};

type OpponentHandMove = {
  instanceId: string;
  destination: 'staging' | 'supply';
};

function getOpponentHandMove(previous: GameState, next: GameState): OpponentHandMove | null {
  for (const instance of previous.opponentZones.hand) {
    if (next.opponentZones.supply.some((candidate) => candidate.instanceId === instance.instanceId)) {
      return { instanceId: instance.instanceId, destination: 'supply' };
    }

    if (next.opponentZones.staging.some((candidate) => candidate.instanceId === instance.instanceId)) {
      return { instanceId: instance.instanceId, destination: 'staging' };
    }
  }

  return null;
}

export type GameClientProps = {
  locale: Locale;
  initialCards: Card[];
  initialError: string | null;
  initialMode?: 'lobby' | 'match';
};

type MatchSessionPayload = {
  deckId: string;
  botDeckId: string | null;
  mode?: 'practice' | 'multiplayer';
};

type GameRoom = {
  id: string;
  code: string;
  status: 'waiting' | 'ready' | 'playing' | 'finished';
  host_user_id: string;
  guest_user_id: string | null;
};

function getDeckBannerAffinities(deck: SavedDeck | null): string[] {
  const affinityCounts = new Map<string, number>();

  for (const entry of deck?.entries ?? []) {
    const affinity = normalizeAffinity(entry.card.affinity);
    if (!affinity) {
      continue;
    }

    affinityCounts.set(affinity, (affinityCounts.get(affinity) ?? 0) + entry.count);
  }

  const nonNeutralAffinities = Array.from(affinityCounts.entries()).filter(
    ([affinity]) => affinity.toLowerCase() !== 'neutral'
  );

  return (nonNeutralAffinities.length > 0 ? nonNeutralAffinities : Array.from(affinityCounts.entries()))
    .sort(([affinityA, countA], [affinityB, countB]) => countB - countA || affinityA.localeCompare(affinityB))
    .slice(0, 2)
    .map(([affinity]) => affinity);
}

function getDeckBannerBackground(affinities: string[]): string {
  if (affinities.length === 0) {
    return 'linear-gradient(110deg, rgba(241,143,59,0.18), rgba(44,180,120,0.14))';
  }

  if (affinities.length === 1) {
    const primaryColor = `color-mix(in srgb, ${getAffinityBaseColor(affinities[0])} 72%, black)`;
    return [
      'linear-gradient(110deg, rgba(255,255,255,0.12), transparent 42%, rgba(0,0,0,0.18))',
      `linear-gradient(135deg, color-mix(in srgb, ${primaryColor} 74%, black) 0%, ${primaryColor} 100%)`,
    ].join(', ');
  }

  const primaryColor = `color-mix(in srgb, ${getAffinityBaseColor(affinities[0])} 72%, black)`;
  const secondaryColor = `color-mix(in srgb, ${getAffinityBaseColor(affinities[1])} 72%, black)`;

  return [
    'linear-gradient(110deg, rgba(255,255,255,0.11), transparent 42%, rgba(0,0,0,0.18))',
    `linear-gradient(135deg, ${primaryColor} 0%, color-mix(in srgb, ${primaryColor} 68%, ${secondaryColor}) 38%, color-mix(in srgb, ${primaryColor} 50%, ${secondaryColor}) 50%, color-mix(in srgb, ${secondaryColor} 68%, ${primaryColor}) 62%, ${secondaryColor} 100%)`,
  ].join(', ');
}

function DeckAffinityIcons({ affinities }: { affinities: string[] }) {
  const visibleAffinities = affinities.filter((affinity) => affinity.toLowerCase() !== 'neutral');

  if (visibleAffinities.length === 0) {
    return <Swords className="h-4 w-4" aria-hidden="true" />;
  }

  return (
    <>
      {visibleAffinities.map((affinity) => {
        const iconPath = getAffinityIconPath(affinity);
        return iconPath ? (
          <Image
            key={affinity}
            src={iconPath}
            alt={`${affinity} affinity`}
            width={18}
            height={18}
            className="h-[18px] w-[18px] object-contain drop-shadow"
          />
        ) : null;
      })}
    </>
  );
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('a, button, input, select, textarea, [contenteditable="true"], [role="button"]'));
}

export function GameClient({ locale, initialCards, initialError, initialMode = 'lobby' }: GameClientProps) {
  const playCopy = getPlayBoardCopy(locale);
  const controlsCopy = getPlayControlsCopy(locale);
  const lobbyCopy = getPlayLobbyCopy(locale);
  const router = useRouter();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedMode, setSelectedMode] = useState<PlayMode>('practice');
  const [selectedQueue, setSelectedQueue] = useState<PlayQueue>('casual');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [selectedBotDeckId, setSelectedBotDeckId] = useState('');
  const [isPlayerDeckMenuOpen, setIsPlayerDeckMenuOpen] = useState(false);
  const [isBotDeckMenuOpen, setIsBotDeckMenuOpen] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  useCardExitAnimations(gameState);
  const [pendingAbilitySourceId, setPendingAbilitySourceId] = useState<string | null>(null);
  const [pendingCounterTargetSourceId, setPendingCounterTargetSourceId] = useState<string | null>(null);
  const [pendingHandPlayCost, setPendingHandPlayCost] = useState<PendingHandPlayCost | null>(null);
  const [pendingLucilleSacrificeIds, setPendingLucilleSacrificeIds] = useState<string[]>([]);
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);
  const [isPassTurnDialogOpen, setIsPassTurnDialogOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [attackArrow, setAttackArrow] = useState<AttackArrowState | null>(null);
  const [hoveredCounterPreviewCards, setHoveredCounterPreviewCards] = useState<GameCardInstance[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [matchSetupError, setMatchSetupError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isRoomRequestPending, setIsRoomRequestPending] = useState(false);
  const botTurnTimersRef = useRef<number[]>([]);
  const playerDeckMenuRef = useRef<HTMLDivElement | null>(null);
  const botDeckMenuRef = useRef<HTMLDivElement | null>(null);
  const cardMap = useMemo(() => new Map(initialCards.map((card) => [card.id, card])), [initialCards]);
  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );
  const selectedBotDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedBotDeckId) ?? null,
    [decks, selectedBotDeckId]
  );
  const selectedDeckBannerAffinities = useMemo(
    () => getDeckBannerAffinities(selectedDeck),
    [selectedDeck]
  );
  const selectedDeckBannerBackground = useMemo(
    () => getDeckBannerBackground(selectedDeckBannerAffinities),
    [selectedDeckBannerAffinities]
  );
  const selectedBotDeckBannerAffinities = useMemo(
    () => getDeckBannerAffinities(selectedBotDeck),
    [selectedBotDeck]
  );
  const selectedBotDeckBannerBackground = useMemo(
    () => getDeckBannerBackground(selectedBotDeckBannerAffinities),
    [selectedBotDeckBannerAffinities]
  );
  const demoDecks = useMemo(() => buildDemoDecks(cardMap), [cardMap]);
  const isMatchRoute = initialMode === 'match';
  const lobbyHref = `/${locale}/play`;
  const matchHref = `/${locale}/match`;
  const signInHref = `/${locale}/sign-in?redirect=${encodeURIComponent(isMatchRoute ? matchHref : lobbyHref)}`;
  const canPassTurn = Boolean(
    gameState &&
    !gameState.winner &&
    gameState.phase !== 'setup' &&
    gameState.activePlayer === 'player' &&
    !gameState.pendingCombat
  );

  useEffect(() => {
    if (!isPlayerDeckMenuOpen && !isBotDeckMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (playerDeckMenuRef.current?.contains(target) || botDeckMenuRef.current?.contains(target)) {
        return;
      }

      setIsPlayerDeckMenuOpen(false);
      setIsBotDeckMenuOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isBotDeckMenuOpen, isPlayerDeckMenuOpen]);

  function clearBotTurnTimers() {
    for (const timerId of botTurnTimersRef.current) {
      clearTimeout(timerId);
    }

    botTurnTimersRef.current = [];
  }

  function applyAutomaticBotStep(step: (typeof BOT_TURN_STEPS)[number]) {
    const previous = gameStateRef.current;
    if (!previous) {
      return;
    }

    const next = applyBotTurnStep(previous, step);
    if (next === previous) {
      return;
    }

    const commitState = () => {
      gameStateRef.current = next;
      setGameState(next);
    };
    const move = getOpponentHandMove(previous, next);

    if (move && typeof document !== 'undefined') {
      const source = document.querySelector(
        `[data-card-instance-id="${CSS.escape(move.instanceId)}"][data-card-zone="hand"][data-card-owner="opponent"]`
      );
      if (
        source instanceof HTMLElement &&
        startCardMoveViewTransition({
          source,
          destination: move.destination,
          update: () => flushSync(commitState),
          findTarget: () => {
            const target = document.querySelector(
              `[data-card-instance-id="${CSS.escape(move.instanceId)}"][data-card-zone="${move.destination}"][data-card-owner="opponent"]`
            );
            return target instanceof HTMLElement ? target : null;
          },
        })
      ) {
        return;
      }
    }

    commitState();
  }

  function scheduleBotTimer(callback: () => void, delayMs: number) {
    const timerId = window.setTimeout(() => {
      callback();
      botTurnTimersRef.current = botTurnTimersRef.current.filter((currentTimerId) => currentTimerId !== timerId);
    }, delayMs);

    botTurnTimersRef.current.push(timerId);
  }

  function getElementCenter(element: Element): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function showAttackArrow(attackerInstanceId: string, targetZone: ZoneId, state: GameState): number | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return null;
    }

    const attackerElement = document.querySelector(`[data-card-instance-id="${CSS.escape(attackerInstanceId)}"]`);
    const defender = state.zones[targetZone]?.find((instance) => isUnitCard(instance.card) && instance.instanceId !== attackerInstanceId) ?? null;
    const targetElement = defender
      ? document.querySelector(`[data-card-instance-id="${CSS.escape(defender.instanceId)}"]`)
      : document.querySelector(`[data-battlefield-zone="${CSS.escape(targetZone)}"]`);

    if (!attackerElement || !targetElement) {
      return null;
    }

    const arrowId = Date.now();
    setAttackArrow({
      id: arrowId,
      from: getElementCenter(attackerElement),
      to: getElementCenter(targetElement),
    });

    return arrowId;
  }

  function clearAttackArrow(arrowId: number | null) {
    if (arrowId === null) {
      return;
    }

    setAttackArrow((current) => (current?.id === arrowId ? null : current));
  }

  function scheduleBotTurnAdvance(delayMs = BOT_POST_COMBAT_REVIEW_DELAY_MS) {
    scheduleBotTimer(() => {
      setGameState((previous) => {
        if (!previous || previous.phase !== 'main' || previous.activePlayer !== 'opponent' || previous.pendingCombat || previous.pendingChoice) {
          return previous;
        }

        return advanceToNextTurn(previous);
      });
    }, delayMs);
  }

  function scheduleBotAttackOrAdvance(delayMs = BOT_TURN_STEP_DELAY_MS) {
    scheduleBotTimer(() => {
      setGameState((previous) => {
        if (!previous || previous.phase !== 'main' || previous.activePlayer !== 'opponent' || previous.pendingCombat || previous.pendingChoice) {
          return previous;
        }

        const choice = getBotBattlefieldAttackChoice(previous);

        if (!choice) {
          scheduleBotTurnAdvance();
          return previous;
        }

        const arrowId = showAttackArrow(choice.attackerInstanceId, choice.targetZone, previous);
        scheduleBotTimer(() => {
          setGameState((current) => {
            if (!current || current.phase !== 'main' || current.activePlayer !== 'opponent' || current.pendingCombat || current.pendingChoice) {
              return current;
            }

            const nextState = applyBotTurnStep(current, 'attackBattlefield');

            if (!nextState.pendingCombat) {
              clearAttackArrow(arrowId);
              if (shouldContinueBotTurnAfterResolvedAttack(nextState)) {
                scheduleBotAttackOrAdvance(BOT_POST_COMBAT_REVIEW_DELAY_MS);
              }
            }

            return nextState;
          });
        }, 700);

        return previous;
      });
    }, delayMs);
  }

  function playAutomaticBotTurn(botTurnState: GameState) {
    clearBotTurnTimers();
    gameStateRef.current = botTurnState;
    setGameState(botTurnState);

    const setupSteps = BOT_TURN_STEPS.filter((step) => step !== 'attackBattlefield');

    for (const [index, step] of setupSteps.entries()) {
      scheduleBotTimer(() => {
        applyAutomaticBotStep(step);
      }, BOT_TURN_STEP_DELAY_MS * (index + 1));
    }

    scheduleBotAttackOrAdvance(BOT_TURN_STEP_DELAY_MS * (setupSteps.length + 1));
  }

  useEffect(() => clearBotTurnTimers, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (gameState?.winner) {
      clearBotTurnTimers();
      setAttackArrow(null);
      setIsPassTurnDialogOpen(false);
      setHoveredCounterPreviewCards(null);
      setPendingHandPlayCost(null);
    }
  }, [gameState?.winner]);

  useEffect(() => {
    if (!gameState?.pendingCombat) {
      setHoveredCounterPreviewCards(null);
    }
  }, [gameState?.pendingCombat]);

  useEffect(() => {
    setPendingLucilleSacrificeIds(getDefaultPendingChoiceSelectionIds(gameState?.pendingChoice ?? null));
  }, [gameState?.pendingChoice]);

  useEffect(() => {
    if (
      !gameState ||
      gameState.winner ||
      gameState.phase !== 'main' ||
      gameState.activePlayer !== 'opponent' ||
      Boolean(gameState.pendingCombat) ||
      Boolean(gameState.pendingChoice) ||
      botTurnTimersRef.current.length > 0
    ) {
      return;
    }

    playAutomaticBotTurn(gameState);
  }, [gameState]);

  useEffect(() => {
    if (!gameState?.pendingCombat || gameState.pendingCombat.priorityOwner !== 'opponent') {
      return;
    }

    const timerId = window.setTimeout(() => {
      setGameState((previous) => {
        if (!previous?.pendingCombat || previous.pendingCombat.priorityOwner !== 'opponent') {
          return previous;
        }

        const counterState = playFirstBotCounter(previous);

        if (counterState) {
          return counterState;
        }

        const result = passCounterPriority(previous, 'opponent');

        if ('error' in result) {
          return {
            ...previous,
            log: addLogEntry(previous, { suffix: result.error }),
          };
        }

        if (result.resolvedCombat) {
          setAttackArrow(null);
          if (result.state.activePlayer === 'opponent') {
            scheduleBotAttackOrAdvance(BOT_POST_COMBAT_REVIEW_DELAY_MS);
          }
          return result.state;
        }

        return result.state;
      });
    }, 600);

    return () => window.clearTimeout(timerId);
  }, [gameState?.pendingCombat]);

  useEffect(() => {
    if (!isMatchRoute) {
      return;
    }

    document.body.classList.add('simulator-route-active');

    return () => {
      document.body.classList.remove('simulator-route-active');
    };
  }, [isMatchRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const invitedRoomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
    if (/^[A-Z0-9]{6}$/.test(invitedRoomCode)) {
      setSelectedMode('lobby');
      setRoomCode(invitedRoomCode);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDecks() {
      setStatus('loading');
      setErrorMessage(initialError);

      const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      if (sessionError || !sessionResult.session?.user) {
        setCurrentUserId(null);
        setDecks(demoDecks);
        setSelectedDeckId((previous) => previous || demoDecks[0]?.id || '');
        setSelectedBotDeckId((previous) => previous || demoDecks[1]?.id || demoDecks[0]?.id || '');
        setStatus('ready');
        return;
      }

      setCurrentUserId(sessionResult.session.user.id);

      const { data, error } = await supabase
        .from('decks')
        .select('id,title,created_at,deck_cards(quantity,card_id)')
        .eq('user_id', sessionResult.session.user.id)
        .order('created_at', { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Failed to load simulator decks', error);
        setErrorMessage(error.message);
        setStatus('error');
        setDecks([]);
        return;
      }

      const mappedDecks = mapDeckRows((data ?? []) as DeckRow[], cardMap).filter((deck) =>
        isConstructedDeckSize(deck.cardCount)
      );
      const availableDecks = mappedDecks.length > 0 ? [...mappedDecks, ...demoDecks] : demoDecks;
      setDecks(availableDecks);
      setSelectedDeckId((previous) => previous || availableDecks[0]?.id || '');
      setSelectedBotDeckId((previous) => previous || availableDecks[1]?.id || availableDecks[0]?.id || '');
      setStatus('ready');
    }

    void loadDecks();

    return () => {
      isMounted = false;
    };
  }, [cardMap, demoDecks, initialError]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`game-room-${room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${room.id}` }, (payload) => {
        setRoom(payload.new as GameRoom);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [room?.id]);

  async function submitRoomRequest(kind: 'create' | 'join') {
    if (!selectedDeck || !currentUserId) return;
    setIsRoomRequestPending(true);
    setRoomError(null);
    const { data: sessionResult } = await supabase.auth.getSession();
    const token = sessionResult.session?.access_token;
    if (!token) {
      setRoomError(lobbyCopy.signInPrompt);
      setIsRoomRequestPending(false);
      return;
    }
    try {
      const response = await fetch(kind === 'create' ? '/api/rooms' : '/api/rooms/join', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ deckId: selectedDeck.id, ...(kind === 'join' ? { code: roomCode } : {}) }),
      });
      const payload = await response.json() as { room?: GameRoom; message?: string };
      if (!response.ok || !payload.room) throw new Error(payload.message || lobbyCopy.roomRequestFailed);
      setRoom(payload.room);
      setRoomCode(payload.room.code);
      router.push(`/${locale}/match/${payload.room.code}`);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : lobbyCopy.roomRequestFailed);
    } finally {
      setIsRoomRequestPending(false);
    }
  }

  useEffect(() => {
    if (!isMatchRoute || status !== 'ready' || gameState) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const storedPayload = window.sessionStorage.getItem(MATCH_SESSION_STORAGE_KEY);
    if (!storedPayload) {
      setMatchSetupError(lobbyCopy.pickSavedDeckForPractice);
      return;
    }

    let payload: MatchSessionPayload;
    try {
      payload = JSON.parse(storedPayload) as MatchSessionPayload;
    } catch {
      window.sessionStorage.removeItem(MATCH_SESSION_STORAGE_KEY);
      setMatchSetupError(lobbyCopy.openMatchRoom);
      return;
    }

    const matchDeck = decks.find((deck) => deck.id === payload.deckId) ?? null;
    const matchBotDeck = payload.botDeckId ? decks.find((deck) => deck.id === payload.botDeckId) ?? null : null;

    if (!matchDeck || !matchBotDeck) {
      setMatchSetupError(lobbyCopy.noSavedDecks);
      return;
    }

    setSelectedMode('practice');
    setSelectedDeckId(matchDeck.id);
    setSelectedBotDeckId(matchBotDeck.id);
    setMatchSetupError(null);
    setGameState(buildInitialGameState(matchDeck, matchBotDeck, payload.mode ?? 'practice'));
  }, [decks, gameState, isMatchRoute, lobbyCopy.noSavedDecks, lobbyCopy.openMatchRoom, lobbyCopy.pickSavedDeckForPractice, status]);

  function startSelectedDeck() {
    if (!selectedDeck || !selectedBotDeck || selectedMode !== 'practice') {
      return;
    }

    if (isMatchRoute) {
      setPendingAbilitySourceId(null);
      setGameState(buildInitialGameState(selectedDeck, selectedBotDeck, 'practice'));
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        MATCH_SESSION_STORAGE_KEY,
        JSON.stringify({ deckId: selectedDeck.id, botDeckId: selectedBotDeck.id, mode: 'practice' } satisfies MatchSessionPayload)
      );
    }

    router.push(matchHref);
  }

  function returnToLobby() {
    clearBotTurnTimers();
    setIsConcedeDialogOpen(false);
    setIsPassTurnDialogOpen(false);
    setPendingAbilitySourceId(null);
    setGameState(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(MATCH_SESSION_STORAGE_KEY);
    }
    if (isMatchRoute) {
      router.push(lobbyHref);
    }
  }

  function confirmConcede() {
    returnToLobby();
  }

  const requestPassTurn = useCallback(() => {
    if (!canPassTurn) {
      return;
    }

    setIsPassTurnDialogOpen(true);
  }, [canPassTurn]);

  useEffect(() => {
    if (!canPassTurn || isConcedeDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat || isInteractiveShortcutTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (isPassTurnDialogOpen) {
        confirmPassTurn();
      } else {
        requestPassTurn();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canPassTurn, isConcedeDialogOpen, isPassTurnDialogOpen, requestPassTurn]);

  function confirmPassTurn() {
    if (!canPassTurn || !gameState) {
      setIsPassTurnDialogOpen(false);
      return;
    }

    setIsPassTurnDialogOpen(false);
    const botTurnState = advanceToNextTurn(gameState);

    if (botTurnState.activePlayer === 'opponent') {
      playAutomaticBotTurn(botTurnState);
      return;
    }

    setGameState(botTurnState);
  }

  function moveCard(instanceId: string, fromZone: ZoneId, toZone: ZoneId, options: MoveCardOptions = {}) {
    if (fromZone === 'hand' && toZone === 'staging' && gameState) {
      const handCard = gameState.zones.hand.find((instance) => instance.instanceId === instanceId) ?? null;

      if (handCard?.card.id === 'IMP004' && !options.sacrificeUnitInstanceId) {
        setPendingHandPlayCost({ sourceInstanceId: instanceId, costType: 'sacrifice' });
        return;
      }

      if (handCard?.card.id === 'IMP005' && !options.discardCardInstanceId) {
        setPendingHandPlayCost({ sourceInstanceId: instanceId, costType: 'discard' });
        return;
      }

      if (handCard?.card.id === 'IMP006' && !options.reanimateTargetInstanceId) {
        setPendingHandPlayCost({ sourceInstanceId: instanceId, costType: 'reanimate' });
        return;
      }
    }

    const applyMove = () => {
      setGameState((previous) => {
        if (!previous) {
          return previous;
        }

        const setupFirstPlayer =
          fromZone === 'hand' &&
          toZone === 'supply' &&
          !previous.playerStartingSupplyPlaced &&
          previous.sessionMode === 'multiplayer'
            ? rollFirstPlayer()
            : undefined;

        return applyPlayerCardAction(previous, {
          instanceId,
          fromZone,
          toZone,
          options: {
            ...options,
            setupFirstPlayer,
          },
        }).state;
      });
    };

    if (
      gameState &&
      fromZone === 'hand' &&
      (toZone === 'supply' || toZone === 'staging') &&
      typeof document !== 'undefined'
    ) {
      const source = document.querySelector(
        `[data-card-instance-id="${CSS.escape(instanceId)}"][data-card-zone="hand"]`
      );
      if (
        source instanceof HTMLElement &&
        startCardMoveViewTransition({
          source,
          destination: toZone,
          update: () => flushSync(applyMove),
          findTarget: () => {
            const target = document.querySelector(
              `[data-card-instance-id="${CSS.escape(instanceId)}"][data-card-zone="${toZone}"]`
            );
            return target instanceof HTMLElement ? target : null;
          },
        })
      ) {
        return;
      }
    }

    applyMove();
  }

  function resolvePendingHandPlayCost(targetInstanceId: string) {
    const pending = pendingHandPlayCost;

    if (!pending) {
      return;
    }

    moveCard(
      pending.sourceInstanceId,
      'hand',
      'staging',
      pending.costType === 'sacrifice'
        ? { sacrificeUnitInstanceId: targetInstanceId }
        : pending.costType === 'discard'
          ? { discardCardInstanceId: targetInstanceId }
          : { reanimateTargetInstanceId: targetInstanceId }
    );
    setPendingHandPlayCost(null);
  }

  function togglePendingLucilleSacrifice(instanceId: string) {
    setPendingLucilleSacrificeIds((current) =>
      current.includes(instanceId) ? current.filter((entry) => entry !== instanceId) : [...current, instanceId]
    );
  }

  function confirmPendingLucilleChoice(selectNone = false) {
    let nextResolvedState: GameState | null = null;

    setGameState((previous) => {
      if (!previous) {
        return previous;
      }

      const selectedIds =
        !selectNone &&
        previous.pendingChoice?.kind === 'caelumTarget' &&
        previous.pendingChoice.effect === 'airdrop'
          ? previous.pendingChoice.availableInstanceIds.slice(0, 1)
          : pendingLucilleSacrificeIds;
      const result = resolvePendingChoice(previous, selectNone ? [] : selectedIds);

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      nextResolvedState = result;
      return result;
    });

    setPendingLucilleSacrificeIds([]);

    const resolvedState = nextResolvedState as GameState | null;

    if (resolvedState?.activePlayer === 'opponent' && !resolvedState.pendingChoice) {
      playAutomaticBotTurn(resolvedState);
    }
  }

  function confirmPendingZoneChoice(zoneId: ZoneId) {
    let nextResolvedState: GameState | null = null;

    setGameState((previous) => {
      if (!previous) {
        return previous;
      }

      const result = resolvePendingChoice(previous, [zoneId]);

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      nextResolvedState = result;
      return result;
    });

    const resolvedState = nextResolvedState as GameState | null;

    if (resolvedState?.activePlayer === 'opponent' && !resolvedState.pendingChoice) {
      playAutomaticBotTurn(resolvedState);
    }
  }

  function requestAbilityActivation(source: GameCardInstance) {
    if (source.card.id === 'IMP160') {
      activateAbilityWithTarget(source.instanceId, source.instanceId);
      return;
    }
    setPendingAbilitySourceId(source.instanceId);
  }

  function activateAbilityWithTarget(targetInstanceId: string, sourceInstanceIdOverride?: string) {
    const sourceInstanceId = sourceInstanceIdOverride ?? pendingAbilitySourceId;

    if (!sourceInstanceId) {
      return;
    }

    setGameState((previous) => {
      if (!previous) {
        return previous;
      }

      const result = activateCardAbility(previous, 'player', sourceInstanceId, targetInstanceId);

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      return result.state;
    });
    setPendingAbilitySourceId(null);
  }

  function attackBattlefield(attackerInstanceId: string, targetZone: ZoneId) {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      const defender = previous.zones[targetZone].find((instance) => isUnitCard(instance.card) && getCardController(instance) !== 'player') ?? null;
      const arrowId = showAttackArrow(attackerInstanceId, targetZone, previous);

      if (!defender) {
        window.setTimeout(() => {
          setGameState((current) => {
            if (!current) {
              return current;
            }

            const nextResult = resolveBattlefieldAttack(current, 'player', attackerInstanceId, targetZone);

            if ('error' in nextResult) {
              return {
                ...current,
                log: addLogEntry(current, { suffix: nextResult.error }),
              };
            }

            return nextResult.state;
          });
          clearAttackArrow(arrowId);
        }, 700);

        return previous;
      }

      const result = declareBattlefieldAttack(previous, 'player', attackerInstanceId, targetZone);

      if ('error' in result) {
        clearAttackArrow(arrowId);
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      return result.state;
    });
  }

  function passPlayerCounterPriority() {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      const result = passCounterPriority(previous, 'player');

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      if (result.resolvedCombat) {
        setAttackArrow(null);
        if (result.state.activePlayer === 'opponent') {
          scheduleBotAttackOrAdvance(BOT_POST_COMBAT_REVIEW_DELAY_MS);
        }
        return result.state;
      }

      return result.state;
    });
  }

  function playPlayerCounter(instanceId: string, targetInstanceId?: string) {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      const result = playCounterCard(previous, 'player', instanceId, targetInstanceId ? { targetInstanceId } : undefined);

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      return result.state;
    });
    setPendingCounterTargetSourceId(null);
  }

  function requestPlayerCounter(instance: GameCardInstance) {
    if (!gameState) {
      return;
    }

    if (getCounterTargetOptions(gameState, instance).length > 0) {
      setPendingCounterTargetSourceId(instance.instanceId);
      return;
    }

    playPlayerCounter(instance.instanceId);
  }

  function shuffleLibrary() {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      return {
        ...previous,
        zones: {
          ...previous.zones,
          deck: shuffleCards(previous.zones.deck),
        },
        log: addLogEntry(previous, { suffix: 'Shuffled deck.' }),
      };
    });
  }

  function chooseFirstPlayer(firstPlayer: 'player' | 'opponent') {
    if (!gameState || gameState.phase !== 'setup' || !gameState.playerStartingSupplyPlaced) {
      return;
    }

    const startedState = startGameAfterSetup(gameState, firstPlayer);

    if (startedState.activePlayer === 'opponent') {
      playAutomaticBotTurn(startedState);
      return;
    }

    setGameState(startedState);
  }

  function chooseOpeningHand(mulligan: boolean) {
    setGameState((previous) => previous ? resolveOpeningHand(previous, mulligan) : previous);
  }

  function resetGame() {
    if (selectedDeck) {
      clearBotTurnTimers();
      setPendingAbilitySourceId(null);
      setGameState(buildInitialGameState(selectedDeck, selectedBotDeck));
    }
  }

  const content = (() => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-secondary)]">
          {lobbyCopy.loadingDecks}
        </div>
      );
    }

    if (status === 'auth') {
      return (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{lobbyCopy.signInPrompt}</p>
          <Link
            href={signInHref}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {lobbyCopy.signIn}
          </Link>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          {errorMessage ?? lobbyCopy.unableToLoadDecks}
        </div>
      );
    }

    if (decks.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{lobbyCopy.saveDeckPrompt}</p>
          <Link
            href={`/${locale}/create`}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {lobbyCopy.buildDeck}
          </Link>
        </div>
      );
    }

    if (isMatchRoute && matchSetupError) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{matchSetupError}</p>
          <Link
            href={lobbyHref}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {controlsCopy.backToLobby}
          </Link>
        </div>
      );
    }

    if (isMatchRoute && !gameState) {
      return (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-secondary)]">
          {lobbyCopy.openMatchRoom}
        </div>
      );
    }

    if (!gameState) {
      return (
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center py-2">
          <section className="play-lobby-shell relative overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/25">
            <div className="play-lobby-header relative border-b border-[color:var(--border)] px-6 py-4 sm:px-7">
              <div className="relative z-10 max-w-2xl">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[color:var(--accent)]">
                  {playCopy.setup}
                </p>
                <h1 className="mt-1 font-serif text-3xl font-semibold text-[color:var(--text-primary)]">
                  {lobbyCopy.battlefield}
                </h1>
                <p className="mt-1 text-sm leading-5 text-[color:var(--text-secondary)]">
                  {lobbyCopy.setupDescription}
                </p>
              </div>
              <Swords className="play-lobby-header-mark" aria-hidden="true" />
            </div>
            <div className="relative flex flex-col gap-4 p-4 sm:p-5">
              <div
                className="relative flex flex-col gap-3 overflow-hidden border border-white/15 px-5 py-3.5 shadow-inner shadow-white/5 sm:flex-row sm:items-center sm:justify-between"
                style={{ background: selectedDeckBannerBackground }}
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-[color:var(--accent)]" aria-hidden="true" />
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-white/15 bg-black/25 px-1.5 text-white shadow-inner">
                    <DeckAffinityIcons affinities={selectedDeckBannerAffinities} />
                  </span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-white/65">
                      {lobbyCopy.yourDeck}
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-base font-bold text-[color:var(--text-primary)]">
                        {selectedDeck?.title?.trim() || lobbyCopy.untitledDeck}
                      </h2>
                      <div ref={playerDeckMenuRef} className="relative">
                      <button
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={isPlayerDeckMenuOpen}
                        onClick={() => {
                          setIsPlayerDeckMenuOpen((isOpen) => !isOpen);
                          setIsBotDeckMenuOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(241,143,59,0.35),rgba(255,255,255,0.08))] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[color:var(--text-primary)] shadow-lg shadow-black/20 transition hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/20 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                      >
                        {lobbyCopy.change}
                        <ChevronDown className={`h-3.5 w-3.5 transition ${isPlayerDeckMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {isPlayerDeckMenuOpen ? (
                        <div className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/40">
                          <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(241,143,59,0.18),rgba(44,180,120,0.12))] px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                            <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-hidden="true" />
                            {lobbyCopy.chooseYourDeck}
                          </div>
                          <div role="listbox" aria-label={lobbyCopy.chooseYourDeck} className="deck-builder-scroll max-h-72 overflow-y-auto p-2">
                            {decks.length > 0 ? (
                              decks.map((deck) => {
                                const isSelected = deck.id === selectedDeckId;
                                return (
                                  <button
                                    key={deck.id}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                      setSelectedDeckId(deck.id);
                                      setIsPlayerDeckMenuOpen(false);
                                    }}
                                    className={`group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                                      isSelected
                                        ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/20'
                                        : 'border-transparent hover:border-[color:var(--accent)]/50 hover:bg-[color:var(--surface-muted)]/60'
                                    }`}
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-bold text-[color:var(--text-primary)]">
                                        {deck.title?.trim() || lobbyCopy.untitledDeck}
                                      </span>
                                      <span className="mt-0.5 block text-xs font-semibold text-[color:var(--text-secondary)]">
                                        {lobbyCopy.cardCount(deck.cardCount)}
                                      </span>
                                    </span>
                                    {isSelected ? (
                                      <Check className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden="true" />
                                    ) : (
                                      <span className="shrink-0 rounded-full border border-[color:var(--border)] bg-black/20 px-2 py-0.5 text-[0.65rem] font-bold text-[color:var(--text-secondary)] transition group-hover:text-[color:var(--text-primary)]">
                                        {deck.cardCount}
                                      </span>
                                    )}
                                  </button>
                                );
                              })
                            ) : (
                              <div className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-4 text-sm font-semibold text-[color:var(--text-secondary)]">
                                {lobbyCopy.noSavedDecks}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <span className="rounded-full border border-[color:var(--border)] bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--text-primary)]">
                  {lobbyCopy.cardCount(selectedDeck?.cardCount ?? 0)}
                </span>
              </div>

              <div className="border border-[color:var(--border)] bg-black/20 p-1.5" role="tablist" aria-label={playCopy.setup}>
                <div className="grid gap-1.5 sm:grid-cols-3">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === 'matchmaking'}
                  onClick={() => setSelectedMode('matchmaking')}
                  className={`inline-flex items-center justify-center gap-2 border px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    selectedMode === 'matchmaking'
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/18 text-[color:var(--text-primary)]'
                      : 'border-transparent text-[color:var(--text-secondary)] hover:border-white/10 hover:bg-white/5 hover:text-[color:var(--text-primary)]'
                  }`}
                >
                  <Swords className="h-4 w-4" aria-hidden="true" />
                  {lobbyCopy.matchmaking}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === 'lobby'}
                  onClick={() => setSelectedMode('lobby')}
                  className={`inline-flex items-center justify-center gap-2 border px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    selectedMode === 'lobby'
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/18 text-[color:var(--text-primary)]'
                      : 'border-transparent text-[color:var(--text-secondary)] hover:border-white/10 hover:bg-white/5 hover:text-[color:var(--text-primary)]'
                  }`}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  {controlsCopy.lobby}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === 'practice'}
                  onClick={() => setSelectedMode('practice')}
                  className={`inline-flex items-center justify-center gap-2 border px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    selectedMode === 'practice'
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/18 text-[color:var(--text-primary)]'
                      : 'border-transparent text-[color:var(--text-secondary)] hover:border-white/10 hover:bg-white/5 hover:text-[color:var(--text-primary)]'
                  }`}
                >
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  {lobbyCopy.practice}
                </button>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex flex-col gap-4">
                  {selectedMode === 'matchmaking' ? (
                    <>
                      <div className="rounded-full border border-[color:var(--border)] bg-black/15 p-1">
                        <div className="grid grid-cols-2 gap-1">
                          {(['ranked', 'casual'] as PlayQueue[]).map((queue) => (
                            <button
                              key={queue}
                              type="button"
                              onClick={() => setSelectedQueue(queue)}
                              className={`rounded-full px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                                selectedQueue === queue
                                  ? 'bg-[color:var(--text-primary)] text-[color:var(--background)]'
                                  : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                              }`}
                            >
                              {queue === 'ranked' ? lobbyCopy.ranked : lobbyCopy.casual}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex min-h-40 items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 px-6 py-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]">
                            <Users className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                              {lobbyCopy.matchmakingTitle(selectedQueue === 'ranked' ? lobbyCopy.ranked : lobbyCopy.casual)}
                            </h2>
                            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                              {lobbyCopy.multiplayerComingSoon}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : selectedMode === 'practice' ? (
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
                      <div className="play-mode-brief flex min-h-44 items-center border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 px-7 py-6">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--accent)]/15 text-[color:var(--accent)]">
                            <Bot className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">{lobbyCopy.practiceVsBot}</h2>
                            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{lobbyCopy.chooseBotDeckDescription}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border border-[color:var(--border)] bg-black/15 p-4">
                        <h2 id="simulator-bot-deck-label" className="text-sm font-bold uppercase tracking-wide text-[color:var(--text-primary)]">
                          {lobbyCopy.botDeck}
                        </h2>
                        <div ref={botDeckMenuRef} className="relative mt-4">
                          <button
                            id="simulator-bot-deck"
                            type="button"
                            aria-labelledby="simulator-bot-deck-label simulator-bot-deck"
                            aria-haspopup="listbox"
                            aria-expanded={isBotDeckMenuOpen}
                            onClick={() => {
                              setIsBotDeckMenuOpen((isOpen) => !isOpen);
                              setIsPlayerDeckMenuOpen(false);
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/15 px-3 py-3 text-left text-white shadow-xl shadow-black/25 transition hover:border-white/35 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                            style={{
                              background: selectedBotDeck
                                ? selectedBotDeckBannerBackground
                                : 'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(241,143,59,0.14))',
                            }}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-white/15 bg-black/25 px-1.5 text-white shadow-inner">
                                {selectedBotDeck ? <DeckAffinityIcons affinities={selectedBotDeckBannerAffinities} /> : <Bot className="h-4 w-4" aria-hidden="true" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-bold">{selectedBotDeck?.title?.trim() || lobbyCopy.chooseBotDeck}</span>
                                <span className="mt-0.5 block text-xs font-semibold text-white/78">
                                  {selectedBotDeck ? lobbyCopy.cardCount(selectedBotDeck.cardCount) : lobbyCopy.pickSavedDeckForPractice}
                                </span>
                              </span>
                            </span>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-white/85 transition ${isBotDeckMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                          </button>
                          {isBotDeckMenuOpen ? (
                            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/40">
                              <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(44,180,120,0.16),rgba(241,143,59,0.14))] px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
                                <Bot className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-hidden="true" />
                                {lobbyCopy.botOpponent}
                              </div>
                              <div role="listbox" aria-label={lobbyCopy.botDeck} className="deck-builder-scroll max-h-72 overflow-y-auto p-2">
                                {decks.length > 0 ? (
                                  decks.map((deck) => {
                                    const isSelected = deck.id === selectedBotDeckId;
                                    return (
                                      <button
                                        key={deck.id}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => {
                                          setSelectedBotDeckId(deck.id);
                                          setIsBotDeckMenuOpen(false);
                                        }}
                                        className={`group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                                          isSelected
                                            ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/20'
                                            : 'border-transparent hover:border-[color:var(--accent)]/50 hover:bg-[color:var(--surface-muted)]/60'
                                        }`}
                                      >
                                        <span className="min-w-0">
                                          <span className="block truncate text-sm font-bold text-[color:var(--text-primary)]">
                                            {deck.title?.trim() || lobbyCopy.untitledDeck}
                                          </span>
                                          <span className="mt-0.5 block text-xs font-semibold text-[color:var(--text-secondary)]">
                                            {lobbyCopy.cardCount(deck.cardCount)}
                                          </span>
                                        </span>
                                        {isSelected ? (
                                          <Check className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden="true" />
                                        ) : (
                                          <span className="shrink-0 rounded-full border border-[color:var(--border)] bg-black/20 px-2 py-0.5 text-[0.65rem] font-bold text-[color:var(--text-secondary)] transition group-hover:text-[color:var(--text-primary)]">
                                            {deck.cardCount}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-4 text-sm font-semibold text-[color:var(--text-secondary)]">
                                    {lobbyCopy.noSavedDecks}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-4 border-t border-[color:var(--border)] pt-4">
                          <label
                            htmlFor="simulator-bot-difficulty"
                            className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]"
                          >
                            {lobbyCopy.botDifficulty}
                          </label>
                          <div className="relative mt-2">
                            <Sparkles
                              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--accent)]"
                              aria-hidden="true"
                            />
                            <select
                              id="simulator-bot-difficulty"
                              defaultValue="standard"
                              className="w-full appearance-none rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-10 pr-9 text-sm font-semibold text-[color:var(--text-primary)] shadow-inner focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                            >
                              <option value="standard">{lobbyCopy.standard}</option>
                            </select>
                            <ChevronDown
                              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-secondary)]"
                              aria-hidden="true"
                            />
                          </div>
                          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
                            {lobbyCopy.usesDefaultBotStrategy}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-56 items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 px-6 py-8">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]">
                          <Users className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                          <h2 className="text-xl font-bold text-[color:var(--text-primary)]">{lobbyCopy.roomLobby}</h2>
                          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                            {lobbyCopy.createLobbyDescription}
                          </p>
                          {!currentUserId ? (
                            <p className="mt-3 text-sm font-semibold text-[color:var(--text-secondary)]">
                              {lobbyCopy.roomSignInPrompt}{' '}
                              <Link href={signInHref} className="font-bold text-[color:var(--accent)] underline underline-offset-2">
                                {lobbyCopy.signIn}
                              </Link>
                            </p>
                          ) : null}
                          {room ? (
                            <div className="mt-4">
                              <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">{lobbyCopy.roomCode}</p>
                              <p className="mt-1 font-mono text-3xl font-black tracking-[0.25em] text-[color:var(--accent)]">{room.code}</p>
                              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{room.status === 'waiting' ? lobbyCopy.roomWaiting : lobbyCopy.roomReady}</p>
                            </div>
                          ) : (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <input
                                value={roomCode}
                                onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                                aria-label={lobbyCopy.roomCode}
                                placeholder={lobbyCopy.roomCodePlaceholder}
                                className="w-36 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 font-mono font-bold uppercase tracking-widest text-[color:var(--text-primary)]"
                              />
                              <button type="button" disabled={!currentUserId || !selectedDeck || roomCode.length !== 6 || isRoomRequestPending} onClick={() => void submitRoomRequest('join')} className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-bold disabled:opacity-50">
                                {lobbyCopy.joinRoom}
                              </button>
                            </div>
                          )}
                          {roomError ? <p role="alert" className="mt-3 text-sm text-red-400">{roomError}</p> : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <button
                type="button"
                onClick={selectedMode === 'lobby' ? () => void submitRoomRequest('create') : startSelectedDeck}
                disabled={!selectedDeck || (selectedMode === 'practice' ? !selectedBotDeck : selectedMode === 'matchmaking' || !currentUserId || isRoomRequestPending || Boolean(room))}
                className="inline-flex w-full items-center justify-center gap-2 border border-[color:var(--accent)] bg-[linear-gradient(135deg,#d89034,#f0bd6d)] px-4 py-3.5 text-base font-black text-[#1c150c] shadow-lg shadow-black/20 transition hover:brightness-110 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {selectedMode === 'practice'
                  ? lobbyCopy.startPractice
                  : selectedMode === 'matchmaking'
                    ? lobbyCopy.findMatch(selectedQueue === 'ranked' ? lobbyCopy.ranked : lobbyCopy.casual)
                    : lobbyCopy.createRoom}
              </button>
            </div>
          </section>
        </div>
      );
    }
    const pendingCombat = gameState.pendingCombat;
    const pendingChoice = gameState.pendingChoice;
    const cardActionCopy = getCardActionCopy(locale);
    const readySupplyCount = getReadySupplyCount(gameState, 'player');
    const playablePlayerCounters =
      pendingCombat?.priorityOwner === 'player'
        ? gameState.zones.hand.filter((instance) => !getCounterPlayError(gameState, 'player', instance.instanceId))
        : [];
    const canTakePlayerActions = !gameState.winner && (gameState.phase === 'setup' || gameState.activePlayer === 'player');
    const canUseBoardActions = canTakePlayerActions && !pendingCombat && !pendingChoice;
    const canPlayFromHand = gameState.phase === 'main' && gameState.activePlayer === 'player' && !pendingCombat && !pendingChoice;
    const playableCounterTerritories =
      pendingCombat?.priorityOwner === 'player'
        ? BATTLEFIELD_ZONE_IDS.flatMap((zoneId) =>
            gameState.zones[zoneId]
              .filter(
                (instance) =>
                  instance.owner === 'player' &&
                  instance.faceDown &&
                  isTerritoryCard(instance.card) &&
                  instance.faceDownEnteredTurn !== gameState.turn
              )
              .map((instance) => ({
                instance,
                zoneId,
                disabled: readySupplyCount < getModifiedPlayCost(gameState, 'player', instance.card),
              }))
          )
        : [];
    const playerStagingUnits = getStagingUnitCards(gameState.zones.staging, 'player');
    const friendlyUnitsInPlay = getFriendlyUnitsInPlay(gameState, 'player');
    const currentCombatStatsByInstanceId = Object.fromEntries(
      getUnitsInPlay(gameState).map((instance) => [
        instance.instanceId,
        {
          attack: getCurrentUnitAttack(gameState, instance),
          health: getCurrentUnitHealth(gameState, instance),
        },
      ])
    );
    const battlefieldCardsByZone = {
      battlefieldLeft: gameState.zones.battlefieldLeft,
      battlefieldCenter: gameState.zones.battlefieldCenter,
      battlefieldRight: gameState.zones.battlefieldRight,
    };
    const pendingAbilitySource =
      friendlyUnitsInPlay.find((instance) => instance.instanceId === pendingAbilitySourceId) ?? null;
    const pendingAbilityTargets = pendingAbilitySource
      ? pendingAbilitySource.card.id === 'IMP066' || pendingAbilitySource.card.id === 'IMP139'
        ? friendlyUnitsInPlay
        : pendingAbilitySource.card.id === 'IMP073'
          ? friendlyUnitsInPlay.filter((instance) =>
              ['drone', 'vehicle'].includes(instance.card.subtype.trim().toLowerCase())
            )
          : pendingAbilitySource.card.id === 'IMP079'
            ? getUnitsInPlay(gameState)
            : friendlyUnitsInPlay.filter((instance) => instance.instanceId !== pendingAbilitySource.instanceId)
      : [];
    const canFlipFaceUp = canPlayFromHand;
    const canSupplyFromHand =
      gameState.phase === 'setup'
        ? gameState.playerOpeningHandConfirmed && !gameState.playerStartingSupplyPlaced
        : canManuallySupplyFromHand(gameState, 'player');
    const pendingHandPlaySource =
      pendingHandPlayCost
        ? gameState.zones.hand.find((instance) => instance.instanceId === pendingHandPlayCost.sourceInstanceId) ?? null
        : null;
    const pendingHandPlayTargets =
      pendingHandPlayCost?.costType === 'sacrifice'
        ? friendlyUnitsInPlay
        : pendingHandPlayCost?.costType === 'reanimate'
          ? gameState.zones.graveyard.filter(
              (instance) => isUnitCard(instance.card) && !instance.card.type.toLowerCase().includes('renowned')
            )
        : pendingHandPlaySource
          ? gameState.zones.hand.filter((instance) => instance.instanceId !== pendingHandPlaySource.instanceId)
          : [];
    const pendingChoiceTargets = getPendingChoiceTargetCards(gameState, pendingChoice);
    const pendingCounterTargetSource = pendingCounterTargetSourceId
      ? gameState.zones.hand.find((instance) => instance.instanceId === pendingCounterTargetSourceId) ?? null
      : null;
    const pendingCounterTargets = pendingCounterTargetSource
      ? getCounterTargetOptions(gameState, pendingCounterTargetSource)
      : [];
    const getTargetLocationLabel = (target: GameCardInstance) => {
      const battlefieldZone = (['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] as const).find((zone) =>
        gameState.zones[zone].some((instance) => instance.instanceId === target.instanceId)
      );
      const zoneLabel = battlefieldZone
        ? ZONE_LABELS[battlefieldZone]
        : getCardController(target) === 'player' && gameState.zones.staging.some((instance) => instance.instanceId === target.instanceId)
          ? 'Your staging'
          : getCardController(target) === 'opponent' && gameState.opponentZones.staging.some((instance) => instance.instanceId === target.instanceId)
            ? 'Enemy staging'
            : getCardController(target) === 'player' && gameState.zones.supply.some((instance) => instance.instanceId === target.instanceId)
              ? 'Your supply'
              : getCardController(target) === 'opponent' && gameState.opponentZones.supply.some((instance) => instance.instanceId === target.instanceId)
                ? 'Enemy supply'
                : 'In play';
      return `${getCardController(target) === 'player' ? 'Yours' : 'Enemy'} · ${zoneLabel} · ${target.instanceId.slice(-4)}`;
    };

    return (
      <div className="play-game-content flex min-h-0 flex-1 flex-col gap-4">
        {attackArrow ? <AttackArrowOverlay arrow={attackArrow} /> : null}
        <CardZoomPreview cards={hoveredCounterPreviewCards} />
        <div className="play-game-layout grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(12rem,0.48fr)_minmax(0,2.63fr)]">
          {isMobileSidebarOpen ? (
            <button
              type="button"
              className="play-mobile-sidebar-backdrop"
              aria-label={playCopy.actionLog}
              onClick={() => setIsMobileSidebarOpen(false)}
            />
          ) : null}
          <div className={`play-game-sidebar flex min-h-[18rem] min-w-0 flex-col gap-3 xl:min-h-0${isMobileSidebarOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="play-mobile-sidebar-toggle"
              aria-label={playCopy.actionLog}
              aria-expanded={isMobileSidebarOpen}
              onClick={() => setIsMobileSidebarOpen((isOpen) => !isOpen)}
            >
              <span aria-hidden="true">{isMobileSidebarOpen ? '<' : '>'}</span>
              <span className="play-mobile-sidebar-score" aria-hidden="true">
                {gameState.playerVictoryPoints}-{gameState.opponentVictoryPoints}
              </span>
            </button>
            <section className="play-game-controls rounded-lg border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.06)),var(--surface)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <button type="button" onClick={returnToLobby} className="mb-2 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]">
                {controlsCopy.backToLobby}
              </button>
              <div className="mb-3 rounded-md border border-[color:var(--border)] bg-black/15 px-3 py-2 text-center">
                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {gameState.phase === 'setup' ? `${playCopy.turn} 0 · ${controlsCopy.setup}` : `${playCopy.turn} ${gameState.turn}`}
                </p>
                <p className="mt-0.5 text-sm font-black text-[color:var(--text-primary)]">
                  {gameState.phase === 'setup'
                    ? controlsCopy.setup
                    : gameState.activePlayer === 'player'
                      ? controlsCopy.yourTurn
                      : controlsCopy.botTurn}
                </p>
              </div>
              <div className="mb-3 grid gap-2">
                <VictoryPointScoreControl label={controlsCopy.yourVictoryPoints} value={gameState.playerVictoryPoints} tone="player" />
                <VictoryPointScoreControl label={controlsCopy.enemyVictoryPoints} value={gameState.opponentVictoryPoints} tone="opponent" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setIsConcedeDialogOpen(true)} className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500/45 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300 focus:outline-none focus-visible:ring focus-visible:ring-red-400">
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  {controlsCopy.concede}
                </button>
                <button type="button" onClick={requestPassTurn} disabled={!canPassTurn} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50">
                  <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
                  {controlsCopy.passTurn}
                </button>
              </div>
            </section>
            <aside className="play-game-log flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.06)),var(--surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <header className="border-b border-[color:var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide">{playCopy.actionLog}</h2>
              </header>
              <ol className="deck-builder-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm text-[color:var(--text-secondary)]">
                <ActionLogList entries={gameState.log} locale={locale} />
              </ol>
            </aside>
          </div>
          <div className="play-game-board relative grid min-h-[42rem] grid-rows-[minmax(11.75rem,0.84fr)_minmax(8.75rem,0.66fr)_minmax(11.75rem,0.84fr)] gap-2 rounded-xl border border-[color:var(--accent)]/30 bg-[radial-gradient(circle_at_50%_43%,rgba(241,143,59,0.15),transparent_34%),radial-gradient(circle_at_50%_50%,rgba(235,184,113,0.06),transparent_58%),linear-gradient(180deg,rgba(54,52,50,0.88),rgba(31,28,26,0.86))] p-2 shadow-[inset_0_1px_0_rgba(255,226,183,0.10),inset_0_0_0_1px_rgba(255,255,255,0.025),0_1rem_2rem_rgba(0,0,0,0.22)] xl:min-h-0 min-[2560px]:grid-rows-[minmax(12.5rem,0.84fr)_minmax(11rem,0.74fr)_minmax(12rem,1fr)]">
            {pendingCombat && !pendingCounterTargetSource ? (
              <div className="absolute inset-0 z-[95] flex items-center justify-center bg-black/45 px-4" role="presentation">
                <div role="dialog" aria-modal="true" aria-labelledby="counter-window-title" className="w-full max-w-md rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-4 shadow-2xl shadow-black/45">
                  <p id="counter-window-title" className="text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">{controlsCopy.counterWindow}</p>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-[color:var(--text-secondary)]">{controlsCopy.counterStack}</p>
                    {pendingCombat.counterStack.length > 0 ? (
                      <ol className="mt-2 grid max-h-40 gap-2 overflow-y-auto">
                        {[...pendingCombat.counterStack].reverse().map((counter, index) => (
                          <li
                            key={counter.instanceId}
                            className="flex min-w-0 items-center gap-2 rounded-md border border-[color:var(--border)] bg-black/15 p-2"
                            onMouseEnter={() => setHoveredCounterPreviewCards([counter])}
                            onMouseLeave={() => {
                              setHoveredCounterPreviewCards((current) =>
                                current?.[0]?.instanceId === counter.instanceId ? null : current
                              );
                            }}
                          >
                            <div
                              className="relative h-12 w-9 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/20"
                              onFocus={() => setHoveredCounterPreviewCards([counter])}
                              onBlur={() => {
                                setHoveredCounterPreviewCards((current) =>
                                  current?.[0]?.instanceId === counter.instanceId ? null : current
                                );
                              }}
                            >
                              {counter.card.imageSrc ? <Image src={counter.card.imageSrc} alt="" fill sizes="36px" className="object-cover" /> : null}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{counter.card.name}</p>
                              <p className="text-[0.65rem] text-[color:var(--text-secondary)]">
                                {index === 0 ? controlsCopy.resolvesNext : `${controlsCopy.counterStack} ${pendingCombat.counterStack.length - index}`}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{controlsCopy.noCounters}</p>
                    )}
                  </div>
                  {pendingCombat.priorityOwner === 'player' && (playablePlayerCounters.length > 0 || playableCounterTerritories.length > 0) ? (
                    <div className="mt-4 border-t border-[color:var(--border)] pt-3">
                      <p className="text-xs font-semibold text-[color:var(--text-secondary)]">{controlsCopy.availableCounters}</p>
                      <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto">
                        {playablePlayerCounters.map((counter) => (
                          <button
                            key={counter.instanceId}
                            type="button"
                            onClick={() => requestPlayerCounter(counter)}
                            onMouseEnter={() => setHoveredCounterPreviewCards([counter])}
                            onFocus={() => setHoveredCounterPreviewCards([counter])}
                            onMouseLeave={() => {
                              setHoveredCounterPreviewCards((current) =>
                                current?.[0]?.instanceId === counter.instanceId ? null : current
                              );
                            }}
                            onBlur={() => {
                              setHoveredCounterPreviewCards((current) =>
                                current?.[0]?.instanceId === counter.instanceId ? null : current
                              );
                            }}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-left transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                          >
                            <span className="truncate text-sm font-semibold">{counter.card.name}</span>
                            <span className="shrink-0 text-xs text-[color:var(--text-secondary)]">{controlsCopy.cost} {getModifiedPlayCost(gameState, 'player', counter.card)}</span>
                          </button>
                        ))}
                        {playableCounterTerritories.map(({ instance, zoneId, disabled }) => (
                          <button
                            key={instance.instanceId}
                            type="button"
                            onClick={() => moveCard(instance.instanceId, zoneId, zoneId, { faceDown: false })}
                            disabled={disabled}
                            onMouseEnter={() => setHoveredCounterPreviewCards([{ ...instance, faceDown: false }])}
                            onFocus={() => setHoveredCounterPreviewCards([{ ...instance, faceDown: false }])}
                            onMouseLeave={() => {
                              setHoveredCounterPreviewCards((current) =>
                                current?.[0]?.instanceId === instance.instanceId ? null : current
                              );
                            }}
                            onBlur={() => {
                              setHoveredCounterPreviewCards((current) =>
                                current?.[0]?.instanceId === instance.instanceId ? null : current
                              );
                            }}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-left transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{cardActionCopy.flipFaceUp}: {instance.card.name}</span>
                              <span className="block text-[0.65rem] text-[color:var(--text-secondary)]">{ZONE_LABELS[zoneId]}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[color:var(--text-secondary)]">{controlsCopy.cost} {getModifiedPlayCost(gameState, 'player', instance.card)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={passPlayerCounterPriority}
                    disabled={pendingCombat.priorityOwner !== 'player'}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--accent)]/55 bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingCombat.priorityOwner === 'player' ? controlsCopy.passCounter : controlsCopy.waitingForBot}
                  </button>
                </div>
              </div>
            ) : null}
            <CombinedStagingSupplyPanel
              stagingCards={gameState.opponentZones.staging}
              supplyCards={gameState.opponentZones.supply}
              graveyardCards={gameState.opponentZones.graveyard}
              banishCards={gameState.opponentZones.banish}
              deckCards={gameState.opponentZones.deck}
              temporarySupplyCount={gameState.opponentTemporarySupply}
              currentCombatStatsByInstanceId={currentCombatStatsByInstanceId}
              mirror
              cardsDrawnThisTurnByOwner={{
                player: gameState.playerCardsDrawnThisTurn,
                opponent: gameState.opponentCardsDrawnThisTurn,
              }}
              locale={locale}
            />
            <div className="play-game-battlefields grid min-h-0 gap-2 md:grid-cols-3">
              <BattlefieldPanel zone="battlefieldLeft" cards={gameState.zones.battlefieldLeft} onMove={moveCard} onAttack={attackBattlefield} battlefieldCardsByZone={battlefieldCardsByZone} onActivate={requestAbilityActivation} disabled={!canUseBoardActions} canFlipFaceUp={canFlipFaceUp} currentTurn={gameState.turn} readySupplyCount={readySupplyCount} currentCombatStatsByInstanceId={currentCombatStatsByInstanceId} cardsDrawnThisTurnByOwner={{ player: gameState.playerCardsDrawnThisTurn, opponent: gameState.opponentCardsDrawnThisTurn }} locale={locale} />
              <BattlefieldPanel zone="battlefieldCenter" cards={gameState.zones.battlefieldCenter} onMove={moveCard} onAttack={attackBattlefield} battlefieldCardsByZone={battlefieldCardsByZone} onActivate={requestAbilityActivation} disabled={!canUseBoardActions} canFlipFaceUp={canFlipFaceUp} currentTurn={gameState.turn} readySupplyCount={readySupplyCount} currentCombatStatsByInstanceId={currentCombatStatsByInstanceId} cardsDrawnThisTurnByOwner={{ player: gameState.playerCardsDrawnThisTurn, opponent: gameState.opponentCardsDrawnThisTurn }} locale={locale} />
              <BattlefieldPanel zone="battlefieldRight" cards={gameState.zones.battlefieldRight} onMove={moveCard} onAttack={attackBattlefield} battlefieldCardsByZone={battlefieldCardsByZone} onActivate={requestAbilityActivation} disabled={!canUseBoardActions} canFlipFaceUp={canFlipFaceUp} currentTurn={gameState.turn} readySupplyCount={readySupplyCount} currentCombatStatsByInstanceId={currentCombatStatsByInstanceId} cardsDrawnThisTurnByOwner={{ player: gameState.playerCardsDrawnThisTurn, opponent: gameState.opponentCardsDrawnThisTurn }} locale={locale} />
            </div>
            <CombinedStagingSupplyPanel
              stagingCards={gameState.zones.staging}
              supplyCards={gameState.zones.supply}
              graveyardCards={gameState.zones.graveyard}
              banishCards={gameState.zones.banish}
              deckCards={gameState.zones.deck}
              temporarySupplyCount={gameState.playerTemporarySupply}
              canInspectSupplyCards
              currentCombatStatsByInstanceId={currentCombatStatsByInstanceId}
              onMove={moveCard}
              onAttack={attackBattlefield}
              onActivate={requestAbilityActivation}
              battlefieldCardsByZone={{
                battlefieldLeft: gameState.zones.battlefieldLeft,
                battlefieldCenter: gameState.zones.battlefieldCenter,
                battlefieldRight: gameState.zones.battlefieldRight,
              }}
              disabled={!canUseBoardActions}
              cardsDrawnThisTurnByOwner={{
                player: gameState.playerCardsDrawnThisTurn,
                opponent: gameState.opponentCardsDrawnThisTurn,
              }}
              locale={locale}
            />
          </div>
        </div>
        {pendingChoice ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pending-choice-title"
              className="w-full max-w-2xl rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl"
            >
              <h2 id="pending-choice-title" className="text-lg font-bold text-[color:var(--text-primary)]">
                {pendingChoice.kind === 'lucilleScore'
                  ? 'Lucille, Blood Baroness'
                  : pendingChoice.kind === 'nerezzaSacrifice' || pendingChoice.kind === 'nerezzaSteal'
                    ? 'Nerezza, Umbrasco Scion'
                    : pendingChoice.kind === 'nocturneMark'
                      ? 'Nocturne Agent'
                      : pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget' || pendingChoice.kind === 'caelumZone' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget' || pendingChoice.kind === 'terraZone' || pendingChoice.kind === 'neutralTarget'
                        ? pendingChoice.sourceName
                      : 'Discard a card'}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                {pendingChoice.kind === 'lucilleScore'
                  ? 'Choose any number of units in your staging area to sacrifice. You gain that many victory points. Choosing none is allowed.'
                  : pendingChoice.kind === 'nerezzaSacrifice'
                    ? 'Choose another friendly unit to sacrifice for Nerezza. Choosing none is allowed.'
                    : pendingChoice.kind === 'nerezzaSteal'
                      ? 'Choose an enemy unit in a combat zone to take control of.'
                      : pendingChoice.kind === 'nocturneMark'
                        ? 'Choose an enemy unit in a combat zone. If it dies this turn, its controller discards a card.'
                        : pendingChoice.kind === 'noxTarget'
                          ? 'Choose a valid target to resolve this card ability.'
                          : pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget' || pendingChoice.kind === 'caelumZone' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget' || pendingChoice.kind === 'terraZone' || pendingChoice.kind === 'neutralTarget'
                            ? pendingChoice.prompt
                        : 'Choose exactly one card to discard.'}
              </p>
              {pendingChoice.kind === 'caelumTarget' && pendingChoice.effect === 'airdrop' ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
                  {pendingChoiceTargets.slice(0, 1).map((target) => (
                    <div
                      key={target.instanceId}
                      className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-2"
                    >
                      <span className="relative block aspect-[5/7] overflow-hidden rounded border border-black/30 bg-black/15">
                        {target.card.imageSrc ? (
                          <Image src={target.card.imageSrc} alt="" fill sizes="112px" className="object-cover" />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold">{target.card.name}</span>
                    </div>
                  ))}
                  <p className="text-sm font-semibold text-[color:var(--text-secondary)]">
                    Choose where to put the revealed top card.
                  </p>
                </div>
              ) : pendingChoice.kind === 'caelumZone' || pendingChoice.kind === 'terraZone' ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {pendingChoice.availableZoneIds.map((zoneId) => (
                    <button
                      key={zoneId}
                      type="button"
                      onClick={() => confirmPendingZoneChoice(zoneId)}
                      className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-3 text-sm font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    >
                      {ZONE_LABELS[zoneId]}
                    </button>
                  ))}
                </div>
              ) : pendingChoiceTargets.length > 0 ? (
                <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                  {pendingChoiceTargets.map((target) => {
                    const isSelected = pendingLucilleSacrificeIds.includes(target.instanceId);
                    const hideCardDetails = isPrivateOpponentSupplyChoiceTarget(gameState, pendingChoice, target);

                    return (
                      <button
                        key={target.instanceId}
                        type="button"
                        onClick={() => {
                          if (
                            pendingChoice.kind === 'lucilleScore' ||
                            ((pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget') && (pendingChoice.maxSelections ?? 1) > 1)
                          ) {
                            togglePendingLucilleSacrifice(target.instanceId);
                            return;
                          }

                          setPendingLucilleSacrificeIds([target.instanceId]);
                        }}
                        className={`rounded-md border p-2 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                          isSelected
                            ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10'
                            : 'border-[color:var(--border)] bg-[color:var(--surface-muted)] hover:border-[color:var(--accent)]'
                        }`}
                      >
                        <span className="relative block aspect-[5/7] overflow-hidden rounded border border-black/30 bg-black/15">
                          {hideCardDetails ? (
                            <Image src={CARD_BACK_IMAGE_SRC} alt="" fill sizes="128px" className="object-cover" />
                          ) : target.card.imageSrc ? (
                            <Image src={target.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                          ) : null}
                          {hideCardDetails ? null : (
                            <>
                              <DamageBadge instance={target} />
                              <CombatStatsBadge
                                instance={target}
                                currentStats={currentCombatStatsByInstanceId[target.instanceId]}
                              />
                            </>
                          )}
                        </span>
                        <span className="mt-1 block truncate text-xs font-semibold">
                          {hideCardDetails ? 'Supply card' : target.card.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[0.62rem] font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                          {getTargetLocationLabel(target)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-dashed border-[color:var(--border)] p-4 text-center text-sm text-[color:var(--text-secondary)]">
                  {pendingChoice.kind === 'forcedDiscard' || pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget' || pendingChoice.kind === 'neutralTarget'
                    ? pendingChoice.kind === 'forcedDiscard'
                      ? 'No cards are available to discard.'
                      : 'No valid targets are available.'
                    : 'No valid choices are available.'}
                </p>
              )}
              {pendingChoice.kind === 'caelumZone' || pendingChoice.kind === 'terraZone' ? null : (
              <div className={`mt-4 grid gap-2 ${pendingChoice.kind === 'lucilleScore' || pendingChoice.kind === 'nerezzaSacrifice' || ((pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget' || pendingChoice.kind === 'neutralTarget') && pendingChoice.optional) ? 'sm:grid-cols-2' : ''}`}>
                {pendingChoice.kind === 'lucilleScore' || pendingChoice.kind === 'nerezzaSacrifice' || ((pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget' || pendingChoice.kind === 'neutralTarget') && pendingChoice.optional) ? (
                  <button
                    type="button"
                    onClick={() => confirmPendingLucilleChoice(true)}
                    className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                  >
                    {pendingChoice.kind === 'lucilleScore'
                      ? 'Do not sacrifice'
                      : pendingChoice.kind === 'caelumTarget' && pendingChoice.effect === 'airdrop'
                        ? 'Put into supply exhausted'
                        : 'Do not use ability'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => confirmPendingLucilleChoice(false)}
                  disabled={
                    (pendingChoice.kind === 'nerezzaSteal' || pendingChoice.kind === 'nocturneMark' || pendingChoice.kind === 'forcedDiscard' || pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'neutralTarget' || (pendingChoice.kind === 'caelumTarget' && pendingChoice.effect !== 'airdrop')) &&
                    pendingLucilleSacrificeIds.length !== 1 ||
                    pendingChoice.kind === 'luxTarget' &&
                    (
                      (!pendingChoice.optional && pendingLucilleSacrificeIds.length === 0) ||
                      pendingLucilleSacrificeIds.length > (pendingChoice.maxSelections ?? 1)
                    )
                    ||
                    pendingChoice.kind === 'solaraTarget' &&
                    (
                      (!pendingChoice.optional && pendingLucilleSacrificeIds.length === 0) ||
                      pendingLucilleSacrificeIds.length < (pendingChoice.minSelections ?? (pendingChoice.optional ? 0 : 1)) ||
                      pendingLucilleSacrificeIds.length > (pendingChoice.maxSelections ?? 1)
                    )
                    ||
                    pendingChoice.kind === 'terraTarget' &&
                    (
                      (!pendingChoice.optional && pendingLucilleSacrificeIds.length === 0) ||
                      pendingLucilleSacrificeIds.length < (pendingChoice.minSelections ?? (pendingChoice.optional ? 0 : 1)) ||
                      pendingLucilleSacrificeIds.length > (pendingChoice.maxSelections ?? 1)
                    )
                  }
                  className="inline-flex w-full items-center justify-center rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-bold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {pendingChoice.kind === 'caelumTarget' && pendingChoice.effect === 'airdrop'
                    ? 'Put into hand'
                    : pendingChoice.kind === 'terraTarget' && pendingChoice.effect === 'ravenRetreat'
                      ? 'Retreat Raven'
                    : `Confirm ${pendingLucilleSacrificeIds.length > 0 ? `(${pendingLucilleSacrificeIds.length})` : ''}`}
                </button>
              </div>
              )}
            </div>
          </div>
        ) : null}
        {pendingCounterTargetSource ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="counter-target-title"
              className="w-full max-w-2xl rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl"
            >
              <h2 id="counter-target-title" className="text-lg font-bold text-[color:var(--text-primary)]">
                {pendingCounterTargetSource.card.name}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                {pendingCounterTargetSource.card.rulesText}
              </p>
              <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                {pendingCounterTargets.map((target) => (
                  <button
                    key={target.instanceId}
                    type="button"
                    onClick={() => playPlayerCounter(pendingCounterTargetSource.instanceId, target.instanceId)}
                    className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-2 text-left transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                  >
                    <span className="relative block aspect-[5/7] overflow-hidden rounded border border-black/30 bg-black/15">
                      {target.card.imageSrc ? (
                        <Image src={target.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                      ) : null}
                      <DamageBadge instance={target} />
                      <CombatStatsBadge
                        instance={target}
                        currentStats={currentCombatStatsByInstanceId[target.instanceId]}
                      />
                    </span>
                    <span className="mt-1 block truncate text-xs font-semibold">{target.card.name}</span>
                    <span className="mt-0.5 block truncate text-[0.62rem] font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                      {getTargetLocationLabel(target)}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPendingCounterTargetSourceId(null)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                {controlsCopy.cancel}
              </button>
            </div>
          </div>
        ) : null}
        {pendingAbilitySource ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ability-target-title"
              className="w-full max-w-lg rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl"
            >
              <h2 id="ability-target-title" className="text-lg font-bold text-[color:var(--text-primary)]">
                Sacrifice another unit
              </h2>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Choose a friendly unit to sacrifice. {pendingAbilitySource.card.name} will ready.
              </p>
              {pendingAbilityTargets.length > 0 ? (
                <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                  {pendingAbilityTargets.map((target) => (
                    <button
                      key={target.instanceId}
                      type="button"
                      onClick={() => activateAbilityWithTarget(target.instanceId)}
                      className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-2 text-left transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    >
                      <span className="relative block aspect-[5/7] overflow-hidden rounded border border-black/30 bg-black/15">
                        {target.card.imageSrc ? (
                          <Image src={target.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                        ) : null}
                        <DamageBadge instance={target} />
                        <CombatStatsBadge
                          instance={target}
                          currentStats={currentCombatStatsByInstanceId[target.instanceId]}
                        />
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold">{target.card.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-dashed border-[color:var(--border)] p-4 text-center text-sm text-[color:var(--text-secondary)]">
                  No other friendly unit can be sacrificed.
                </p>
              )}
              <button
                type="button"
                onClick={() => setPendingAbilitySourceId(null)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {pendingHandPlaySource ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="play-cost-title"
              className="w-full max-w-lg rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 shadow-2xl"
            >
              <h2 id="play-cost-title" className="text-lg font-bold text-[color:var(--text-primary)]">
                {pendingHandPlayCost?.costType === 'sacrifice' ? 'Sacrifice a unit' : 'Discard a card'}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                {pendingHandPlayCost?.costType === 'sacrifice'
                  ? `Choose a friendly unit to sacrifice to play ${pendingHandPlaySource.card.name}.`
                  : pendingHandPlayCost?.costType === 'reanimate'
                    ? `Choose a non-Renowned unit in your graveyard to return with ${pendingHandPlaySource.card.name}.`
                  : `Choose another card to discard to play ${pendingHandPlaySource.card.name}.`}
              </p>
              {pendingHandPlayTargets.length > 0 ? (
                <div className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                  {pendingHandPlayTargets.map((target) => (
                    <button
                      key={target.instanceId}
                      type="button"
                      onClick={() => resolvePendingHandPlayCost(target.instanceId)}
                      className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-2 text-left transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    >
                      <span className="relative block aspect-[5/7] overflow-hidden rounded border border-black/30 bg-black/15">
                        {target.card.imageSrc ? (
                          <Image src={target.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                        ) : null}
                        <DamageBadge instance={target} />
                        <CombatStatsBadge
                          instance={target}
                          currentStats={currentCombatStatsByInstanceId[target.instanceId]}
                        />
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold">{target.card.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-md border border-dashed border-[color:var(--border)] p-4 text-center text-sm text-[color:var(--text-secondary)]">
                  {pendingHandPlayCost?.costType === 'sacrifice'
                    ? 'No friendly unit can be sacrificed.'
                    : pendingHandPlayCost?.costType === 'reanimate'
                      ? 'No non-Renowned unit is in your graveyard.'
                    : 'No other card can be discarded.'}
                </p>
              )}
              <button
                type="button"
                onClick={() => setPendingHandPlayCost(null)}
                className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {gameState.winner ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="game-result-title" className="w-full max-w-sm rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 text-center shadow-2xl shadow-black/50">
              <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">{controlsCopy.gameOver}</p>
              <h2 id="game-result-title" className="mt-2 text-2xl font-black text-[color:var(--text-primary)]">
                {gameState.winner === 'player' ? controlsCopy.youWon : controlsCopy.youLost}
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-[color:var(--accent)]/40 bg-black/15 p-3">
                  <p className="text-xs font-semibold text-[color:var(--text-secondary)]">{controlsCopy.you}</p>
                  <p className="mt-1 text-3xl font-black">{gameState.playerVictoryPoints}</p>
                </div>
                <div className="rounded-md border border-red-400/40 bg-black/15 p-3">
                  <p className="text-xs font-semibold text-[color:var(--text-secondary)]">{controlsCopy.bot}</p>
                  <p className="mt-1 text-3xl font-black">{gameState.opponentVictoryPoints}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={returnToLobby}
                  className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.lobby}
                </button>
                <button
                  type="button"
                  onClick={resetGame}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-bold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {controlsCopy.rematch}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isConcedeDialogOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="concede-title" className="w-full max-w-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-2xl">
              <h2 id="concede-title" className="text-lg font-semibold text-[color:var(--text-primary)]">{controlsCopy.concedeGame}</h2>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                {controlsCopy.concedeDescription}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConcedeDialogOpen(false)}
                  className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.cancel}
                </button>
                <button
                  type="button"
                  onClick={confirmConcede}
                  className="rounded-md border border-red-500/45 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 transition hover:border-red-300 focus:outline-none focus-visible:ring focus-visible:ring-red-400"
                >
                  {controlsCopy.concede}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isPassTurnDialogOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="pass-turn-title" className="w-full max-w-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-2xl">
              <h2 id="pass-turn-title" className="text-lg font-semibold text-[color:var(--text-primary)]">{controlsCopy.passTurn}?</h2>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                {controlsCopy.passTurnDescription}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPassTurnDialogOpen(false)}
                  className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.cancel}
                </button>
                <button
                  type="button"
                  onClick={confirmPassTurn}
                  className="rounded-md border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/20 px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.passTurn}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <RequiredActionToast
          message={
            !gameState.playerOpeningHandConfirmed
              ? controlsCopy.openingHand
              : !gameState.playerStartingSupplyPlaced
              ? controlsCopy.startingSupply
              : gameState.phase === 'setup'
                ? gameState.sessionMode === 'multiplayer'
                  ? controlsCopy.rollingFirst
                  : controlsCopy.chooseFirst
                : null
          }
          actions={
            gameState.phase === 'setup' && !gameState.playerOpeningHandConfirmed ? (
              <>
                <button
                  type="button"
                  onClick={() => chooseOpeningHand(false)}
                  className="pointer-events-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.keepHand}
                </button>
                <button
                  type="button"
                  onClick={() => chooseOpeningHand(true)}
                  className="pointer-events-auto rounded-md border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/20 px-3 py-2 text-xs font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.mulligan}
                </button>
              </>
            ) : gameState.sessionMode === 'practice' && gameState.phase === 'setup' && gameState.playerStartingSupplyPlaced ? (
              <>
                <button
                  type="button"
                  onClick={() => chooseFirstPlayer('player')}
                  className="pointer-events-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.youFirst}
                </button>
                <button
                  type="button"
                  onClick={() => chooseFirstPlayer('opponent')}
                  className="pointer-events-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  {controlsCopy.botFirst}
                </button>
              </>
            ) : null
          }
        />
        <OpponentHandStrip
          cards={gameState.opponentZones.hand}
          dealOpeningHand={gameState.phase === 'setup' && !gameState.playerOpeningHandConfirmed}
          locale={locale}
        />
        <HandStrip
          cards={gameState.zones.hand}
          gameState={gameState}
          onMove={moveCard}
          disabled={!canUseBoardActions}
          canSupplyFromHand={canSupplyFromHand}
          canPlayFromHand={canPlayFromHand}
          friendlyUnitsInPlay={friendlyUnitsInPlay}
          graveyardCards={gameState.zones.graveyard}
          readySupplyCount={readySupplyCount}
          stagingUnits={playerStagingUnits}
          demonicAdvanceActive={gameState.playerDemonicAdvanceActive}
          battlefieldCardsByZone={{
            battlefieldLeft: gameState.zones.battlefieldLeft,
            battlefieldCenter: gameState.zones.battlefieldCenter,
            battlefieldRight: gameState.zones.battlefieldRight,
          }}
          locale={locale}
        />
      </div>
    );
  })();

  return (
    <main className="play-simulator-workspace flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8 pt-4 text-[color:var(--text-primary)] lg:px-6">
      <div className="flex min-h-0 flex-1 flex-col">
        {content}
      </div>
    </main>
  );
}

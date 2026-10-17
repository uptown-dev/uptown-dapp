// The Stake page (spec "Frontend -> Stake", CR-102 amended 2026-10-17): staking in SkylineStaking,
// free, in one pool. The page shows the total SKYLINE staked, the current stream (its rate and its
// end), the wallet's stake and earned WETH, and three actions: stake (the exact-amount approval,
// then the stake, from one press; CR-82), unstake any amount, and claim. Every staking transaction
// goes only to a staking contract the site's own files list (CR-72) and carries the 700,000 gas
// limit. A replaced contract is shown, to a wallet with a stake there, as "replaced on <date>: no new
// rewards; unstake and claim only", and "Payouts paused" appears while the treasury's payouts are
// paused (CR-50). CR-102 withdrew TownStaking and its paid staking with it.
import { useState } from 'preact/hooks';
import type { PublicClient } from 'viem';
import { RunStatus, Stop, readUntil, useRun, useWatch, type Run, type Runner } from '../components/steps';
import { useApp, useChain, useTx, useWalletKey, Card, ConnectPrompt, Details, Fig, FieldError, Figures, Notice, PageHead, Tabs, TxStatus, Usd, Uses, type Tx } from '../components/ui';
import { amountError, amountOrNull, fmtExact } from '../lib/amount';
import { UNLISTED_STAKING, listedStaking, type Network } from '../lib/network';
import type { Address, OldStake } from '../data/types';
import { pausePending, poolEmpty, stakeShareBps, stakingChange, stakingPaidSince, stakingReplaced, streamEnd, streamPerDay, unpaidStream } from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtEth, fmtInt, fmtTown, shortAddress } from '../lib/format';
import { STAKING_GAS_LIMIT, approveTx, claimWethTx, stakeTx, unstakeTx } from '../lib/actions';
import { readStakeApproval } from '../lib/reads';
import { formatUnits } from 'viem';

/** A SKYLINE amount typed (CR-72: a point for decimals, commas only between thousands), or null. */
const parseSkyline = (s: string): bigint | null => amountOrNull(s, 18);
/** The sentence for a SKYLINE amount that cannot be used, or null. */
const skylineError = (s: string): string | null => amountError(s, 18, 'Enter an amount of $SKYLINE, for example 1,000,000.');

/** The page's lead, and the three plain facts the spec asks the page to say (CR-102 amended). */
export const STAKE_LEAD = 'Stake $SKYLINE for free and earn a share of the ETH the treasury pays out every day, as WETH.';
export const STAKE_FACTS = {
  free: 'Staking is free: there is nothing to buy first and no fee to stake, only the network’s gas.',
  share: 'Rewards follow the $SKYLINE each address has staked: every payout is shared by everyone staked, in proportion to their stake.',
  nft: 'This staking contract is temporary. An NFT staking contract for holders of the “Uptowners” collection replaces it later; the treasury announces the switch 2 days ahead, and a stake left here can still be unstaked and claimed.',
} as const;

export function Stake() {
  return (
    <div class="wrap page">
      <PageHead title="Stake" lead={STAKE_LEAD} />
      <PayoutChanges />
      <OldStakes />
      <HowStakingWorks />
      <PoolCard />
      <YourStake />
      <StakeDetails />
    </div>
  );
}

/** The three plain facts (CR-102 amended): free, by SKYLINE staked, temporary until the NFT staking contract. Also shown before the launch. */
export function HowStakingWorks() {
  return (
    <Card title="How staking works" class="stake-facts">
      <ul class="plain-list">
        <li data-fact="free">
          <strong>Free.</strong> {STAKE_FACTS.free}
        </li>
        <li data-fact="share">
          <strong>By stake.</strong> {STAKE_FACTS.share}
        </li>
        <li data-fact="nft">
          <strong>For now.</strong> {STAKE_FACTS.nft}
        </li>
      </ul>
    </Card>
  );
}

/** How staking works, in the page's Details (also shown before the launch, CR-86). */
export function StakeDetails() {
  return (
    <Details>
      <ul class="plain-list">
        <li>
          <strong>When payouts happen.</strong> Once a day, when someone triggers the day: any staking action, or the free button on the{' '}
          <a href="#/stats">Stats page</a>. The day’s budget is paid only if it is at least 0.001 ETH; a smaller one waits. Each payout streams over seven
          days, and you earn only while staked.
        </li>
        <li>
          <strong>When nothing is staked.</strong> The stream pauses and nothing is lost: the WETH waiting goes to whoever stakes first, over at most seven
          days, shared with anyone else who stakes meanwhile.
        </li>
        <li>
          <strong>Unstaking.</strong> Any amount, at any time, with no lock and no minimum. Earned WETH stays claimable after you unstake.
        </li>
        <li>
          <strong>Only here.</strong> This page stakes only in the staking contract the treasury pays now. When the owner replaces it, this page shows a stake
          left in the old one with unstake and claim only.
        </li>
        <li>
          <strong>Gas.</strong> Staking transactions are sent with a gas limit of {fmtInt(Number(STAKING_GAS_LIMIT))}, so the day’s payout can run with your
          action; the first staking action of a day costs more gas for that reason. A small stake may not cover its gas.
        </li>
      </ul>
    </Details>
  );
}

/**
 * CR-46, CR-48, CR-50: the treasury's payouts paused, a pause announced, a different staking
 * contract announced (waiting, open to anyone within its 7-day window, or expired), or already in
 * use; each with a link to the Stats page, where every pending owner change is listed.
 */
function PayoutChanges() {
  const chain = useChain();
  const { network } = useApp();
  const t = chain.treasury;
  const pauseAt = pausePending(chain);
  const change = stakingChange(chain);
  const unlisted = listedStaking(network, t.staking) === null;
  const replaced = !unlisted && stakingReplaced(chain, network.deployment?.contracts.SkylineStaking);
  const since = stakingPaidSince(network.stakingContracts, t.staking);
  const more = (
    <>
      {' '}
      See the <a href="#/stats">Stats page</a>.
    </>
  );
  return (
    <>
      {unlisted && (
        <Notice kind="warn" title={UNLISTED_STAKING}>
          <p class="unlisted-staking">
            The treasury now pays the staking contract <code class="break">{t.staking}</code>, which this site does not list yet. Its figures are shown
            below, but this site sends nothing to it: staking is off here. A stake in a staking contract this site lists can still be unstaked and claimed
            below.
          </p>
        </Notice>
      )}
      {t.paused && (
        <Notice kind="warn" title="The treasury’s payouts are paused by the owner">
          <p>
            No new ETH reaches staking until the owner unpauses; the stakers’ share waits in the treasury and is paid out afterwards. WETH already streaming
            here keeps streaming, and staking, unstaking and claiming keep working.{more}
          </p>
        </Notice>
      )}
      {pauseAt !== null && (
        <Notice kind="info" title="A pause of the payouts is announced">
          <p>
            From <span class="num">{fmtDateTime(pauseAt)}</span> the treasury’s payouts will be paused, unless the owner cancels it first. WETH already
            streaming here is not affected.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'waiting' && (
        <Notice kind="warn" title="A different staking contract is announced">
          <p>
            From <span class="num">{fmtDateTime(change.from)}</span> until <span class="num">{fmtDateTime(change.until)}</span> anyone can apply it, and the
            treasury then pays it instead of this one; WETH already streaming here is not affected.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'open' && t.candidate?.verified === false && (
        <Notice kind="info" title="An announced staking contract cannot be applied">
          <p>
            Its wait is over, but this site asked it and it does not look like a staking contract, so the treasury will refuse it: payouts keep coming
            here.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'open' && t.candidate?.verified !== false && (
        <Notice kind="warn" title="A different staking contract can be applied now">
          <p>
            Treat it as already in effect: anyone can apply it at any moment until <span class="num">{fmtDateTime(change.until)}</span>, and from then on new
            payouts go to it, not here. WETH already streaming here is not affected.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'expired' && (
        <Notice kind="info" title="An announced staking contract has expired">
          <p>
            It was not applied by <span class="num">{fmtDateTime(change.until)}</span>, so it can no longer be: the treasury keeps paying this contract. To
            replace it, the owner must announce again, with a new 2-day wait.{more}
          </p>
        </Notice>
      )}
      {replaced && (
        <Notice kind="info" title="The treasury pays a replacement staking contract">
          <p>
            The owner replaced SkylineStaking{since !== null ? <> on <span class="num">{fmtDate(since)}</span></> : null}: payouts now go to{' '}
            <code>{shortAddress(t.staking)}</code>, and this page stakes only in it. A stake in SkylineStaking earns no new rewards; it can still be unstaked
            and claimed.{more}
          </p>
        </Notice>
      )}
    </>
  );
}

/**
 * CR-50: the wallet's stakes in staking contracts the Treasury no longer pays (the network module's
 * hand-kept list). No new stake is offered there; only unstake and claim.
 */
function OldStakes() {
  const { wallet } = useApp();
  // CR-104: a card belongs to the wallet it shows; another account gets its own (its message of the old one gone).
  const walletKey = useWalletKey();
  if (!wallet || wallet.oldStakes.length === 0) return null;
  return (
    <>
      {wallet.oldStakes.map((v) => (
        <OldStakeCard key={`${walletKey}:${v.address}`} old={v} />
      ))}
    </>
  );
}

export function OldStakeCard({ old }: { old: OldStake }) {
  const tx = useTx();
  const { network } = useApp();
  return (
    <Card title="Your stake in a replaced staking contract" class="old-stake">
      <p class="old-stake-line">
        <span class="replaced-tag">
          {old.replacedOn !== null ? `Replaced on ${fmtDate(old.replacedOn)}` : 'Replaced'}: no new rewards; unstake and claim only
        </span>{' '}
        <code title={old.address}>{shortAddress(old.address)}</code>
      </p>
      <p class="small muted">
        The treasury no longer pays this contract, so it receives no new payouts; WETH it received before keeps streaming over its seven days. Your $SKYLINE
        and earned WETH stay yours: unstake and claim them here. To earn from new payouts, stake in the current contract below.
      </p>
      <Figures cols={2}>
        <Fig label="$SKYLINE staked" value={fmtTown(old.stake)} unit="$SKYLINE" amount={old.stake} view="stakeOf(wallet), replaced contract" />
        <Fig label="Earned" value={fmtEth(old.earned)} unit="WETH" amount={old.earned} view="earned(wallet), replaced contract" accent />
      </Figures>
      <div class="btn-row">
        <button
          type="button"
          class="btn btn-primary"
          disabled={tx.busy || old.earned === 0n}
          onClick={() => void tx.run('Claim WETH', () => claimWethTx(network, old.address), () => `About ${fmtEth(old.earned)} WETH went to your wallet.`)}
        >
          {`Claim ${fmtEth(old.earned)} WETH`}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={tx.busy || old.stake === 0n}
          onClick={() =>
            void tx.run('Unstake', () => unstakeTx(network, old.address, old.stake), () => `${fmtTown(old.stake)} $SKYLINE came back to your wallet. Earned WETH stays claimable.`)
          }
        >
          {`Unstake all ${fmtTown(old.stake)} $SKYLINE`}
        </button>
      </div>
      <TxStatus tx={tx} />
    </Card>
  );
}

/** CR-50: shown beside the stake button while the treasury's payouts are paused. */
function PausedTag() {
  const chain = useChain();
  if (!chain.treasury.paused) return null;
  return (
    <p class="paused-beside" role="note">
      <span class="paused-tag">Payouts paused</span>
      <span class="small muted">The treasury pays nothing to stakers until the owner unpauses, so a stake added now earns only what is left of the running stream until then.</span>
    </p>
  );
}

/** The pool: the total staked and the current stream, its rate and its end (spec "Frontend -> Stake"). */
function PoolCard() {
  const chain = useChain();
  const { network } = useApp();
  const st = chain.staking;
  const unlisted = listedStaking(network, st.address) === null;
  const replaced = stakingReplaced(chain, network.deployment?.contracts.SkylineStaking);
  const empty = poolEmpty(chain);
  const unpaid = unpaidStream(chain);
  const end = streamEnd(chain);
  const perDay = streamPerDay(chain);
  return (
    <Card title="The staking pool">
      <p class="small muted card-lead">
        {unlisted ? (
          <>
            Figures from <code data-view="Treasury.staking" class="break">{st.address}</code>, the staking contract the treasury pays now. This site does not
            list it yet, so it offers no staking in it.
          </>
        ) : (
          <>
            Figures from{' '}
            <code data-view="Treasury.staking" title={st.address}>
              {replaced ? shortAddress(st.address) : 'SkylineStaking'}
            </code>
            , the staking contract the treasury pays now: the only one this site stakes in.
          </>
        )}
      </p>
      <Figures cols={3}>
        <Fig label="$SKYLINE staked" value={fmtTown(st.totalStaked)} unit="$SKYLINE" amount={st.totalStaked} view="SkylineStaking.totalStaked" note="by everyone, in one pool" />
        <Fig
          label="Streaming now"
          value={perDay > 0n ? fmtEth(perDay, 6) : empty && unpaid > 0n ? 'Paused' : 'None'}
          unit={perDay > 0n ? 'WETH' : undefined}
          amount={perDay > 0n ? perDay : null}
          view="SkylineStaking.streamInfo().rewardRate × 86,400"
          note={perDay > 0n ? 'a day, shared by stake' : empty && unpaid > 0n ? 'nothing is staked, so the stream waits' : 'no stream running'}
          accent
        />
        <Fig
          label="Stream ends"
          value={end !== null ? fmtDate(end) : '—'}
          view="SkylineStaking.streamInfo().periodFinish"
          note={
            end !== null
              ? `${fmtDateTime(end)}, unless a new payout extends it`
              : empty && unpaid > 0n
                ? 'when someone stakes, it runs on from where it paused'
                : 'the next payout starts a new one'
          }
        />
      </Figures>
      {unpaid > 0n && (
        <p class="small muted stream-left" data-view="derived from SkylineStaking.streamInfo()">
          {empty ? (
            <>
              <span class="num">{fmtEth(unpaid)}</span> WETH <Usd amount={unpaid} unit="WETH" paren /> is waiting in the paused stream. It goes to whoever stakes
              first, over at most seven days, shared with anyone else who stakes meanwhile.
            </>
          ) : (
            <>
              Still to stream: <span class="num">{fmtEth(unpaid)}</span> WETH<Usd amount={unpaid} unit="WETH" paren lead />.
            </>
          )}
        </p>
      )}
    </Card>
  );
}

function GoodToKnow() {
  return (
    <aside class="side-notes" aria-label="Good to know">
      <p class="side-title">Good to know</p>
      <ul class="note-list">
        <li>Staking costs nothing but gas: nothing to buy first, no fee.</li>
        <li>Your share of each payout is your stake over the total staked, while you are staked.</li>
        <li>Unstake any amount at any time; earned WETH stays claimable.</li>
        <li>Every payout streams over seven days; claim the WETH earned so far whenever you like.</li>
      </ul>
    </aside>
  );
}

function YourStake() {
  const { wallet, network } = useApp();
  const chain = useChain();
  // One transaction state for every staking action, kept here so its result stays in view when the
  // tabs change. Staking runs its approval and the stake from one press (CR-82): its run lives here
  // for the same reason. Only the latest of the two is shown.
  const single = useTx();
  const steps = useRun();
  const tx: Tx = { ...single, busy: single.busy || steps.busy, run: (...a) => (steps.reset(), single.run(...a)) };
  const run: Run = { ...steps, busy: steps.busy || single.busy, start: (...a) => (single.reset(), steps.start(...a)) };
  // CR-104: each action form belongs to the wallet it was filled for; another account gets a fresh one
  // (an amount filled from the old balance or stake is gone at once).
  const walletKey = useWalletKey();
  // CR-72: the treasury pays a staking contract the site does not list: its figures, no action.
  const unlisted = listedStaking(network, chain.staking.address) === null;
  if (!wallet) {
    return (
      <Card title="Your stake">
        <div class="split">
          <ConnectPrompt what="your stake, your earned WETH and the staking actions" />
          <GoodToKnow />
        </div>
      </Card>
    );
  }
  type T = 'stake' | 'unstake' | 'claim';
  const tabs: { id: T; label: string }[] = [
    { id: 'stake', label: 'Stake' },
    { id: 'unstake', label: 'Unstake' },
    { id: 'claim', label: 'Claim' },
  ];
  const share = stakeShareBps(chain, wallet.stakeOf);
  return (
    <Card title="Your stake">
      <div class="split">
        <div>
          <Figures cols={3} class="your-stake-figs">
            <Fig label="$SKYLINE staked" value={fmtTown(wallet.stakeOf)} unit="$SKYLINE" amount={wallet.stakeOf} view="SkylineStaking.stakeOf(wallet)" />
            <Fig label="Share of the pool" value={wallet.stakeOf > 0n ? fmtBps(share) : '—'} view="stakeOf(wallet) / totalStaked" note="of each payout while staked" />
            <Fig label="Earned" value={fmtEth(wallet.earned)} unit="WETH" amount={wallet.earned} view="SkylineStaking.earned(wallet)" accent />
          </Figures>
          {unlisted ? (
            <div class="action-form unlisted-off" role="note">
              <p class="small">
                <strong>{UNLISTED_STAKING}.</strong> Staking is off here, and nothing is sent to <code class="break">{chain.staking.address}</code> from this
                site.
              </p>
            </div>
          ) : (
            <Tabs
              label="Staking actions"
              tabs={tabs}
              render={(id) => {
                switch (id) {
                  case 'stake':
                    return <StakeForm key={walletKey} tx={tx} run={run} />;
                  case 'unstake':
                    return <UnstakeForm key={walletKey} tx={tx} />;
                  default:
                    return <ClaimForm key={walletKey} tx={tx} />;
                }
              }}
            />
          )}
          <TxStatus tx={tx} />
          <RunStatus run={run} />
        </div>
        <GoodToKnow />
      </div>
    </Card>
  );
}

/** Staking: the exact-amount approval when it is missing, then the stake (CR-82). */
export function stakePlan(approve: boolean): { id: string; label: string }[] {
  return [...(approve ? [{ id: 'approve', label: 'Approve $SKYLINE' }] : []), { id: 'stake', label: 'Stake $SKYLINE' }];
}

/** Before the press: how many transactions the stake takes, and that the wallet asks for each. */
function StakePlan({ amount }: { amount: bigint }) {
  const { network } = useApp();
  return (
    <p class="run-plan small" data-transactions="2">
      <strong>This takes 2 transactions:</strong> approve exactly <span class="num">{fmtTown(amount)}</span> $SKYLINE <Usd amount={amount} unit="SKYLINE" paren />{' '}
      for the staking contract, then stake it.{' '}
      {network.local
        ? 'Each is sent from the test wallet as soon as the one before is confirmed.'
        : 'Your wallet asks you to confirm each one; the second is sent as soon as the first is confirmed.'}
    </p>
  );
}

/**
 * The run behind "Approve and stake" (CR-82): reads the approval now; sends the exact-amount approval
 * when it does not cover the amount (staking approvals stay the exact amount); then, once it is
 * confirmed, sends the stake, prepared at that moment with its explicit gas limit.
 */
export async function approveThenStake(r: Runner, ctx: { client: PublicClient; network: Network; staking: Address; from: Address; amount: bigint }): Promise<void> {
  const { client, network, staking, from, amount } = ctx;
  const read = () => readStakeApproval(client, network, staking, from);
  const s = await read();
  const need = s.allowance < amount;
  r.plan(stakePlan(need));
  if (s.balance < amount) throw new Stop(`This wallet holds ${fmtTown(s.balance)} $SKYLINE, less than the ${fmtTown(amount)} $SKYLINE typed, so nothing was sent.`, 'Balance', false);
  if (need) {
    await r.send('approve', () => approveTx(network, staking, amount));
    await readUntil(r, read, (x) => x.allowance >= amount, 'the stake');
  }
  await r.send('stake', () => stakeTx(network, staking, amount));
}

function StakeForm({ tx, run }: { tx: Tx; run: Run }) {
  const chain = useChain();
  const { wallet, network, client, account } = useApp();
  const [amount, setAmount] = useState('');
  const amt = parseSkyline(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
  const approved = !!wallet && amt !== null && amt > 0n && wallet.townAllowanceToStaking >= amt;
  useWatch(run, { amount, staking: chain.staking.address });
  const stake = () => {
    if (amt === null || !account) return;
    const a = amt;
    const staking = chain.staking.address;
    void run.start('Stake $SKYLINE', stakePlan(!approved), async (r) => {
      await approveThenStake(r, { client, network, staking, from: account, amount: a });
      return `${fmtExact(a)} $SKYLINE is staked. It earns its share of every payout from now on.`;
    });
  };
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label for="stake-amount">$SKYLINE to stake</label>
        <div class="input-wrap">
          <input
            id="stake-amount"
            class="num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            aria-invalid={skylineError(amount) !== null}
            onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
          />
          <span class="suffix">$SKYLINE</span>
        </div>
        <Uses value={amt} unit="$SKYLINE" />
        {skylineError(amount) && <FieldError>{skylineError(amount)}</FieldError>}
        <span class="hint">
          Free: no fee, only gas. Your $SKYLINE: <span class="num">{fmtTown(wallet?.townBalance ?? 0n)}</span>{' '}
          <Usd amount={wallet?.townBalance} unit="SKYLINE" paren />
          {wallet && wallet.townBalance > 0n && (
            <>
              {' '}
              ·{' '}
              <button type="button" class="link-btn" onClick={() => setAmount(formatUnits(wallet.townBalance, 18))}>
                All of it
              </button>
            </>
          )}
          {wallet?.townBalance === 0n && (
            <>
              {' '}
              · <a href="#/trade">Buy $SKYLINE first</a>
            </>
          )}
          {wallet && wallet.townAllowanceToStaking > 0n && (
            <>
              {' '}
              · approved: <span class="num">{fmtTown(wallet.townAllowanceToStaking)}</span>
            </>
          )}
        </span>
        {tooMuch && <FieldError>That is more $SKYLINE than this wallet holds.</FieldError>}
      </div>
      {amt !== null && amt > 0n && !approved && !tooMuch && !tx.busy && <StakePlan amount={amt} />}
      <PausedTag />
      <div class="btn-row">
        <button type="button" class="btn btn-primary stake-go" disabled={tx.busy || amt === null || amt === 0n || tooMuch} onClick={stake}>
          {approved || amt === null || amt === 0n ? 'Stake $SKYLINE' : 'Approve and stake $SKYLINE'}
        </button>
      </div>
    </form>
  );
}

function UnstakeForm({ tx }: { tx: Tx }) {
  const chain = useChain();
  const { wallet, network } = useApp();
  const [amount, setAmount] = useState('');
  const staked = wallet?.stakeOf ?? 0n;
  const amt = parseSkyline(amount);
  const tooMuch = amt !== null && amt > staked;
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label for="unstake-amount">$SKYLINE to unstake</label>
        <div class="input-wrap">
          <input
            id="unstake-amount"
            class="num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            aria-invalid={skylineError(amount) !== null}
            onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
          />
          <span class="suffix">$SKYLINE</span>
        </div>
        <Uses value={amt} unit="$SKYLINE" />
        {skylineError(amount) && <FieldError>{skylineError(amount)}</FieldError>}
        <span class="hint">
          Any amount, at any time. Staked: <span class="num">{fmtTown(staked)}</span> <Usd amount={staked} unit="SKYLINE" paren />
          {staked > 0n && (
            <>
              {' '}
              ·{' '}
              <button type="button" class="link-btn" onClick={() => setAmount(formatUnits(staked, 18))}>
                All of it
              </button>
            </>
          )}
        </span>
        {tooMuch && <FieldError>That is more $SKYLINE than this wallet has staked.</FieldError>}
      </div>
      <p class="small muted">The $SKYLINE comes back to your wallet at once. Earned WETH stays claimable.</p>
      <button
        type="button"
        class="btn btn-secondary unstake-go"
        disabled={tx.busy || amt === null || amt === 0n || tooMuch}
        onClick={() => {
          if (amt === null) return;
          const a = amt;
          void tx.run('Unstake', () => unstakeTx(network, chain.staking.address, a), () => {
            setAmount('');
            return `${fmtExact(a)} $SKYLINE came back to your wallet. Earned WETH stays claimable.`;
          });
        }}
      >
        Unstake $SKYLINE
      </button>
    </form>
  );
}

function ClaimForm({ tx }: { tx: Tx }) {
  const chain = useChain();
  const { wallet, network } = useApp();
  const earned = wallet?.earned ?? 0n;
  return (
    <div class="action-form">
      <p class="small muted">Sends all your earned WETH to your wallet. It also triggers the day’s payout if nobody has yet.</p>
      <button
        type="button"
        class="btn btn-primary claim-go"
        disabled={tx.busy || !wallet || earned === 0n}
        onClick={() => void tx.run('Claim WETH', () => claimWethTx(network, chain.staking.address), () => `About ${fmtEth(earned)} WETH went to your wallet.`)}
      >
        {`Claim ${fmtEth(earned)} WETH`}
      </button>
    </div>
  );
}

import { PageHero } from '../components/ui';
import { BellamyBadge } from '../components/art';
import { GLOSSARY, type GlossaryEntry } from '../content/glossary';

const GROUPS: GlossaryEntry['group'][] = ['Places and rules', 'Time', 'The Tower', 'People', 'Days the town marks'];

export function Glossary({ highlight }: { highlight: string | null }) {
  return (
    <>
      <PageHero
        kicker="Glossary · lore to plain words"
        title="Glossary"
        lead={<>Every lore term maps to exactly one real thing. Check here whenever a word on this site sounds like a story.</>}
        art={
          <div style="max-width:220px;margin:0 auto">
            <BellamyBadge />
          </div>
        }
      />
      <section class="section" style="padding-top:0">
        <div class="wrap">
          {GROUPS.map((g) => (
            <div class="glossary-group" key={g}>
              <h2>{g}</h2>
              <dl class="glossary-list">
                {GLOSSARY.filter((e) => e.group === g).map((e) => (
                  <div class={`glossary-item${highlight === e.slug ? ' highlight' : ''}`} id={`g-${e.slug}`} key={e.slug} tabIndex={-1}>
                    <dt>{e.term}</dt>
                    <dd>{e.plain}</dd>
                    <dd class="contract">{e.contract}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

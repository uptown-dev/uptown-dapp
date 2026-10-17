// THE RETIRED FIRST DEPLOYMENT (CR-102, spec "Frontend -> The first deployment"): one short notice on
// the site and in Docs. It says that TOWN, with its address, was UpTown's first deployment, launched on
// 15 October 2026 and retired, and that the project's token is SKYLINE. The address is shown in full
// (never shortened, which a look-alike could imitate) and is not a link: the site never reads, links
// to or sends anything to the retired contracts. The words live in `content/docs.ts`.
import { RETIRED_NOTICE, RETIRED_TOWN_ADDRESS } from '../content/docs';

/** The notice: in the footer of every page (`footer`) and at the top of Docs (`docs`). */
export function RetiredNotice({ where }: { where: 'footer' | 'docs' }) {
  return (
    <p class={`retired-note retired-${where}`} data-retired="TOWN" role="note">
      {RETIRED_NOTICE.before}
      <code class="break">{RETIRED_TOWN_ADDRESS}</code>
      {RETIRED_NOTICE.after}
    </p>
  );
}
